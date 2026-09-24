import { Effect, Option, Schema } from "effect";
import {
  type Coupon,
  type RateKind,
  PeriodCouponRate,
  SaleWindow,
  SavingsBondSeries,
  type SavingsSeriesPrefix,
} from "../domain/bond.ts";
import { Isin, SeriesName, Tenor } from "../domain/primitives.ts";
import { DayCell, DecimalCell, optionalCell, TenorCell } from "./cells.ts";
import { type Cell, Table, Workbook, WorkbookError } from "./workbook.ts";

/**
 * The Ministry's retail-bonds file (`Dane_dotyczace_obligacji_detalicznych.xls`): one sheet per
 * Series Prefix, one row per Series. Eleven Series Prefixes are read; KOS (rates written as prose) and the
 * 1990s IR, RS, TZ, SP (auction tables) are named in CONTEXT.md and skipped here — listed so that
 * a sheet we have never seen fails loudly.
 */

export class SavingsBonds extends Schema.Class<SavingsBonds>("SavingsBonds")({
  series: Schema.Array(SavingsBondSeries),
}) {}

/** `"tenor"`: one Coupon Period for the whole life, so its length is the Series' tenor (OTS, POS). */
type CouponShape =
  | { readonly schedule: "fixed"; readonly periodLength: Tenor | "tenor" }
  | {
      readonly schedule: "per-period";
      readonly periodLength: Tenor;
      readonly reference: "Marża" | "Mnożnik";
    };

interface PrefixSpec {
  readonly prefix: SavingsSeriesPrefix;
  readonly tenors: ReadonlyArray<Tenor>;
  readonly headerRows: 1 | 2;
  readonly rate: RateKind;
  readonly capitalises: boolean;
  readonly shape: CouponShape;
}

const tenor = (value: string) => Tenor.make(value);
const fixed = (periodLength: Tenor | "tenor"): CouponShape => ({ schedule: "fixed", periodLength });
const yearly = (reference: "Marża" | "Mnożnik"): CouponShape => ({
  schedule: "per-period",
  periodLength: tenor("P1Y"),
  reference,
});
const monthly: CouponShape = {
  schedule: "per-period",
  periodLength: tenor("P1M"),
  reference: "Marża",
};

/** What the letters of issue fix per Series Prefix and the file does not spell out. */
const PREFIXES: ReadonlyArray<PrefixSpec> = [
  {
    prefix: "OTS",
    tenors: [tenor("P3M")],
    headerRows: 1,
    rate: "fixed",
    capitalises: false,
    shape: fixed("tenor"),
  },
  {
    prefix: "ROR",
    tenors: [tenor("P1Y")],
    headerRows: 2,
    rate: "floating",
    capitalises: false,
    shape: monthly,
  },
  {
    prefix: "DOR",
    tenors: [tenor("P2Y")],
    headerRows: 2,
    rate: "floating",
    capitalises: false,
    shape: monthly,
  },
  {
    prefix: "TOS",
    tenors: [tenor("P3Y")],
    headerRows: 1,
    rate: "fixed",
    capitalises: true,
    shape: fixed(tenor("P1Y")),
  },
  {
    prefix: "COI",
    tenors: [tenor("P4Y")],
    headerRows: 2,
    rate: "inflation-indexed",
    capitalises: false,
    shape: yearly("Marża"),
  },
  {
    prefix: "EDO",
    tenors: [tenor("P10Y")],
    headerRows: 2,
    rate: "inflation-indexed",
    capitalises: true,
    shape: yearly("Marża"),
  },
  {
    prefix: "ROS",
    tenors: [tenor("P6Y")],
    headerRows: 2,
    rate: "inflation-indexed",
    capitalises: true,
    shape: yearly("Marża"),
  },
  {
    prefix: "ROD",
    tenors: [tenor("P12Y")],
    headerRows: 2,
    rate: "inflation-indexed",
    capitalises: true,
    shape: yearly("Marża"),
  },
  {
    prefix: "DOS",
    tenors: [tenor("P2Y")],
    headerRows: 1,
    rate: "fixed",
    capitalises: true,
    shape: fixed(tenor("P1Y")),
  },
  {
    prefix: "TOZ",
    tenors: [tenor("P3Y")],
    headerRows: 2,
    rate: "floating",
    capitalises: false,
    shape: { schedule: "per-period", periodLength: tenor("P6M"), reference: "Mnożnik" },
  },
  {
    prefix: "POS",
    tenors: [tenor("P10M"), tenor("P12M")],
    headerRows: 1,
    rate: "fixed",
    capitalises: false,
    shape: fixed("tenor"),
  },
];

/** Skipped by name: see above, plus the file's own description and dictionary sheets. */
const SKIPPED_SHEETS = ["KOS", "IR", "RS", "TZ", "SP", "Opis", "Dictionary"];

const SeriesRow = Schema.Struct({
  Seria: SeriesName,
  "Kod ISIN": Isin,
  "Data wykupu": TenorCell,
  "Początek sprzedaży": DayCell,
  "Koniec sprzedaży": DayCell,
  "Cena emisyjna": DecimalCell,
  "Cena zamiany": optionalCell(DecimalCell),
  "Sprzedaż łączna (mln zł)": optionalCell(DecimalCell),
  "w tym zamiana (mln zł)": optionalCell(DecimalCell),
});

