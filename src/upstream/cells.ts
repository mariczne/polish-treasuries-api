import { BigDecimal, DateTime, Effect, Schema, SchemaGetter, SchemaIssue } from "effect";
import { CalendarDate, Decimal, Duration, YearMonth } from "../domain/primitives.ts";

/**
 * How a raw spreadsheet cell becomes a domain value. Decode-only: nothing is ever written back to
 * a sheet.
 */

/** Excel's day 25569 is 1970-01-01; both Ministry files use the 1900 date system. */
const UNIX_EPOCH_SERIAL = 25569;
const MS_PER_DAY = 86_400_000;

const invalid = (expected: string) =>
  new SchemaIssue.InvalidValue({ message: `Expected ${expected}` });

const serialToIsoDate = (serial: number) =>
  DateTime.formatIsoDateUtc(DateTime.makeUnsafe((serial - UNIX_EPOCH_SERIAL) * MS_PER_DAY));

/** An Excel date serial (`49912`) to a CalendarDate (`2036-08-25`). */
export const DateCell = Schema.Finite.pipe(
  Schema.decodeTo(CalendarDate, {
    decode: SchemaGetter.transformEffect((serial: number) =>
      Number.isInteger(serial) && serial > 0
        ? Effect.succeed(serialToIsoDate(serial))
        : Effect.fail(invalid("an Excel date serial")),
    ),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

/** An Excel date serial for the first of a month (`46235`) to a YearMonth (`2026-08`). */
export const MonthCell = Schema.Finite.pipe(
  Schema.decodeTo(YearMonth, {
    decode: SchemaGetter.transformEffect((serial: number) => {
      if (!Number.isInteger(serial) || serial <= 0) {
        return Effect.fail(invalid("an Excel date serial"));
      }
      const iso = serialToIsoDate(serial);
      return iso.endsWith("-01")
        ? Effect.succeed(iso.slice(0, 7))
        : Effect.fail(invalid("the first day of a month"));
    }),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

/**
 * A numeric cell to an exact decimal. Excel stores doubles, so `0.06` arrives as
 * `0.060000000000000005`; twelve significant digits is far more than any Ministry figure has and
 * far fewer than where the noise starts.
 */
export const DecimalCell = Schema.Finite.pipe(
  Schema.decodeTo(Decimal, {
    decode: SchemaGetter.transform((n: number) =>
      BigDecimal.format(BigDecimal.normalize(BigDecimal.fromStringUnsafe(n.toPrecision(12)))),
    ),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

const TENOR_TEXT = /^(\d+)\s+(lat\/a|lat|rok|miesiące|miesięcy|miesiąc)\s+od dnia zakupu$/;

/** The Ministry's maturity rule (`10 lat/a od dnia zakupu`) to a Duration (`P10Y`). */
export const TenorCell = Schema.String.pipe(
  Schema.decodeTo(Duration, {
    decode: SchemaGetter.transformEffect((text: string) => {
      const match = TENOR_TEXT.exec(text.replace(/\s+/g, " ").trim());
      if (match === null) return Effect.fail(invalid("a maturity rule counted from purchase"));
      const unit = match[2]?.startsWith("m") ? "M" : "Y";
      return Effect.succeed(`P${match[1]}${unit}`);
    }),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

/** A cell that may be blank: blank (`null`) is `None`, anything else must decode. */
export const optionalCell = <S extends Schema.Top>(schema: S) => Schema.OptionFromNullOr(schema);
