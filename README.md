# polish-treasuries-api

Minimal ESM TypeScript application, bootstrapped with the **nub-pnpm** preset.

## Setup

- Runtime: Node **24.21.0** (newest LTS at generation), Nub **0.9.3**.
- Package manager: **pnpm@12.5.1**, recorded in `package.json`.
- Git and the selected runtime/package manager must already be available. No global
  tools are installed automatically.

```sh
pnpm install
pnpm run check
pnpm run start
```

Generation resolved fresh versions and checked version compatibility; it did
**not** install dependencies or execute project checks. The first installation
creates the lockfile. Keep exactly that package manager's lockfile and commit it.
Install-time release-age policies or newly incompatible tooling may reject fresh
versions; investigate instead of silently downgrading or disabling global policies.

Use the recorded Node LTS (`.node-version`) or Bun (`.bun-version`) version. The
Node typings follow the selected Node LTS major rather than a newer Current release.
For Bun, Vitest scripts explicitly select Bun's runtime, including its worker pools;
use `bun run test`, not `bun test` (which selects Bun's own test runner).

Installation runs `prepare` to install Lefthook. If scripts were skipped, run
`pnpm run prepare` explicitly.

## Commands

| Command      | Behavior                                                  |
| ------------ | --------------------------------------------------------- |
| `dev`        | Watch and run the entrypoint                              |
| `start`      | Run `src/index.ts` directly                               |
| `fmt`        | Format/write all supported files                          |
| `fmt:check`  | Check formatting without writing                          |
| `lint`       | Apply safe lint fixes; fail on remaining warnings/errors  |
| `lint:check` | Type-aware linting without writing; zero warnings         |
| `typecheck`  | Native TypeScript checking without emitting JS            |
| `test`       | Run Vitest once                                           |
| `test:watch` | Watch tests                                               |
| `check`      | Non-mutating format/lint checks, typechecking, then tests |

Run these with `pnpm run <command>`. There is no build pipeline or generated CI workflow.
Tests live beside source (`src/foo.ts`, `src/foo.test.ts`). Use `.ts` extensions in
relative imports. Intentionally unused parameters should start with `_`.

## Formatting, linting, and hooks

Oxfmt uses its defaults (no style overrides) and includes documentation/configuration
files. Generated artifacts are ignored. Type-aware Oxlint uses the adopted `prices`
rule configuration: correctness, suspicious/performance checks, import/promise/Vitest
plugins, explicit typed rules, and kebab-case filenames. Warnings fail checks.
A few taste-only rules (`no-await-in-loop` and several Vitest style rules) are
disabled explicitly; sequential `await` in a loop is a normal, intentional pattern.

Pre-commit tasks run **sequentially and stop on failure**:

1. Format staged files and re-stage fixes.
2. Safely lint/fix staged code and re-stage fixes.
3. Typecheck the whole project.
4. Test the whole project.

Lefthook hides unstaged hunks in partially staged files and restores them afterward.
This is **not a clean staged snapshot**: unrelated unstaged/untracked files remain
visible to whole-project checks. Restoration can conflict with autofixes; inspect
Lefthook's output rather than discarding local changes. There is no custom stash wrapper.

## Editor

Use a current VS Code with native TypeScript support and install the recommended
Oxc extension. Workspace settings select the project-local TypeScript toolchain and
run formatting followed by safe lint fixes on save. Other editors can use the same
local tools; no global editor settings are changed.

## Versions and upgrades

All direct dependencies are exact pins; package-manager configuration keeps new
additions exact too. Update deliberately and run the complete `check` afterward.
A new Oxlint version can enable new rules through configured categories. The
bootstrap command never silently selects older versions to make checks pass.

### Optional TypeScript 6 API compatibility

TypeScript 7 provides the native `tsc`. Some tools still need the old TypeScript JS
API. Only when necessary, use the official side-by-side alias strategy:

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@7.0.2",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  }
}
```

These illustrate exact pins; resolve current compatible versions before adding them.
`tsc` remains TS7, `tsc6` is TS6, and `import "typescript"` resolves to the TS6 API.
Point `js/ts.tsdk.path` and its `additionalLocations` entry at
`./node_modules/@typescript/native/bin` so the editor stays on TS7. Rerun `prepare` in Effect projects: current `effect-tsgo patch` recognizes
both package names. Verify the selected tooling supports this arrangement.

Do not install both compilers by default.
[Official compatibility instructions](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

## Effect

This is a full Effect application: prefer Effect services, Schema, Config, Clock,
Random, HTTP clients, logging, resource management, and structured concurrency over
native equivalents. The selected Effect-native diagnostics are errors, not suggestions.
Use a narrow, documented Effect diagnostic suppression only for intentional interop.

The runtime-specific platform adapter is selected by the preset. Tests use
`@effect/vitest` and `it.effect`; do not return Effects from ordinary Vitest callbacks.
The two Vitest assertion rules explicitly recognize Effect test functions; the
underlying rules remain enabled.

The initial install runs `effect-tsgo patch` against TypeScript 7. This makes the
same Effect-aware native compiler available to both `tsc` and the editor. There is
no legacy JS language-service dependency and no separate native-preview package.
A compiler upgrade/reinstall requires rerunning `prepare`. If installation scripts
were disabled, diagnostics and hooks are not ready until you do so.

Effect diagnostics are configured in `tsconfig.json`. Default warnings and errors
fail typechecking; suggestions remain advisory. The additional Effect-native group
is explicitly configured as errors. Oxlint is type-aware separately; it is not
patched by Effect and does not replace these diagnostics.

The generator resolves `effect@rc` and the corresponding platform/testing packages
from their RC channels. Their exact versions are pinned. Tags can
move or tooling can become incompatible: no fallback or silent downgrade is performed.

References:

- [Effect v4 installation](https://effect.website/docs/v4/getting-started/installation)
- [Effect TypeScript tooling and supported versions](https://github.com/Effect-TS/tsgo)
