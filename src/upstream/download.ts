import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

/**
 * Fetching the two Ministry files. Each lives behind a gov.pl page whose attachment URL changes
 * on every republish; the page is stable, so we read it, find the download link that carries the
 * expected filename, follow it, and check the served filename matches.
 */

export const FILES = {
  calculator: {
    name: "kalkulatorodsetek.xlsm",
    page: "https://www.gov.pl/web/finanse/kalkulatory2",
  },
  savingsBonds: {
    name: "Dane_dotyczace_obligacji_detalicznych.xls",
    page: "https://www.gov.pl/web/finanse/obligacje-detaliczne1",
  },
} as const;
export type MinistryFile = (typeof FILES)[keyof typeof FILES];

/** gov.pl refuses requests without a browser-like agent. */
const USER_AGENT = "Mozilla/5.0 (compatible; polish-treasuries-api)";
const TIMEOUT = "10 seconds";

export class DownloadError extends Schema.TaggedError<DownloadError>()("DownloadError", {
  file: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export class Upstream extends Context.Service<
  Upstream,
  {
    download(file: MinistryFile): Effect.Effect<Uint8Array, DownloadError>;
  }
>()("polish-treasuries-api/upstream/Upstream") {
  static readonly layer = Layer.effect(
    Upstream,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(HttpClientRequest.setHeader("user-agent", USER_AGENT)),
        HttpClient.filterStatusOk,
      );

      const download = Effect.fn("Upstream.download")(function* (file: MinistryFile) {
        const failed = (message: string, cause?: unknown) =>
          new DownloadError({ file: file.name, message, cause });

        const html = yield* client.get(file.page).pipe(
          Effect.flatMap((response) => response.text),
          Effect.timeout(TIMEOUT),
          Effect.mapError((cause) => failed(`Could not read ${file.page}`, cause)),
        );

        const href = attachmentLink(html, file.name);
        if (href === null) {
          return yield* failed(`No download link for ${file.name} on ${file.page}`);
        }

        const response = yield* client.get(new URL(href, file.page)).pipe(
          Effect.timeout(TIMEOUT),
          Effect.mapError((cause) => failed(`Could not download ${href}`, cause)),
        );
        const served = servedFilename(response.headers["content-disposition"]);
        if (served !== file.name) {
          return yield* failed(`${href} serves "${served ?? "?"}", expected ${file.name}`);
        }
        const body = yield* response.arrayBuffer.pipe(
          Effect.timeout(TIMEOUT),
          Effect.mapError((cause) => failed(`Could not read the body of ${href}`, cause)),
        );
        return new Uint8Array(body);
      });

      return Upstream.of({ download });
    }),
  );
}

/**
 * gov.pl lists attachments as `<a class="file-download" href="/attachment/…">` with the filename
 * in `<span class="extension">`, sprinkled with zero-width spaces so it wraps.
 */
const attachmentLink = (html: string, filename: string): string | null => {
  const links = html.matchAll(
    /<a class="file-download" href="([^"]+)"[^>]*>[\s\S]*?<span class="extension">([\s\S]*?)<\/span>/g,
  );
  for (const [, href, extension] of links) {
    const name = extension!.replace(/&#8203;|\u200b/g, "").trim();
    if (name === filename) return href!;
  }
  return null;
};

/** `attachment; filename*=UTF-8''kalkulatorodsetek.xlsm` or `attachment; filename="x.xls"`. */
const servedFilename = (contentDisposition: string | undefined): string | null => {
  if (contentDisposition === undefined) return null;
  const extended = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(contentDisposition);
  if (extended !== null) return decodeURIComponent(extended[1]!.trim());
  const plain = /filename="?([^";]+)"?/.exec(contentDisposition);
  return plain === null ? null : plain[1]!.trim();
};
