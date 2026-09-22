import { NodeFileSystem, NodeHttpClient, NodeHttpServer, NodePath } from "@effect/platform-node";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpMiddleware, HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar, OpenApi } from "effect/unstable/httpapi";
// NodeHttpServer needs Node's own server factory; there is no Effect equivalent to import.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http";
import { Api } from "./api/api.ts";
import { ApiHandlers } from "./api/handlers.ts";
import { TableSuffix } from "./api/table-suffix.ts";
import { Upstream } from "./upstream/download.ts";
import { Treasuries } from "./treasuries.ts";

export const Port = Config.Port("PORT").pipe(Config.withDefault(3000));

/** Reads are public and cacheable; the store changes at most once a day. */
const CacheHeaders = HttpRouter.middleware((httpEffect) =>
  Effect.map(httpEffect, HttpServerResponse.setHeader("cache-control", "public, max-age=3600")),
).layer;

export const BasePath = Config.schema(
  Schema.String.check(Schema.isPattern(/^(\/[^/]+)*$/)),
  "BASE_PATH",
).pipe(Config.withDefault(""));

export const Routes = Layer.unwrap(
  Effect.gen(function* () {
    const basePath = yield* BasePath;
    const api = basePath === "" ? Api : Api.annotate(OpenApi.Servers, [{ url: basePath }]);
    return Layer.mergeAll(
      HttpApiBuilder.layer(api, { openapiPath: "/openapi.json" }).pipe(
        Layer.provide(ApiHandlers),
        Layer.provide(CacheHeaders),
      ),
      HttpApiScalar.layer(api, { path: "/docs" }),
      HttpRouter.add("GET", "/", HttpServerResponse.redirect(`${basePath}/docs`)),
    );
  }),
);

export const Services = Treasuries.layer.pipe(
  Layer.provide(Upstream.layer),
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
);

export const Server = HttpRouter.serve(Layer.mergeAll(Routes, TableSuffix, Treasuries.scheduled), {
  middleware: HttpMiddleware.cors(),
}).pipe(
  Layer.provide(
    Layer.unwrap(Effect.map(Port, (port) => NodeHttpServer.layer(createServer, { port }))),
  ),
  Layer.provide(Services),
);
