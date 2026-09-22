import { NodeFileSystem } from "@effect/platform-node";
import { Effect, FileSystem } from "effect";

/** The two Ministry files as downloaded on 2026-09-22, checked in under `fixtures/`. */
export const fixture = (
  name: "kalkulatorodsetek.xlsm" | "Dane_dotyczace_obligacji_detalicznych.xls",
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFile(`fixtures/${name}`);
  }).pipe(Effect.provide(NodeFileSystem.layer));
