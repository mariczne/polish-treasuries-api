import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpServer } from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { Isin, SeriesCode, YearMonth } from "../domain/primitives.ts";
import { TestServices } from "../test-services.ts";
import { Api, Year } from "./api.ts";
import { ApiHandlers } from "./handlers.ts";

const TestLayer = Layer.mergeAll(ApiHandlers, HttpServer.layerServices).pipe(
  Layer.provideMerge(TestServices),
);

const client = HttpApiTest.groups(Api, ["inflation", "bonds", "system"]);

describe("Api", () => {
  it.effect("serves inflation by period", () =>
    Effect.gen(function* () {
      const api = yield* client;
      expect(yield* api.inflation.list()).toHaveLength(278);
      expect(yield* api.inflation.period({ params: { period: Year.make("2025") } })).toHaveLength(
        12,
      );
      expect(
        yield* api.inflation.period({ params: { period: YearMonth.make("2026-08") } }),
      ).toHaveLength(1);

      const missing = yield* api.inflation
        .period({ params: { period: YearMonth.make("1999-01") } })
        .pipe(Effect.flip);
      expect(missing._tag).toBe("NotFound");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("serves bonds by type, code and ISIN", () =>
    Effect.gen(function* () {
      const api = yield* client;
      expect((yield* api.bonds.types()).map((t) => t.code)).toContain("IZ");
      expect(yield* api.bonds.list()).toHaveLength(1731);
      expect(yield* api.bonds.byType({ params: { type: "EDO" } })).toHaveLength(264);

      const edo = yield* api.bonds.byCode({ params: { code: SeriesCode.make("EDO0734") } });
      expect(
        edo.family === "savings" && edo.coupon.schedule === "per-period" && edo.coupon.rates.length,
      ).toBe(3);

      const byIsin = yield* api.bonds.byIsin({ params: { isin: Isin.make("PL0000117081") } });
      expect(byIsin.code).toBe("EDO0734");

      const missingIsin = yield* api.bonds
        .byIsin({ params: { isin: Isin.make("PL0000100000") } })
        .pipe(Effect.flip);
      expect(missingIsin._tag).toBe("NotFound");

      const conflict = yield* api.bonds
        .byIsin({ params: { isin: Isin.make("PL0000113890") } })
        .pipe(Effect.flip);
      expect(conflict).toMatchObject({ _tag: "IsinConflict", codes: ["TOS0825", "DOS0823"] });

      const missing = yield* api.bonds
        .byCode({ params: { code: SeriesCode.make("EDO9999") } })
        .pipe(Effect.flip);
      expect(missing._tag).toBe("NotFound");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("reports health", () =>
    Effect.gen(function* () {
      const api = yield* client;
      const health = yield* api.system.health();
      expect(health).toMatchObject({
        status: "ok",
        months: 278,
        latestMonth: "2026-08",
        series: 1731,
      });
      expect(health.files.map((f) => [f.source, f.lastAttempt])).toEqual([
        ["fixture", null],
        ["fixture", null],
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );
});
