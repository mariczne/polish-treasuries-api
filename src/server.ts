import { NodeFileSystem, NodeHttpClient, NodeHttpServer, NodePath } from "@effect/platform-node";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar, OpenApi } from "effect/unstable/httpapi";
// NodeHttpServer needs Node's own server factory; there is no Effect equivalent to import.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http";
import { Api } from "./api/api.ts";
import { Etag } from "./api/etag.ts";
import { ApiHandlers } from "./api/handlers.ts";
import { TableSuffix } from "./api/table-suffix.ts";
import { Upstream } from "./upstream/download.ts";
import { Treasuries } from "./treasuries.ts";

export const Port = Config.Port("PORT").pipe(Config.withDefault(3000));

export const BasePath = Config.schema(
  Schema.String.check(Schema.isPattern(/^(\/[^/]+)*$/)),
  "BASE_PATH",
).pipe(Config.withDefault(""));

export const Routes = Layer.unwrap(
  Effect.gen(function* () {
    const basePath = yield* BasePath;
    const api = basePath === "" ? Api : Api.annotate(OpenApi.Servers, [{ url: basePath }]);
    return Layer.mergeAll(
      HttpApiBuilder.layer(api, { openapiPath: "/openapi.json" }).pipe(Layer.provide(ApiHandlers)),
      HttpApiScalar.layerCdn(api, {
        path: "/docs",
        version: "1.70.0",
        scalar: {
          //@ts-expect-error
          expandAllResponses: true,
          defaultOpenAllTags: true,
          theme: "solarized",
          favicon: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏦</text></svg>`,
        },
      }),
      HttpRouter.add("GET", "/", HttpServerResponse.redirect(`${basePath}/docs`)),
    );
  }),
);

/** Global middleware added first wraps the rest: Etag must hash the table, not the JSON. */
export const Middleware = TableSuffix.pipe(Layer.provide(Etag));

export const Services = Treasuries.layer.pipe(
  Layer.provide(Upstream.layer),
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
);

export const Server = HttpRouter.serve(Layer.mergeAll(Routes, Middleware, Treasuries.scheduled), {
  middleware: (app) => app.pipe(HttpMiddleware.compression(), HttpMiddleware.cors()),
}).pipe(
  Layer.provide(
    Layer.unwrap(Effect.map(Port, (port) => NodeHttpServer.layer(createServer, { port }))),
  ),
  Layer.provide(Services),
);
