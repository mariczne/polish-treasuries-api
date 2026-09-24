import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Isin, SeriesName, YearMonth } from "../domain/primitives.ts";
import { TestServices } from "../test-services.ts";
import { Api, type Period, Year } from "./api.ts";
import { ApiHandlers } from "./handlers.ts";

const TestLayer = Layer.mergeAll(ApiHandlers, HttpServer.layerServices).pipe(
  Layer.provideMerge(TestServices),
);

const client = HttpApiTest.groups(Api, ["inflation", "bonds", "system"]);

describe("Api", () => {
  it.effect("serves inflation by period", () =>
    Effect.gen(function* () {
      const api = yield* client;
      const period = (period?: Period) =>
        api.inflation.list({ query: period === undefined ? {} : { period } });
      expect(yield* period()).toHaveLength(278);
      expect(yield* period(Year.make("2025"))).toHaveLength(12);
      expect(yield* period(YearMonth.make("2026-08"))).toHaveLength(1);
      expect(yield* period(YearMonth.make("1999-01"))).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("serves bonds by filter, as lists", () =>
    Effect.gen(function* () {
      const api = yield* client;

      expect(yield* api.bonds.list({ query: {} })).toHaveLength(1731);
      expect(yield* api.bonds.list({ query: { prefix: "EDO" } })).toHaveLength(264);
      expect(yield* api.bonds.list({ query: { prefix: "EDO", family: "wholesale" } })).toEqual([]);
      const series = (name: string) => api.bonds.list({ query: { series: SeriesName.make(name) } });
      const [edo, ...rest] = yield* series("EDO0734");
      expect(rest).toEqual([]);
      expect(
        edo?.family === "savings" &&
          edo.coupon.schedule === "per-period" &&
          edo.coupon.rates.length,
      ).toBe(3);
      expect(yield* series("EDO9999")).toEqual([]);

      const byIsin = (isin: string) =>
        Effect.map(api.bonds.list({ query: { isin: Isin.make(isin) } }), (found) =>
          found.map((s) => s.series),
        );
      expect(yield* byIsin("PL0000117081")).toEqual(["EDO0734"]);
      expect(yield* byIsin("PL0000100000")).toEqual([]);
      // The file puts PL0000113890 on two Series; both are served
      expect(yield* byIsin("PL0000113890")).toEqual(["TOS0825", "DOS0823"]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("reports health", () =>
    Effect.gen(function* () {
      const api = yield* client;
      const health = yield* api.system.health();
      expect(health).toMatchObject({
        status: "ok",
        monthCount: 278,
        latestMonth: "2026-08",
        seriesCount: 1731,
      });
      expect(health.files.map((f) => [f.source, f.lastAttempt])).toEqual([
        ["fixture", null],
        ["fixture", null],
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );
});
