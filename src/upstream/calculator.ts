import { Effect, Option, Schema } from "effect";
import {
  BondType,
  type Coupon,
  DatedCouponPeriod,
  PeriodCouponRate,
  WholesaleBondSeries,
  WholesaleBondTypeCode,
  type WholesaleBondTypeCode as WholesaleBondTypeCodeType,
} from "../domain/bond.ts";
import { Isin, SeriesCode, Tenor } from "../domain/primitives.ts";
import { MonthlyReferenceIndex } from "../domain/reference-index.ts";
import { DayCell, DecimalCell, MonthCell, optionalCell } from "./cells.ts";
import { type Cell, Table, Workbook, WorkbookError } from "./workbook.ts";

/**
 * The Ministry's coupon calculator (`kalkulatorodsetek.xlsm`): the inflation series and the
 * Wholesale Bonds — inflation-linked (`Indeksowane`), fixed-rate (`Stałe`) and floating-rate
 * (`Zmienne`). `WVH` (the POLSTR index) is out of scope and the eight 1990s `PPT1__`…`PPT8__` rows
 * have no proper series code; both are skipped by name so anything unexpected fails loudly.
 */

export class Calculator extends Schema.Class<Calculator>("Calculator")({
  referenceIndex: Schema.Array(MonthlyReferenceIndex),
  types: Schema.Array(BondType),
  series: Schema.Array(WholesaleBondSeries),
}) {}

const SHEETS = {
  referenceIndex: "Dane CPI",
  wholesale: [
    {
      name: "Indeksowane",
      description: "Inflation-linked bonds",
      rate: "fixed",
      nominal: "inflation-indexed",
      types: ["IZ"],
    },
    {
      name: "Stałe",
      description: "Fixed rate bonds",
      rate: "fixed",
      nominal: "fixed",
      types: ["OS", "PS", "DS", "WS", "AS", "TK", "CK", "PK", "DK", "SP"],
    },
    {
      name: "Zmienne",
      description: "Floating rate bonds",
      rate: "floating",
      nominal: "fixed",
      types: ["TZ", "WZ", "DZ", "PP", "NZ"],
    },
  ] as const satisfies ReadonlyArray<{
    name: string;
    /** The Ministry's own English for the category (gov.pl/web/finance). */
    description: string;
    rate: BondType["rate"];
    nominal: BondType["nominal"];
    types: ReadonlyArray<WholesaleBondTypeCodeType>;
  }>,
  ignored: ["Kalkulator odsetek", "WVH"],
} as const;
type WholesaleSheet = (typeof SHEETS.wholesale)[number];

/** 1990s rows with no proper series code. */
const SKIPPED_ROW = /^PPT\d__$/;

const ReferenceIndexRow = Schema.Struct({
  "Miesiąc / n": MonthCell,
  "Wskaźnik referencyjny / WRk": DecimalCell,
  "Wskaźnik miesięczny / Wn": DecimalCell,
});

const SeriesRow = Schema.Struct({
  Seria: SeriesCode,
  "Kod ISIN": Isin,
  Wykup: DayCell,
});
const FixedCouponRow = Schema.Struct({ Kupon: DecimalCell });
const IndexedRow = Schema.Struct({
  "Data emisji": DayCell,
  "Bazowy wskaźnik referencyjny": DecimalCell,
});

const PeriodDates = Schema.Struct({
  "Początek okresu": optionalCell(DayCell),
  "Koniec okresu": optionalCell(DayCell),
  "Dzień ustalenia praw": optionalCell(DayCell),
  "Data wymagalności": optionalCell(DayCell),
});
/** A floating rate not yet set is written as the text `POLSTR` (the reference it will follow). */
const OptionalRate = Schema.Union([optionalCell(DecimalCell), Schema.Literal("POLSTR")]);

const PERIOD_COLUMN = /^Kupon #(\d+) \/ (.+)$/;

