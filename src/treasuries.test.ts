import { describe, expect, it } from "@effect/vitest";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { ConfigProvider, Context, Effect, FileSystem, Layer, Path } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { Treasuries } from "./treasuries.ts";
import { FILES, Upstream } from "./upstream/download.ts";
import { fixture } from "./upstream/fixtures.ts";

const page = (name: string, id: string) => `
<a class="file-download" href="/attachment/${id}" download>
<span class="extension">${name.replace(/_/g, "&#8203;_")}</span></a>`;

/** A gov.pl serving the fixtures — with the calculator optionally swapped for other bytes — or down. */
const govPl = (options: { down?: boolean; calculator?: Uint8Array }) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>([
        ["/attachment/calc", options.calculator ?? (yield* fixture("kalkulatorodsetek.xlsm"))],
        ["/attachment/retail", yield* fixture("Dane_dotyczace_obligacji_detalicznych.xls")],
      ]);
      const names = new Map([
        ["/attachment/calc", FILES.calculator.name],
        ["/attachment/retail", FILES.savingsBonds.name],
      ]);
      return HttpClient.make((request, url) => {
        const respond = (body: string | Uint8Array, init: ResponseInit) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, init)));
        if (options.down === true) return respond("gateway timeout", { status: 504 });
        if (url.pathname === "/web/finanse/kalkulatory2") {
          return respond(page(FILES.calculator.name, "calc"), { status: 200 });
        }
        if (url.pathname === "/web/finanse/obligacje-detaliczne1") {
          return respond(page(FILES.savingsBonds.name, "retail"), { status: 200 });
        }
        const bytes = files.get(url.pathname);
        if (bytes === undefined) return respond("not found", { status: 404 });
        return respond(bytes, {
          status: 200,
          headers: {
            "content-disposition": `attachment; filename*=UTF-8''${names.get(url.pathname)}`,
          },
        });
      });
    }),
  );

class TestDataDir extends Context.Service<TestDataDir, string>()("TestDataDir") {
  static readonly layer = Layer.effect(
    TestDataDir,
    Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped()),
  );
}

const testLayer = (options: { down?: boolean; calculator?: Uint8Array }) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const dataDir = yield* TestDataDir;
      return Treasuries.layer.pipe(
        Layer.provide(Upstream.layer),
        Layer.provide(govPl(options)),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ DATA_DIR: dataDir }))),
      );
    }),
  ).pipe(
    Layer.provideMerge(TestDataDir.layer),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(NodePath.layer),
  );

describe("Treasuries", () => {
  it.effect("serves the fixtures at start, stores the first download, then sees it unchanged", () =>
    Effect.gen(function* () {
      const treasuries = yield* Treasuries;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dataDir = yield* TestDataDir;

      expect((yield* treasuries.facts).series).toHaveLength(1731);
      expect((yield* treasuries.status).map((s) => s.source)).toEqual(["fixture", "fixture"]);

      yield* treasuries.refresh;
      expect((yield* treasuries.status).map((s) => [s.source, s.lastAttempt])).toEqual([
        ["download", "stored"],
        ["download", "stored"],
      ]);
      expect(yield* fs.exists(path.join(dataDir, "latest", FILES.calculator.name))).toBe(true);

      yield* treasuries.refresh;
      expect((yield* treasuries.status).map((s) => s.lastAttempt)).toEqual([
        "unchanged",
        "unchanged",
      ]);
      expect((yield* treasuries.facts).series).toHaveLength(1731);
    }).pipe(Effect.provide(testLayer({}))),
  );

  it.effect("a Ministry outage is reported and changes nothing", () =>
    Effect.gen(function* () {
      const treasuries = yield* Treasuries;
      yield* treasuries.refresh;
      const status = yield* treasuries.status;
      expect(status.map((s) => [s.source, s.lastAttempt])).toEqual([
        ["fixture", "failed"],
        ["fixture", "failed"],
      ]);
      expect(status[0]?.message).toContain("Could not read");
      expect((yield* treasuries.facts).series).toHaveLength(1731);
    }).pipe(Effect.provide(testLayer({ down: true }))),
  );

  it.effect("a file that does not parse is neither served nor kept", () =>
    Effect.gen(function* () {
      const treasuries = yield* Treasuries;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dataDir = yield* TestDataDir;
      yield* treasuries.refresh;
      const status = yield* treasuries.status;
      expect(status.map((s) => [s.source, s.lastAttempt])).toEqual([
        ["fixture", "failed"],
        ["download", "stored"],
      ]);
      expect(status[0]?.message).toContain("WorkbookError");
      expect(yield* fs.exists(path.join(dataDir, "latest", FILES.calculator.name))).toBe(false);
      expect((yield* treasuries.facts).inflation).toHaveLength(278);
    }).pipe(Effect.provide(testLayer({ calculator: new TextEncoder().encode("not a workbook") }))),
  );
});
