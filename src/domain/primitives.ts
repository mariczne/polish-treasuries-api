import { Schema } from "effect";

/** Money, rates and index levels. Strings over the wire, so no digit is lost to floating point. */
export const Decimal = Schema.BigDecimalFromString.pipe(
  Schema.annotateEncoded({
    identifier: "Decimal",
    description: "Exact decimal, as a string",
    examples: ["0.068", "194.28509"],
  }),
);
export type Decimal = typeof Decimal.Type;

/** A calendar date with no time or zone, `YYYY-MM-DD`. */
export const CalendarDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
)
  .annotate({
    identifier: "CalendarDate",
    description: "YYYY-MM-DD",
    examples: ["2036-08-25"],
  })
  .pipe(Schema.brand("CalendarDate"));
export type CalendarDate = typeof CalendarDate.Type;

/** A calendar month, `YYYY-MM`. */
export const YearMonth = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))
  .annotate({
    identifier: "YearMonth",
    description: "YYYY-MM",
    examples: ["2026-08"],
  })
  .pipe(Schema.brand("YearMonth"));
export type YearMonth = typeof YearMonth.Type;

/** An ISO 8601 duration made only of whole years or whole months, `P10Y` / `P3M`. */
export const Duration = Schema.String.check(Schema.isPattern(/^P([1-9]\d*Y|[1-9]\d*M)$/))
  .annotate({
    identifier: "Duration",
    description: "ISO 8601, whole years or months",
    examples: ["P10Y", "P3M"],
  })
  .pipe(Schema.brand("Duration"));
export type Duration = typeof Duration.Type;

export const Isin = Schema.String.check(Schema.isPattern(/^PL\d{10}$/))
  .annotate({ identifier: "Isin", examples: ["PL0000117081", "PL0000117743"] })
  .pipe(Schema.brand("Isin"));
export type Isin = typeof Isin.Type;

/** CONTEXT.md "Series Name": the Series Prefix, then the month and year of maturity. */
export const SeriesName = Schema.String.check(Schema.isPattern(/^[A-Z]{2,3}\d{4}$/))
  .annotate({
    identifier: "SeriesName",
    description: "Prefix, then maturity month and year",
    examples: ["EDO0734", "IZ0831"],
  })
  .pipe(Schema.brand("SeriesName"));
export type SeriesName = typeof SeriesName.Type;
