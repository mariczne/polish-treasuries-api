import { Predicate, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  OpenApi,
} from "effect/unstable/httpapi";
import { BondSeries, Family, SeriesPrefix } from "../domain/bond.ts";
import { Isin, SeriesName, YearMonth } from "../domain/primitives.ts";
import { InflationMonth } from "../domain/reference-index.ts";
import { FileStatus } from "../treasuries.ts";
import { BadRequest, wireError } from "./errors.ts";
import { bondsExample, healthExample, inflationExample } from "./examples.ts";

/**
 * The API as clients see it. Every read is a list, narrowed by its query; nothing matching
 * is `[]`, not an error, and only a malformed parameter is (400). Every endpoint also answers as a
 * table when the path ends in `.csv` or `.tsv` (see `table-suffix.ts`); only the JSON paths are
 * documented.
 */

/** Data changes at most once a day, so its reads are public and cacheable; `/health` is not. */
export class Cached extends HttpApiMiddleware.Service<Cached>()("api/Cached") {}

/** Turns Effect's empty 400 for a parameter that does not decode into a `BadRequest`. */
export class BadRequests extends HttpApiMiddleware.Service<BadRequests>()("api/BadRequests", {
  error: wireError(BadRequest),
}) {}

export const Year = Schema.String.check(Schema.isPattern(/^\d{4}$/))
  .annotate({ identifier: "Year", description: "YYYY", examples: ["2026"] })
  .pipe(Schema.brand("Year"));

/** A year (`2026`) or a month (`2026-02`). */
export const Period = Schema.Union([Year, YearMonth]).annotate({
  identifier: "Period",
  description: "A year (YYYY) or a month (YYYY-MM)",
});
export type Period = typeof Period.Type;

export class InflationApi extends HttpApiGroup.make("inflation")
  .add(
    HttpApiEndpoint.get("list", "/inflation", {
      query: { period: Schema.optionalKey(Period) },
      success: Schema.Array(InflationMonth).pipe(
        Schema.annotateEncoded({ examples: [inflationExample] }),
      ),
    })
      .middleware(BadRequests)
      .annotateMerge(
        OpenApi.annotations({
          description:
            "Monthly inflation since July 2003, optionally for one year or month (`?period=2026`, `?period=2026-02`). `referenceIndex` is cumulative, June 2003 = 100.",
        }),
      ),
  )
  .middleware(Cached)
  .annotateMerge(
    OpenApi.annotations({
      title: "Inflation",
      description: [
        "The inflation index that inflation-linked bonds use.",
        "",
        "_Note: it differs from the CPI reported by GUS. Every March GUS can revise its figure for January; the Ministry keeps the figure it first fixed._",
      ].join("\n"),
    }),
  ) {}

export class BondsApi extends HttpApiGroup.make("bonds")
  .add(
    HttpApiEndpoint.get("list", "/bonds", {
      query: {
        series: Schema.optionalKey(SeriesName),
        prefix: Schema.optionalKey(SeriesPrefix),
        family: Schema.optionalKey(Family),
        isin: Schema.optionalKey(Isin),
      },
      success: Schema.Array(BondSeries).pipe(Schema.annotateEncoded({ examples: [bondsExample] })),
    })
      .middleware(BadRequests)
      .annotateMerge(
        OpenApi.annotations({
          description:
            "All series, or those matching every filter given (`?series=EDO0734&family=savings`).",
        }),
      ),
  )
  .middleware(Cached)
  .annotateMerge(
    OpenApi.annotations({
      title: "Bonds",
      description: "Bond series and their terms.",
    }),
  ) {}

export class Health extends Schema.Class<Health>("Health")({
  status: Schema.Literal("ok"),
  monthCount: Schema.Int,
  latestMonth: Schema.NullOr(YearMonth),
  prefixCount: Schema.Int,
  seriesCount: Schema.Int,
  /** Per source file: where the served copy came from and how the last download went. */
  files: Schema.Array(FileStatus),
}) {}

export class SystemApi extends HttpApiGroup.make("system")
  .add(
    HttpApiEndpoint.get("health", "/health", {
      success: Health.pipe(Schema.annotateEncoded({ examples: [healthExample] })),
    }).annotateMerge(
      OpenApi.annotations({
        description: "What data is loaded, and how each source file's last download went.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "System" })) {}

/**
 * Component names come from schema identifiers; classes whose wire form differs from their
 * runtime form (decimals as strings) get an `Encoded` suffix. Drop it in the document.
 */
const tidyComponentNames = (spec: Record<string, unknown>): Record<string, unknown> => {
  const text = JSON.stringify(spec);
  const renamed = text.replace(/"(#\/components\/schemas\/)?([A-Za-z]+)Encoded"/g, '"$1$2"');
  const parsed: unknown = JSON.parse(renamed);
  return Predicate.isObject(parsed) ? parsed : spec;
};

export class Api extends HttpApi.make("polish-treasuries")
  .add(BondsApi)
  .add(InflationApi)
  .add(SystemApi)
  .prefix("/v1")
  .annotateMerge(
    OpenApi.annotations({
      title: "Polish Treasuries API",
      description:
        "Polish Treasury bond terms and the inflation index behind indexed bonds, from the Ministry of Finance spreadsheets.\n\nEvery endpoint returns a list, `[]` when nothing matches.\n\nAdd `.csv` or `.tsv` to any path to get the same data as a table.",
      version: "0.1.0",
      transform: tidyComponentNames,
    }),
  ) {}