export const parseCalculator = Effect.fn("parseCalculator")(function* (bytes: Uint8Array) {
  const workbook = yield* Workbook.fromBytes(bytes);
  const known = new Set<string>([
    SHEETS.referenceIndex,
    ...SHEETS.wholesale.map((sheet) => sheet.name),
    ...SHEETS.ignored,
  ]);
  const unknown = workbook.sheetNames.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    return yield* new WorkbookError({ message: `Unexpected sheets: ${unknown.join(", ")}` });
  }

  const referenceIndex = yield* parseReferenceIndex(workbook);
  const types: Array<BondType> = [];
  const series: Array<WholesaleBondSeries> = [];
  for (const sheet of SHEETS.wholesale) {
    for (const code of sheet.types) {
      types.push(
        new BondType({
          code,
          family: "wholesale",
          description: sheet.description,
          rate: sheet.rate,
          nominal: sheet.nominal,
          capitalises: false,
        }),
      );
    }
    series.push(...(yield* parseWholesale(workbook, sheet)));
  }
  return new Calculator({ referenceIndex, types, series });
});

const parseReferenceIndex = Effect.fn("parseReferenceIndex")(function* (workbook: Workbook) {
  const table = yield* Table.fromSheet(yield* workbook.sheet(SHEETS.referenceIndex), 2);
  const rows = yield* Effect.forEach(table.records, (record) =>
    table.decode(record, ReferenceIndexRow),
  );
  const months = rows.map(
    (row) =>
      new MonthlyReferenceIndex({
        month: row["Miesiąc / n"],
        rate: row["Wskaźnik referencyjny / WRk"],
        referenceIndex: row["Wskaźnik miesięczny / Wn"],
      }),
  );
  for (let i = 1; i < months.length; i++) {
    const previous = months[i - 1]!.month;
    const current = months[i]!.month;
    if (nextMonth(previous) !== current) {
      return yield* new WorkbookError({
        message: `Sheet "${table.sheet}": months ${previous} and ${current} are not consecutive`,
      });
    }
  }
  return months;
});

const parseWholesale = Effect.fn("parseWholesale")(function* (
  workbook: Workbook,
  sheet: WholesaleSheet,
) {
  const table = yield* Table.fromSheet(yield* workbook.sheet(sheet.name), 2);
  const periodColumns = groupColumns(table.columns, PERIOD_COLUMN);
  const types: ReadonlyArray<string> = sheet.types;
  const bonds: Array<WholesaleBondSeries> = [];
  for (const record of table.records) {
    const code = record[table.columns[0]!];
    if (typeof code === "string" && SKIPPED_ROW.test(code)) continue;
    const row = yield* table.decode(record, SeriesRow);
    const type = yield* Schema.decodeUnknownEffect(WholesaleBondTypeCode)(
      row.Seria.replace(/\d+$/, ""),
    ).pipe(
      Effect.filterOrFail(
        (type) => types.includes(type),
        () => undefined,
      ),
      Effect.mapError(
        () =>
          new WorkbookError({
            message: `Sheet "${sheet.name}": ${row.Seria} is not one of ${types.join(", ")}`,
          }),
      ),
    );
    const periods = yield* couponPeriods(table, record, periodColumns, row.Seria, sheet.rate);
    const periodLength = regularPeriodLength(periods.dated);
    const coupon: Coupon =
      sheet.rate === "floating"
        ? {
            schedule: "per-period",
            periodLength,
            rates: periods.rates,
            margin: Option.none(),
            multiplier: Option.none(),
          }
        : {
            schedule: "fixed",
            rate: (yield* table.decode(record, FixedCouponRow)).Kupon,
            periodLength,
          };
    const indexed =
      sheet.nominal === "inflation-indexed"
        ? Option.some(yield* table.decode(record, IndexedRow))
        : Option.none();
    const firstPeriod = periods.dated[0];
    if (firstPeriod === undefined) {
      return yield* new WorkbookError({
        message: `Sheet "${sheet.name}": ${row.Seria} has no coupon periods`,
      });
    }
    bonds.push(
      new WholesaleBondSeries({
        family: "wholesale",
        code: row.Seria,
        type,
        isin: row["Kod ISIN"],
        issueDay: Option.match(indexed, {
          onSome: (i) => i["Data emisji"],
          onNone: () => firstPeriod.start,
        }),
        maturity: row.Wykup,
        coupon,
        baseReferenceIndex: Option.map(indexed, (i) => i["Bazowy wskaźnik referencyjny"]),
        couponPeriods: periods.dated,
      }),
    );
  }
  return bonds;
});

