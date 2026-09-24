import { Effect, Layer, SchemaIssue } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";
import { Treasuries } from "../treasuries.ts";
import { Api, BadRequests, Cached, Health, type Period } from "./api.ts";
import { BadRequest } from "./errors.ts";

/** Reads from what Treasuries currently serves; nothing is computed on the way out. */

export const InflationHandlers = HttpApiBuilder.group(
  Api,
  "inflation",
  Effect.fn(function* (handlers) {
    const treasuries = yield* Treasuries;
    const inflation = Effect.map(treasuries.facts, (facts) => facts.inflation);
    return handlers.handleAll({
      list: ({ query }) =>
        Effect.map(inflation, (months) =>
          months.filter((row) => query.period === undefined || inPeriod(row.month, query.period)),
        ),
    });
  }),
);

/** `2026` covers twelve months; `2026-02` one. */
const inPeriod = (month: string, period: Period) =>
  period.length === 4 ? month.startsWith(`${period}-`) : month === period;

export const BondsHandlers = HttpApiBuilder.group(
  Api,
  "bonds",
  Effect.fn(function* (handlers) {
    const treasuries = yield* Treasuries;
    const series = Effect.map(treasuries.facts, (facts) => facts.series);
    return handlers.handleAll({
      list: ({ query }) =>
        Effect.map(series, (all) =>
          all.filter(
            (s) =>
              (query.series === undefined || s.series === query.series) &&
              (query.prefix === undefined || s.prefix === query.prefix) &&
              (query.family === undefined || s.family === query.family) &&
              (query.isin === undefined || s.isin === query.isin),
          ),
        ),
    });
  }),
);

export const SystemHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    const treasuries = yield* Treasuries;
    return handlers.handleAll({
      health: () =>
        Effect.gen(function* () {
          const facts = yield* treasuries.facts;
          return new Health({
            status: "ok",
            months: facts.inflation.length,
            latestMonth: facts.inflation.at(-1)?.month ?? null,
            prefixes: new Set(facts.series.map((s) => s.prefix)).size,
            series: facts.series.length,
            files: yield* treasuries.status,
          });
        }),
    });
  }),
);

const CachedLive = Layer.succeed(Cached, (httpEffect) =>
  Effect.map(httpEffect, HttpServerResponse.setHeader("cache-control", "public, max-age=3600")),
);

const issues = SchemaIssue.makeFormatterStandardSchemaV1();

/** Only request decoding is the client's fault; a response that fails to encode stays Effect's. */
const BadRequestsLive = HttpApiMiddleware.layerSchemaErrorTransform(BadRequests, (error) =>
  error.kind === "Body" || error.kind === "ResponseHeaders"
    ? Effect.fail(error)
    : Effect.fail(
        new BadRequest({
          issues: issues(error.cause.issue).issues.map((issue) => ({
            message: issue.message,
            path: (issue.path ?? []).map((key) => String(typeof key === "object" ? key.key : key)),
          })),
        }),
      ),
);

export const ApiHandlers = Layer.mergeAll(BondsHandlers, InflationHandlers, SystemHandlers).pipe(
  Layer.provideMerge(Layer.mergeAll(CachedLive, BadRequestsLive)),
);
