import { Schema } from "effect";

/**
 * Money, rates and index levels as the Ministry writes them: exact decimals. Over the wire they
 * are strings (`"0.068"`, `"194.28509"`) so no digit is ever lost to floating point.
 */
export const Decimal = Schema.BigDecimalFromString.annotate({
  identifier: "Decimal",
  description: 'An exact decimal number as a string, e.g. "0.068" or "194.28509"',
});
export type Decimal = typeof Decimal.Type;

/** A calendar day with no time or zone, `YYYY-MM-DD`. */
export const CalendarDay = Schema.String.check(
  Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
)
  .annotate({
    identifier: "CalendarDay",
    description: "A calendar day, YYYY-MM-DD",
    examples: ["2036-08-25"],
  })
  .pipe(Schema.brand("CalendarDay"));
export type CalendarDay = typeof CalendarDay.Type;

/** A calendar month, `YYYY-MM`. */
export const YearMonth = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))
  .annotate({
    identifier: "YearMonth",
    description: "A calendar month, YYYY-MM",
    examples: ["2026-08"],
  })
  .pipe(Schema.brand("YearMonth"));
export type YearMonth = typeof YearMonth.Type;

/** An ISO 8601 duration made only of whole years or whole months, `P10Y` / `P3M`. */
export const Tenor = Schema.String.check(Schema.isPattern(/^P([1-9]\d*Y|[1-9]\d*M)$/))
  .annotate({
    identifier: "Tenor",
    description: "How long after purchase a Savings Bond matures, as an ISO 8601 duration",
    examples: ["P10Y", "P3M"],
  })
  .pipe(Schema.brand("Tenor"));
export type Tenor = typeof Tenor.Type;

export const Isin = Schema.String.check(Schema.isPattern(/^PL\d{10}$/))
  .annotate({ identifier: "Isin", examples: ["PL0000117024"] })
  .pipe(Schema.brand("Isin"));
export type Isin = typeof Isin.Type;

/** The code the Ministry gives a Series and everyone uses for it: `EDO0734`, `IZ0836`. */
export const SeriesCode = Schema.String.check(Schema.isPattern(/^[A-Z]{2,3}\d{4}$/))
  .annotate({
    identifier: "SeriesCode",
    description: "The Ministry's code for a Series",
    examples: ["EDO0734", "IZ0836"],
  })
  .pipe(Schema.brand("SeriesCode"));
export type SeriesCode = typeof SeriesCode.Type;
