import { Schema } from "effect";

/** One way a request failed to decode, e.g. `{ message: "Expected …", path: ["isin"] }`. */
export const Issue = Schema.Struct({
  message: Schema.String,
  path: Schema.Array(Schema.String),
}).annotate({ identifier: "Issue" });

/** A path or query parameter that does not decode; the issues are the schema's own. */
export class BadRequest extends Schema.TaggedError<BadRequest>()(
  "BadRequest",
  { issues: Schema.Array(Issue) },
  { httpApiStatus: 400 },
) {}

// Swap Effect's '_tag' for 'error' key
export const wireError = <
  E extends Schema.Top & { readonly fields: { readonly _tag: Schema.Top } },
>(
  error: E,
) => error.pipe(Schema.encodeKeys({ _tag: "error" }));
