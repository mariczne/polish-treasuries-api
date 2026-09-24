import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { Middleware, Routes } from "../server.ts";
import { TestServices } from "../test-services.ts";

const app = Layer.mergeAll(Routes, Middleware).pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provideMerge(TestServices),
);

const fetchText = (path: string, headers: Record<string, string> = {}) =>
  Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
    ({ handler }) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(new Request(`http://localhost${path}`, { headers })),
        );
        const text = yield* Effect.promise(() => response.text());
        return {
          status: response.status,
          type: response.headers.get("content-type"),
          location: response.headers.get("location"),
          etag: response.headers.get("etag"),
          cacheControl: response.headers.get("cache-control"),
          text,
        };
      }),
    ({ dispose }) => Effect.promise(dispose),
  );

describe("table suffix", () => {
  it.live("any JSON endpoint answers as CSV or TSV", () =>
    Effect.gen(function* () {
      const csv = yield* fetchText("/inflation.csv");
      expect(csv.status).toBe(200);
      expect(csv.type).toContain("text/csv");
      expect(csv.text.split("\r\n").slice(0, 2)).toEqual([
        "month,rate,referenceIndex",
        "2003-07,-0.004,99.6",
      ]);

      const tsv = yield* fetchText("/bonds/by-type/EDO.tsv");
      expect(tsv.type).toContain("text/tab-separated-values");
      const [header, first] = tsv.text.split("\r\n");
      expect(header?.split("\t")).toContain("coupon.rates.10.rate");
      expect(first?.startsWith("savings\tEDO1014\tEDO\t")).toBe(true);

      const one = yield* fetchText("/bonds/EDO0734.csv");
      expect(one.text.split("\r\n")).toHaveLength(3);

      const month = yield* fetchText("/inflation/2026-08.csv");
      expect(month.text).toBe("month,rate,referenceIndex\r\n2026-08,0.003,215.26519\r\n");
    }),
  );

  it.live("errors and JSON stay as they are", () =>
    Effect.gen(function* () {
      const root = yield* fetchText("/");
      expect(root.status).toBe(302);
      expect(root.location).toBe("/docs");

      const invalid = yield* fetchText("/bonds/by-isin/foo");
      expect(invalid.status).toBe(400);
      expect(invalid.text).toBe(
        '{"error":"BadRequest","issues":[{"message":"Expected a string matching the RegExp ^PL\\\\d{10}$","path":["isin"]}]}',
      );

      const missing = yield* fetchText("/bonds/EDO9999.csv");
      expect(missing.status).toBe(404);
      expect(missing.text).toBe('{"error":"NotFound"}');

      const conflict = yield* fetchText("/bonds/by-isin/PL0000113890");
      expect(conflict.status).toBe(502);
      expect(conflict.text).toBe(
        '{"error":"IsinConflict","isin":"PL0000113890","codes":["TOS0825","DOS0823"]}',
      );

      const json = yield* fetchText("/inflation/2026-08");
      expect(json.type).toContain("json");
      expect(json.text.startsWith("[{")).toBe(true);

      const doc = yield* fetchText("/openapi.json");
      const Spec = Schema.fromJsonString(
        Schema.Struct({
          paths: Schema.Record(Schema.String, Schema.Unknown),
          components: Schema.Struct({ schemas: Schema.Record(Schema.String, Schema.Unknown) }),
        }),
      );
      const spec = yield* Schema.decodeEffect(Spec)(doc.text);
      const paths = Object.keys(spec.paths);
      expect(paths.some((p) => p.endsWith(".csv") || p.endsWith(".tsv"))).toBe(false);
      const schemas = Object.keys(spec.components.schemas);
      expect(schemas.some((name) => name.endsWith("Encoded") || name.includes("effect_"))).toBe(
        false,
      );
      expect(doc.text).not.toContain('"_tag"');
    }),
  );

  it.live("data is cacheable and revalidates by ETag; health is not cached", () =>
    Effect.gen(function* () {
      const json = yield* fetchText("/bonds/EDO0734");
      expect(json.cacheControl).toBe("public, max-age=3600");
      expect(json.etag).toMatch(/^W\/".+"$/);

      const csv = yield* fetchText("/bonds/EDO0734.csv");
      expect(csv.etag).not.toBe(json.etag);

      const held = yield* fetchText("/bonds/EDO0734.csv", { "if-none-match": csv.etag! });
      expect(held.status).toBe(304);
      expect(held.text).toBe("");

      const health = yield* fetchText("/health");
      expect(health.cacheControl).toBeNull();
    }),
  );
});
