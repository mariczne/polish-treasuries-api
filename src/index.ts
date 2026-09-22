import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { Server } from "./server.ts";

Layer.launch(Server).pipe(NodeRuntime.runMain);
