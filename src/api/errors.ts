import { Schema } from "effect";
import { Isin, SeriesCode } from "../domain/primitives.ts";

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  {},
  { httpApiStatus: 404 },
) {}

/**
 * An ISIN should uniquely identify one Series, but the source file currently repeats two:
 * PL0000113890 (TOS0825, DOS0823) and PL0000107280 (COI1116, TOZ1115).
 * We serve the file as it is, upstream's data is broken, so we serve IsinConflict
 */
export class IsinConflict extends Schema.TaggedError<IsinConflict>()(
  "IsinConflict",
  { isin: Isin, codes: Schema.Array(SeriesCode) },
  {
    httpApiStatus: 502,
  },
) {}

// Swap Effect's '_tag' for 'error' key
export const wireError = <
  E extends Schema.Top & { readonly fields: { readonly _tag: Schema.Top } },
>(
  error: E,
) => error.pipe(Schema.encodeKeys({ _tag: "error" }));
