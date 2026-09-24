import { Effect, Option, Schema } from "effect";
import {
  DatedCouponPeriod,
  PeriodCouponRate,
  type WholesaleCoupon,
  type WholesaleNominal,
  WholesaleBondSeries,
  WholesaleSeriesPrefix,
} from "../domain/bond.ts";
import { Isin, SeriesName, Tenor } from "../domain/primitives.ts";
import { InflationMonth } from "../domain/reference-index.ts";
import { DayCell, DecimalCell, MonthCell, optionalCell } from "./cells.ts";
import { type Cell, Table, Workbook, WorkbookError } from "./workbook.ts";

/**
 * The Ministry's coupon calculator (`kalkulatorodsetek.xlsm`): the inflation series and the
 * Wholesale Bonds — inflation-linked (`Indeksowane`), fixed-rate (`Stałe`) and floating-rate
 * (`Zmienne`). `WVH` (the POLSTR index) is out of scope and the eight 1990s `PPT1__`…`PPT8__` rows
 * have no proper series code; both are skipped by name so anything unexpected fails loudly.
 */

export class Calculator extends Schema.Class<Calculator>("Calculator")({
  referenceIndex: Schema.Array(InflationMonth),
  series: Schema.Array(WholesaleBondSeries),
}) {}

const SHEETS = {
  referenceIndex: "Dane CPI",
  wholesale: [
    {
      name: "Indeksowane",
      rate: "fixed",
      nominal: "inflation-indexed",
      prefixes: ["IZ"],
    },
    {
      name: "Stałe",
      rate: "fixed",
      nominal: "fixed",
      prefixes: ["OS", "PS", "DS", "WS", "AS", "TK", "CK", "PK", "DK", "SP"],
    },
    {
      name: "Zmienne",
      rate: "floating",
      nominal: "fixed",
      prefixes: ["TZ", "WZ", "DZ", "PP", "NZ"],
    },
  ] as const satisfies ReadonlyArray<{
    name: string;
    rate: "fixed" | "floating";
    nominal: WholesaleNominal["kind"];
    prefixes: ReadonlyArray<WholesaleSeriesPrefix>;
  }>,
  ignored: ["Kalkulator odsetek", "WVH"],
} as const;
type WholesaleSheet = (typeof SHEETS.wholesale)[number];

/** 1990s rows with no proper Series Name. */
const SKIPPED_ROW = /^PPT\d__$/;

const ReferenceIndexRow = Schema.Struct({
  "Miesiąc / n": MonthCell,
  "Wskaźnik referencyjny / WRk": DecimalCell,
  "Wskaźnik miesięczny / Wn": DecimalCell,
});

const SeriesRow = Schema.Struct({
  Seria: SeriesName,
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
  const series: Array<WholesaleBondSeries> = [];
  for (const sheet of SHEETS.wholesale) series.push(...(yield* parseWholesale(workbook, sheet)));
  return new Calculator({ referenceIndex, series });
});

const parseReferenceIndex = Effect.fn("parseReferenceIndex")(function* (workbook: Workbook) {
  const table = yield* Table.fromSheet(yield* workbook.sheet(SHEETS.referenceIndex), 2);
  const rows = yield* Effect.forEach(table.records, (record) =>
    table.decode(record, ReferenceIndexRow),
  );
  // The sheet's labels mislead: the monthly change is headed "Wskaźnik referencyjny" (WRk) and
  // the chained level "Wskaźnik miesięczny" (Wn), not the other way round (CONTEXT.md)
  const months = rows.map(
    (row) =>
      new InflationMonth({
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
  const prefixes: ReadonlyArray<string> = sheet.prefixes;
  const bonds: Array<WholesaleBondSeries> = [];
  for (const record of table.records) {
    const name = record[table.columns[0]!];
    if (typeof name === "string" && SKIPPED_ROW.test(name)) continue;
    const row = yield* table.decode(record, SeriesRow);
    const prefix = yield* Schema.decodeUnknownEffect(WholesaleSeriesPrefix)(
      row.Seria.replace(/\d+$/, ""),
    ).pipe(
      Effect.filterOrFail(
        (prefix) => prefixes.includes(prefix),
        () => undefined,
      ),
      Effect.mapError(
        () =>
          new WorkbookError({
            message: `Sheet "${sheet.name}": ${row.Seria} is not one of ${prefixes.join(", ")}`,
          }),
      ),
    );
    const periods = yield* couponPeriods(table, record, periodColumns, row.Seria, sheet.rate);
    const periodLength = regularPeriodLength(periods.dated);
    const coupon: WholesaleCoupon =
      sheet.rate === "floating"
        ? { schedule: "per-period", periodLength, rates: periods.rates }
        : {
            schedule: "fixed",
            rate: (yield* table.decode(record, FixedCouponRow)).Kupon,
            periodLength,
          };
    const firstPeriod = periods.dated[0];
    if (firstPeriod === undefined) {
      return yield* new WorkbookError({
        message: `Sheet "${sheet.name}": ${row.Seria} has no coupon periods`,
      });
    }
    const indexed =
      sheet.nominal === "inflation-indexed"
        ? Option.some(yield* table.decode(record, IndexedRow))
        : Option.none();
    bonds.push(
      new WholesaleBondSeries({
        family: "wholesale",
        series: row.Seria,
        prefix,
        isin: row["Kod ISIN"],
        issueDay: Option.match(indexed, {
          onSome: (i) => i["Data emisji"],
          onNone: () => firstPeriod.start,
        }),
        maturity: row.Wykup,
        nominal: Option.match(indexed, {
          onSome: (i): WholesaleNominal => ({
            kind: "inflation-indexed",
            baseReferenceIndex: i["Bazowy wskaźnik referencyjny"],
          }),
          onNone: (): WholesaleNominal => ({ kind: "fixed" }),
        }),
        coupon,
        couponPeriods: periods.dated,
      }),
    );
  }
  return bonds;
});

/** The dated periods of a row, and (for floating-rate Series) the rate announced for each. */
const couponPeriods = Effect.fn("couponPeriods")(function* (
  table: Table,
  record: Readonly<Record<string, Cell>>,
  periodColumns: ReadonlyArray<[number, Record<string, string>]>,
  series: SeriesName,
  rate: WholesaleSheet["rate"],
) {
  const dated: Array<DatedCouponPeriod> = [];
  const rates: Array<PeriodCouponRate> = [];
  for (const [number, columns] of periodColumns) {
    const cells = yield* table.decode(pick(record, columns), PeriodDates, series);
    const dates = [
      cells["Początek okresu"],
      cells["Koniec okresu"],
      cells["Dzień ustalenia praw"],
      cells["Data wymagalności"],
    ];
    if (dates.every(Option.isNone)) continue;
    if (!dates.every(Option.isSome)) {
      return yield* new WorkbookError({
        message: `Sheet "${table.sheet}": ${series} coupon period ${number} is partly blank`,
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
