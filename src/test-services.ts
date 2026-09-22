import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { ConfigProvider, Effect, FileSystem, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { Treasuries } from "./treasuries.ts";
import { Upstream } from "./upstream/download.ts";

const govPlDown = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, new Response("down", { status: 503 }))),
  ),
);

/** Treasuries loaded from `fixtures/` into an empty temporary `DATA_DIR`, with gov.pl unreachable. */
export const TestServices = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dataDir = yield* fs.makeTempDirectoryScoped();
    return Treasuries.layer.pipe(
      Layer.provide(Upstream.layer),
      Layer.provide(govPlDown),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ DATA_DIR: dataDir }))),
    );
  }),
).pipe(Layer.provideMerge(NodeFileSystem.layer), Layer.provideMerge(NodePath.layer));
