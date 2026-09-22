import { Effect, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { contentType, type Format, tabular } from "./tabular.ts";

/**
 * Any JSON endpoint answers as a table when the path ends in `.csv` or `.tsv`: the suffix is
 * dropped, the JSON endpoint runs, and its successful JSON body is laid out as rows (an object is
 * one row). Errors and non-JSON responses pass through untouched. The OpenAPI document lists
 * only the JSON paths.
 */

const SUFFIX = /^([^?]*)\.(csv|tsv)(\?.*)?$/;
const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Json));

export const TableSuffix = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const match = SUFFIX.exec(request.url);
      if (match === null) return yield* httpEffect;
      const format: Format = match[2] === "csv" ? "csv" : "tsv";
      const response = yield* httpEffect.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          request.modify({ url: `${match[1]}${match[3] ?? ""}` }),
        ),
      );
      const body = response.body;
      if (
        response.status >= 300 ||
        body._tag !== "Uint8Array" ||
        !body.contentType.includes("json")
      ) {
        return response;
      }
      const json = yield* decodeJson(new TextDecoder().decode(body.body)).pipe(Effect.orDie);
      const rows = Array.isArray(json) ? json : [json];
      return response.pipe(
        HttpServerResponse.setBody(
          HttpServerResponse.text(tabular(rows, format), {
            contentType: contentType(format),
          }).body,
        ),
      );
    }),
  { global: true },
);
