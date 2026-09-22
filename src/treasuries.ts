import {
  Config,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Path,
  Ref,
  Schedule,
  Schema,
} from "effect";
import { BondSeries, BondType } from "./domain/bond.ts";
import { MonthlyReferenceIndex } from "./domain/reference-index.ts";
import { parseCalculator } from "./upstream/calculator.ts";
import { FILES, type MinistryFile, Upstream } from "./upstream/download.ts";
import { parseSavingsBonds } from "./upstream/savings-bonds.ts";

/**
 * A proxy for the Ministry's two files. What is served is the newest file that parsed, held in
 * memory; the files themselves are kept under `DATA_DIR` (`latest/`, `previous/`). At startup the
 * files on disk are loaded — or, on first boot, the copies checked in under `fixtures/` — so the
 * API is never blank even if gov.pl is unreachable. A refresh then runs right away and on the
 * configured interval; a download that fails or does not parse leaves the previous file in place.
 * There is no refresh endpoint: to force one, restart.
 */

export const DataDir = Config.String("DATA_DIR").pipe(Config.withDefault("data"));
export const RefreshEvery = Config.Duration("REFRESH_EVERY").pipe(Config.withDefault("1 day"));

/** Everything parsed from one file. */
export class Facts extends Schema.Class<Facts>("Facts")({
  inflation: Schema.Array(MonthlyReferenceIndex),
  types: Schema.Array(BondType),
  series: Schema.Array(BondSeries),
}) {}

export class FileStatus extends Schema.Class<FileStatus>("FileStatus")({
  file: Schema.String,
  /** Where the served copy came from: the last successful download, or a file loaded at start. */
  source: Schema.Literals(["download", "disk", "fixture"]),
  loadedAt: Schema.String,
  /** The last download attempt since start, if any. */
  lastAttemptAt: Schema.NullOr(Schema.String),
  lastAttempt: Schema.NullOr(Schema.Literals(["stored", "unchanged", "failed"])),
  message: Schema.NullOr(Schema.String),
}) {}

const parsers: Record<MinistryFile["name"], (bytes: Uint8Array) => Effect.Effect<Facts, unknown>> =
  {
    [FILES.calculator.name]: (bytes) =>
      parseCalculator(bytes).pipe(
        Effect.map(
          (c) => new Facts({ inflation: c.referenceIndex, types: c.types, series: c.series }),
        ),
      ),
    [FILES.savingsBonds.name]: (bytes) =>
      parseSavingsBonds(bytes).pipe(
        Effect.map((s) => new Facts({ inflation: [], types: s.types, series: s.series })),
      ),
  };

/** The status with the outcome of a download attempt, everything else kept. */
const attempted = (
  status: FileStatus,
  at: string,
  lastAttempt: FileStatus["lastAttempt"],
  message: string | null,
) =>
  new FileStatus({
    file: status.file,
    source: status.source,
    loadedAt: status.loadedAt,
    lastAttemptAt: at,
    lastAttempt,
    message,
  });

interface Loaded {
  readonly facts: Facts;
  readonly status: FileStatus;
}

export class Treasuries extends Context.Service<
  Treasuries,
  {
    /** Everything currently served, both files together. */
    readonly facts: Effect.Effect<Facts>;
    readonly status: Effect.Effect<ReadonlyArray<FileStatus>>;
    /** Download both files; each that is new and parses replaces what is served. Never fails. */
    readonly refresh: Effect.Effect<void>;
  }
