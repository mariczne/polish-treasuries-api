import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { DownloadError, FILES, Upstream } from "./download.ts";

const PAGE = `
<h3>Materiały</h3>
<a class="file-download" href="/attachment/3d1b2ae7-1d9a-4b4b-b368-42da05663a8a" target="_blank" download
aria-label="Pobierz plik Rozporządzenie">
Rozporządzenie<br/>
<span class="extension">Rozporzadzenie&#8203;_w&#8203;_sprawie.pdf</span>
</a>
<a class="file-download" href="/attachment/b7580ba9-9daf-47f0-b017-6ecacc04c008" target="_blank" download
aria-label="Pobierz plik Dane dotyczące obligacji detalicznych plik w formacie xls">
Dane dotyczące obligacji detalicznych plik w formacie xls<br/>
<span class="extension">Dane&#8203;_dotyczace&#8203;_obligacji&#8203;_detalicznych.xls</span>
</a>`;

const BYTES = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);

/** A gov.pl that serves the page and one attachment, and remembers what it was asked. */
const govPl = (options: { servedName: string }) => {
  const requests: Array<{ url: string; userAgent: string | undefined }> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) => {
      requests.push({ url: url.toString(), userAgent: request.headers["user-agent"] });
      if (url.pathname === "/web/finanse/obligacje-detaliczne1") {
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response(PAGE, { status: 200 })),
        );
      }
      if (url.pathname === "/attachment/b7580ba9-9daf-47f0-b017-6ecacc04c008") {
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(BYTES, {
              status: 200,
              headers: {
                "content-disposition": `attachment; filename*=UTF-8''${options.servedName}`,
              },
            }),
          ),
        );
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response("not found", { status: 404 })),
      );
    }),
  );
  return { requests, layer: Upstream.layer.pipe(Layer.provide(layer)) };
};

describe("Upstream.download", () => {
  it.effect("finds the link by filename, follows it, and sends a browser-like agent", () => {
    const site = govPl({ servedName: FILES.savingsBonds.name });
    return Effect.gen(function* () {
      const upstream = yield* Upstream;
      const bytes = yield* upstream.download(FILES.savingsBonds);
      expect(bytes).toEqual(BYTES);
      expect(site.requests.map((r) => r.url)).toEqual([
        "https://www.gov.pl/web/finanse/obligacje-detaliczne1",
        "https://www.gov.pl/attachment/b7580ba9-9daf-47f0-b017-6ecacc04c008",
      ]);
      expect(site.requests.every((r) => r.userAgent?.startsWith("Mozilla/5.0"))).toBe(true);
    }).pipe(Effect.provide(site.layer));
  });

  it.effect("refuses an attachment served under another name", () =>
    Effect.gen(function* () {
      const upstream = yield* Upstream;
      const error = yield* upstream.download(FILES.savingsBonds).pipe(Effect.flip);
      expect(error).toBeInstanceOf(DownloadError);
      expect(error.message).toContain('serves "something-else.xls"');
    }).pipe(Effect.provide(govPl({ servedName: "something-else.xls" }).layer)),
  );

  it.effect("fails when the page has no link for the file", () =>
    Effect.gen(function* () {
      const upstream = yield* Upstream;
      const error = yield* upstream.download(FILES.calculator).pipe(Effect.flip);
      expect(error.message).toContain("Could not read");
    }).pipe(Effect.provide(govPl({ servedName: FILES.calculator.name }).layer)),
  );
});
