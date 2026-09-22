import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Treasuries } from "../treasuries.ts";
import { Api, Health, type Period } from "./api.ts";
import { NotFound, IsinConflict } from "./errors.ts";

/** Reads from what Treasuries currently serves; nothing is computed on the way out. */

export const InflationHandlers = HttpApiBuilder.group(
  Api,
  "inflation",
  Effect.fn(function* (handlers) {
    const treasuries = yield* Treasuries;
    const inflation = Effect.map(treasuries.facts, (facts) => facts.inflation);
    return handlers.handleAll({
      list: () => inflation,
      period: Effect.fn(function* ({ params }) {
        const months = yield* inflation;
        const within = months.filter((row) => inPeriod(row.month, params.period));
        if (within.length === 0) return yield* new NotFound();
        return within;
      }),
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
      types: () => Effect.map(treasuries.facts, (facts) => facts.types),
      list: () => series,
      byType: ({ params }) =>
        Effect.map(series, (all) => all.filter((s) => s.type === params.type)),
      byIsin: Effect.fn(function* ({ params }) {
        const found = (yield* series).filter((s) => s.isin === params.isin);
        if (found.length === 0) return yield* new NotFound();
        if (found.length > 1) {
          return yield* new IsinConflict({ isin: params.isin, codes: found.map((s) => s.code) });
        }
        return found[0]!;
      }),
      byCode: Effect.fn(function* ({ params }) {
        const found = (yield* series).find((s) => s.code === params.code);
        if (found === undefined) return yield* new NotFound();
        return found;
      }),
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
            types: facts.types.length,
            series: facts.series.length,
            files: yield* treasuries.status,
          });
        }),
    });
  }),
);

export const ApiHandlers = Layer.mergeAll(BondsHandlers, InflationHandlers, SystemHandlers);