>()("polish-treasuries-api/Treasuries") {
  static readonly layer = Layer.effect(
    Treasuries,
    Effect.gen(function* () {
      const upstream = yield* Upstream;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dataDir = yield* DataDir;
      const now = Effect.map(DateTime.now, DateTime.formatIso);

      const latestPath = (file: MinistryFile) => path.join(dataDir, "latest", file.name);
      const previousPath = (file: MinistryFile) => path.join(dataDir, "previous", file.name);

      const load = Effect.fn("Treasuries.load")(function* (
        file: MinistryFile,
      ): Effect.fn.Return<Loaded, unknown> {
        const onDisk = yield* fs.exists(latestPath(file));
        const source = onDisk ? "disk" : "fixture";
        const from = onDisk ? latestPath(file) : path.join("fixtures", file.name);
        yield* Effect.logInfo(`Loading ${from}`);
        const facts = yield* parsers[file.name](yield* fs.readFile(from));
        return {
          facts,
          status: new FileStatus({
            file: file.name,
            source,
            loadedAt: yield* now,
            lastAttemptAt: null,
            lastAttempt: null,
            message: null,
          }),
        };
      });

      const state = yield* Ref.make(
        new Map<string, Loaded>(
          yield* Effect.forEach(Object.values(FILES), (file) =>
            Effect.map(load(file), (loaded) => [file.name, loaded] as const),
          ).pipe(Effect.orDie),
        ),
      );

      const facts = Ref.get(state).pipe(
        Effect.map((files) => {
          const parts = [...files.values()].map((loaded) => loaded.facts);
          return new Facts({
            inflation: parts.flatMap((part) => part.inflation),
            types: parts.flatMap((part) => part.types),
            series: parts.flatMap((part) => part.series),
          });
        }),
      );

      const status = Ref.get(state).pipe(
        Effect.map((files) => [...files.values()].map((loaded) => loaded.status)),
      );

      /** Writes `latest/`, moving the old copy to `previous/`. */
      const keep = Effect.fn("Treasuries.keep")(function* (file: MinistryFile, bytes: Uint8Array) {
        yield* fs.makeDirectory(path.dirname(latestPath(file)), { recursive: true });
        yield* fs.makeDirectory(path.dirname(previousPath(file)), { recursive: true });
        if (yield* fs.exists(latestPath(file)))
          yield* fs.rename(latestPath(file), previousPath(file));
        yield* fs.writeFile(latestPath(file), bytes);
      });

      const sameAsLatest = Effect.fn("Treasuries.sameAsLatest")(function* (
        file: MinistryFile,
        bytes: Uint8Array,
      ) {
        if (!(yield* fs.exists(latestPath(file)))) return false;
        const old = yield* fs.readFile(latestPath(file));
        return old.length === bytes.length && old.every((b, i) => b === bytes[i]);
      });

      const setStatus = (file: MinistryFile, update: (current: Loaded, at: string) => Loaded) =>
        Effect.gen(function* () {
          const at = yield* now;
          yield* Ref.update(state, (files) => {
            const current = files.get(file.name);
            return current === undefined
              ? files
              : new Map(files).set(file.name, update(current, at));
          });
        });

      const refreshFile = Effect.fn("Treasuries.refreshFile")(function* (file: MinistryFile) {
        const attempt = Effect.gen(function* () {
          const bytes = yield* upstream.download(file);
          if (yield* sameAsLatest(file, bytes)) {
            yield* setStatus(file, (current, at) => ({
              facts: current.facts,
              status: attempted(current.status, at, "unchanged", null),
            }));
            return;
          }
          const facts = yield* parsers[file.name](bytes);
          yield* keep(file, bytes);
          yield* setStatus(file, (_, at) => ({
            facts,
            status: new FileStatus({
              file: file.name,
              source: "download",
              loadedAt: at,
              lastAttemptAt: at,
              lastAttempt: "stored",
              message: null,
            }),
          }));
          yield* Effect.logInfo(`Stored a new ${file.name}`);
        });
        yield* attempt.pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logError(`Refresh of ${file.name} failed`, cause);
              yield* setStatus(file, (current, at) => ({
                facts: current.facts,
                status: attempted(current.status, at, "failed", String(cause)),
              }));
            }),
          ),
        );
      });

      const refresh = Effect.forEach(Object.values(FILES), refreshFile, { discard: true }).pipe(
        Effect.withSpan("Treasuries.refresh"),
      );

      return Treasuries.of({ facts, status, refresh });
    }),
  );

  /** Refreshes once right away, then on the configured interval with jitter. */
  static readonly scheduled = Layer.effectDiscard(
    Effect.gen(function* () {
      const treasuries = yield* Treasuries;
      const every = yield* RefreshEvery;
      yield* treasuries.refresh.pipe(
        Effect.repeat(Schedule.spaced(every).pipe(Schedule.jittered)),
        Effect.forkScoped,
      );
    }),
  );
}
