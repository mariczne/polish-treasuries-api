import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/unstable/http";
import { HttpApiTest } from "effect/unstable/httpapi";
import { BondSeries } from "../domain/bond.ts";
import { SeriesName, YearMonth } from "../domain/primitives.ts";
import { InflationMonth } from "../domain/reference-index.ts";
import { TestServices } from "../test-services.ts";
import { Api, Health } from "./api.ts";
import { bondsExample, healthExample, inflationExample } from "./examples.ts";
import { ApiHandlers } from "./handlers.ts";

const TestLayer = Layer.mergeAll(ApiHandlers, HttpServer.layerServices).pipe(
  Layer.provideMerge(TestServices),
);

describe("docs examples", () => {
  it.effect("are what the API serves", () =>
    Effect.gen(function* () {
      const api = yield* HttpApiTest.groups(Api, ["inflation", "bonds"]);
      for (const example of bondsExample) {
        const served = yield* api.bonds.list({
          query: { series: SeriesName.make(example.series) },
        });
        expect(yield* Schema.encodeEffect(Schema.Array(BondSeries))(served)).toEqual([example]);
      }
      for (const example of inflationExample) {
        const served = yield* api.inflation.list({
          query: { period: YearMonth.make(example.month) },
        });
        expect(yield* Schema.encodeEffect(Schema.Array(InflationMonth))(served)).toEqual([example]);
      }
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("health example decodes", () =>
    Effect.gen(function* () {
      expect(yield* Schema.decodeEffect(Health)(healthExample)).toBeInstanceOf(Health);
    }),
  );
});