/** The dated periods of a row, and (for floating types) the rate announced for each. */
const couponPeriods = Effect.fn("couponPeriods")(function* (
  table: Table,
  record: Readonly<Record<string, Cell>>,
  periodColumns: ReadonlyArray<[number, Record<string, string>]>,
  code: SeriesCode,
  rate: BondType["rate"],
) {
  const dated: Array<DatedCouponPeriod> = [];
  const rates: Array<PeriodCouponRate> = [];
  for (const [number, columns] of periodColumns) {
    const cells = yield* table.decode(pick(record, columns), PeriodDates, code);
    const dates = [
      cells["Początek okresu"],
      cells["Koniec okresu"],
      cells["Dzień ustalenia praw"],
      cells["Data wymagalności"],
    ];
    if (dates.every(Option.isNone)) continue;
    if (!dates.every(Option.isSome)) {
      return yield* new WorkbookError({
        message: `Sheet "${table.sheet}": ${code} coupon period ${number} is partly blank`,
      });
    }
    dated.push(
      new DatedCouponPeriod({
        period: number,
        start: dates[0]!.value,
        end: dates[1]!.value,
        recordDay: dates[2]!.value,
        paymentDate: dates[3]!.value,
      }),
    );
    if (rate === "floating") {
      const rate = yield* table.decodeCell(record, columns["Oprocentowanie"]!, OptionalRate);
      if (rate !== "POLSTR" && Option.isSome(rate)) {
        rates.push(new PeriodCouponRate({ period: number, rate: rate.value }));
      }
    }
  }
  return { dated, rates };
});

/**
 * The length of a regular Coupon Period, read off the dated periods: the most common start→end
 * span, rounded to whole months. First and last periods are often short stubs; the mode ignores
 * them. `P12M` is written `P1Y`.
 */
const regularPeriodLength = (periods: ReadonlyArray<DatedCouponPeriod>): Tenor => {
  const counts = new Map<number, number>();
  for (const period of periods) {
    const months = monthsBetween(period.start, period.end);
    counts.set(months, (counts.get(months) ?? 0) + 1);
  }
  const [months] = [...counts.entries()].toSorted(([, a], [, b]) => b - a)[0] ?? [12];
  return Tenor.make(months % 12 === 0 ? `P${months / 12}Y` : `P${months}M`);
};

/** Whole months between two `YYYY-MM-DD` days, rounded to the nearest month, at least one. */
const part = (day: string, at: number) => Number(day.slice(at, at + (at === 0 ? 4 : 2)));
const monthsBetween = (from: string, to: string) => {
  const whole = (part(to, 0) - part(from, 0)) * 12 + (part(to, 5) - part(from, 5));
  const days = part(to, 8) - part(from, 8);
  return Math.max(1, days >= 15 ? whole + 1 : days <= -15 ? whole - 1 : whole);
};

/** Columns named `<group> #<n> / <member>` collected per `n`, as `member → column name`. */
const groupColumns = (columns: ReadonlyArray<string>, pattern: RegExp) => {
  const groups = new Map<number, Record<string, string>>();
  for (const column of columns) {
    const match = pattern.exec(column);
    if (match === null) continue;
    const number = Number(match[1]);
    const members = groups.get(number) ?? {};
    members[match[2]!] = column;
    groups.set(number, members);
  }
  return [...groups.entries()].toSorted(([a], [b]) => a - b);
};

const pick = (record: Readonly<Record<string, Cell>>, columns: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(columns).map(([member, column]) => [member, record[column] ?? null]),
  );

const nextMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
};
