import { Effect, Encoding } from "effect";
import { HttpBody, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

/**
 * A weak ETag from the body's hash on every 200 with a buffered body, and a bodiless 304 when
 * the client already holds it. Weak because compression, applied after, changes the bytes.
 */
export const Etag = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const response = yield* httpEffect;
      const body = response.body;
      if (response.status !== 200 || body._tag !== "Uint8Array") return response;
      const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", body.body));
      const tag = `W/"${Encoding.encodeBase64Url(new Uint8Array(digest)).slice(0, 22)}"`;
      const tagged = HttpServerResponse.setHeader(response, "etag", tag);
      const request = yield* HttpServerRequest.HttpServerRequest;
      const held = request.headers["if-none-match"]?.split(",").map((t) => t.trim()) ?? [];
      if (!held.includes(tag) && !held.includes("*")) return tagged;
      return tagged.pipe(
        HttpServerResponse.setStatus(304),
        HttpServerResponse.setBody(HttpBody.empty),
      );
    }),
  { global: true },
);
