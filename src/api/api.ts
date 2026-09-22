import { Predicate, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi";
import { BondSeries, BondType, BondTypeCode } from "../domain/bond.ts";
import { Isin, SeriesCode, YearMonth } from "../domain/primitives.ts";
import { MonthlyReferenceIndex } from "../domain/reference-index.ts";
import { FileStatus } from "../treasuries.ts";

/**
 * The API as clients see it. Every endpoint also answers as a table when the path ends in `.csv`
 * or `.tsv` (see `table-suffix.ts`); only the JSON paths are documented.
 */

/** An empty 404, like every other error this server sends. */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  {},
  { httpApiStatus: 404 },
) {}
const NotFoundNoContent = NotFound.pipe(
  HttpApiSchema.asNoContent({ decode: () => new NotFound() }),
);

export const Year = Schema.String.check(Schema.isPattern(/^\d{4}$/))
  .annotate({ identifier: "Year", examples: ["2026"] })
  .pipe(Schema.brand("Year"));

/** A year (`2026`) or a month (`2026-02`). */
export const Period = Schema.Union([Year, YearMonth]).annotate({ identifier: "Period" });
export type Period = typeof Period.Type;

export class InflationApi extends HttpApiGroup.make("inflation")
  .add(
    HttpApiEndpoint.get("list", "/inflation", {
      success: Schema.Array(MonthlyReferenceIndex),
    }).annotateMerge(
      OpenApi.annotations({
        description:
          "Every month since July 2003: the month's price change as a rate (Monthly Reference Index) and the level reached (Reference Index).",
      }),
    ),
    HttpApiEndpoint.get("period", "/inflation/:period", {
      params: { period: Period },
      success: Schema.Array(MonthlyReferenceIndex),
      error: NotFoundNoContent,
    }).annotateMerge(
      OpenApi.annotations({
        description:
          "The months of one year (`/inflation/2026`) or one month (`/inflation/2026-02`).",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Inflation",
      description: [
        "The inflation series the Ministry uses to index bonds.",
        "",
        "_Note: it differs from the CPI reported by GUS. Every March GUS can revise its figure for January; the Ministry keeps the figure it first fixed._",
      ].join("\n"),
    }),
  ) {}

export class BondsApi extends HttpApiGroup.make("bonds")
  .add(
    HttpApiEndpoint.get("types", "/bonds/types", { success: Schema.Array(BondType) }).annotateMerge(
      OpenApi.annotations({ description: "Every Bond Type, savings and wholesale." }),
    ),
    HttpApiEndpoint.get("list", "/bonds", { success: Schema.Array(BondSeries) }).annotateMerge(
      OpenApi.annotations({ description: "Every Series of every Bond Type." }),
    ),
    HttpApiEndpoint.get("byType", "/bonds/by-type/:type", {
      params: { type: BondTypeCode },
      success: Schema.Array(BondSeries),
    }).annotateMerge(OpenApi.annotations({ description: "The Series of one Bond Type." })),
    HttpApiEndpoint.get("byIsin", "/bonds/by-isin/:isin", {
      params: { isin: Isin },
      success: Schema.Array(BondSeries),
    }).annotateMerge(
      OpenApi.annotations({
        description: [
          "The Series with this ISIN.",
          "",
          "⚠️ _An ISIN should identify a single security, but the source file has two copy errors: `PL0000113890` is on both TOS0825 and DOS0823, and `PL0000107280` on both COI1116 and TOZ1115. This is obviously a mistake, but this service is a proxy for the source files and does not correct them — so the response is a list, and for those two ISINs it has two entries._",
        ].join("\n"),
      }),
    ),
    HttpApiEndpoint.get("byCode", "/bonds/:code", {
      params: { code: SeriesCode },
      success: BondSeries,
      error: NotFoundNoContent,
    }).annotateMerge(
      OpenApi.annotations({ description: "One Series by its code, e.g. `EDO0734` or `IZ0836`." }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Bonds",
      description: "Savings Bond and Wholesale Bond Series and their terms.",
    }),
  ) {}

export class Health extends Schema.Class<Health>("Health")({
  status: Schema.Literal("ok"),
  months: Schema.Int,
  latestMonth: Schema.NullOr(YearMonth),
  types: Schema.Int,
  series: Schema.Int,
  /** Per source file: where the served copy came from and how the last download went. */
  files: Schema.Array(FileStatus),
}) {}

export class SystemApi extends HttpApiGroup.make("system")
  .add(
    HttpApiEndpoint.get("health", "/health", { success: Health }).annotateMerge(
      OpenApi.annotations({
        description:
          "What is served, and per source file where it came from and how the last download went.",
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
  .add(InflationApi)
  .add(BondsApi)
  .add(SystemApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Polish Treasuries API",
      description:
        "The terms of Polish Treasury Bonds and the inflation figures used to index them, as published by the Ministry of Finance of Poland in its spreadsheets.\n\nAdd `.csv` or `.tsv` to any path to get the same data as a table.",
      version: "0.1.0",
      transform: tidyComponentNames,
    }),
  ) {}
