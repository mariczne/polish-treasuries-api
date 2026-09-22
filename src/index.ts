import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { Effect } from "effect";
import { greet } from "./greet.ts";

greet("world").pipe(
  Effect.flatMap((message) => Effect.log(message)),
  NodeRuntime.runMain,
);
