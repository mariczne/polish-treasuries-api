import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { greet } from "./greet.ts";

describe("greet", () => {
  it.effect("greets the supplied name", () =>
    Effect.gen(function* () {
      const message = yield* greet("world");
      expect(message).toBe("Hello, world!");
    }),
  );
});