const FixedRateRow = Schema.Struct({ Oprocentowanie: DecimalCell });
const PERIOD_RATE_COLUMN = /^Oprocentowanie \/ w (\d+)\. (?:roku|okresie)$/;
const OptionalDecimal = optionalCell(DecimalCell);

export const parseSavingsBonds = Effect.fn("parseSavingsBonds")(function* (bytes: Uint8Array) {
  const workbook = yield* Workbook.fromBytes(bytes);
  const known = new Set<string>([...PREFIXES.map((spec) => spec.prefix), ...SKIPPED_SHEETS]);
  const unknown = workbook.sheetNames.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    return yield* new WorkbookError({ message: `Unexpected sheets: ${unknown.join(", ")}` });
  }
  const series: Array<SavingsBondSeries> = [];
  for (const spec of PREFIXES) series.push(...(yield* parseSheet(workbook, spec)));
  return new SavingsBonds({ series });
});

const parseSheet = Effect.fn("parseSheet")(function* (workbook: Workbook, spec: PrefixSpec) {
  const table = yield* Table.fromSheet(yield* workbook.sheet(spec.prefix), spec.headerRows);
  const periodColumns = groupColumns(table.columns, PERIOD_RATE_COLUMN);
  if (spec.shape.schedule === "per-period" && periodColumns.length === 0) {
    return yield* new WorkbookError({
      message: `Sheet "${spec.prefix}" has no per-period rate columns`,
    });
  }
  const series: Array<SavingsBondSeries> = [];
  for (const record of table.records) {
    const row = yield* table.decode(record, SeriesRow);
    if (!row.Seria.startsWith(spec.prefix)) {
      return yield* new WorkbookError({
        message: `Sheet "${spec.prefix}": row ${row.Seria} is not a ${spec.prefix} series`,
      });
    }
    if (!spec.tenors.includes(row["Data wykupu"])) {
      return yield* new WorkbookError({
        message: `Sheet "${spec.prefix}": ${row.Seria} matures after ${row["Data wykupu"]}, not ${spec.tenors.join("/")}`,
      });
    }
    const coupon = yield* readCoupon(
      table,
      record,
      spec.shape,
      periodColumns,
      row.Seria,
      row["Data wykupu"],
    );
    series.push(
      new SavingsBondSeries({
        family: "savings",
        series: row.Seria,
        prefix: spec.prefix,
        isin: row["Kod ISIN"],
        rateKind: spec.rate,
        nominalKind: "fixed",
        capitalises: spec.capitalises,
        tenor: row["Data wykupu"],
        saleWindow: new SaleWindow({
          from: row["Początek sprzedaży"],
          to: row["Koniec sprzedaży"],
        }),
        issuePrice: row["Cena emisyjna"],
        switchingPrice: row["Cena zamiany"],
        totalSaleMlnPln: row["Sprzedaż łączna (mln zł)"],
        switchedMlnPln: row["w tym zamiana (mln zł)"],
        coupon,
      }),
    );
  }
  return series;
});

const readCoupon = Effect.fn("readCoupon")(function* (
  table: Table,
  record: Readonly<Record<string, Cell>>,
  shape: CouponShape,
  periodColumns: ReadonlyArray<[number, string]>,
  series: SeriesName,
  tenorOfSeries: Tenor,
): Effect.fn.Return<Coupon, WorkbookError> {
  if (shape.schedule === "fixed") {
    const { Oprocentowanie } = yield* table.decode(record, FixedRateRow);
    return {
      schedule: "fixed",
      rate: Oprocentowanie,
      periodLength: shape.periodLength === "tenor" ? tenorOfSeries : shape.periodLength,
    };
  }
  const reference = yield* table.decodeCell(record, shape.reference, OptionalDecimal);
  return {
    schedule: "per-period",
    periodLength: shape.periodLength,
    rates: yield* periodRates(table, record, periodColumns, series),
    margin: shape.reference === "Marża" ? reference : Option.none(),
    multiplier: shape.reference === "Mnożnik" ? reference : Option.none(),
  };
});

/** Announced periods in order; the first blank ends the list and everything after it must be blank too. */
const periodRates = Effect.fn("periodRates")(function* (
  table: Table,
  record: Readonly<Record<string, Cell>>,
  columns: ReadonlyArray<[number, string]>,
  series: SeriesName,
) {
  const rates: Array<PeriodCouponRate> = [];
  let announced = true;
  for (const [period, column] of columns) {
    const value = yield* table.decodeCell(record, column, OptionalDecimal);
    if (Option.isNone(value)) {
      announced = false;
      continue;
    }
    if (!announced) {
      return yield* new WorkbookError({
        message: `Sheet "${table.sheet}": ${series} has a rate for period ${period} after a blank one`,
      });
    }
    rates.push(new PeriodCouponRate({ period, rate: value.value }));
  }
  return rates;
});

const groupColumns = (columns: ReadonlyArray<string>, pattern: RegExp) =>
  columns
    .flatMap((column): Array<[number, string]> => {
      const match = pattern.exec(column);
      return match === null ? [] : [[Number(match[1]), column]];
    })
    .toSorted(([a], [b]) => a - b);
