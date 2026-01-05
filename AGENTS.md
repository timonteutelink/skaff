# Agent Guidelines

## Quick orientation
- This is a Bun/TypeScript monorepo orchestrated with Turbo and Nix helpers.
- Core scaffolding logic lives in `packages/skaff-lib` and is consumed by the CLI (`apps/cli`) and Web UI (`apps/web`).
- Shared type definitions are published from `packages/template-types-lib` and referenced by the CLI and library builds.
- `packages/docs` hosts a legacy documentation site that is currently outdated; prefer the root `README.md` as the source of truth.
- `packages/notebook` contains Deno-powered notebooks and helper tasks for interactive experimentation.
- `packages/eslint-config`, `packages/typescript-config`, and `packages/tailwind-config` provide reusable configuration presets across the repo.

## Required workflow
- Always read the root `README.md` before making changes and update it whenever you spot missing or stale information.
- Documentation under `packages/docs` is outdated; touch it only if you intend to modernize it and ensure it stays consistent with the `README.md`.
- Before submitting any change, run the full test suite: `cd packages/skaff-lib && bun run test`. Do not skip tests.
- If your work affects behavior that lacks coverage, add or extend tests accordingly.
- Skaff-lib and template-types-lib are referenced via their built JavaScript outputs. Always build both before running tests. Use `bun run test:skaff-lib` from the repo root (or `bun run test:ci` inside `packages/skaff-lib`) to run the builds + tests together.
- If dependency state gets inconsistent, optionally run `make cr` before `bun install`, builds, and tests.
  - If you hit missing export/type errors when running skaff-lib tests, run `make cr && bun install` and re-run the skaff-lib test command to ensure `template-types-lib` is rebuilt first.

## Testing guidance (detailed)
The test flow depends on built outputs, so the safest path is:

1. **Optional cleanup & install**
   - `make cr` (removes lockfiles + node_modules for a clean install)
   - `bun install`
2. **Library-first test path (required before submitting)**
   - `cd packages/skaff-lib && bun run test`
     - This is the *required* full test suite check.
     - Internally it runs the build prerequisites and then Jest.
3. **Repo-wide tests (optional but recommended when touching CLI/Web/examples)**
   - `bun run test` (Turbo runs `test` across all packages that expose it)
   - `bun run test:cli` (CLI-specific test suite)
   - `bun run test:skaff-lib` (builds template-types + skaff-lib + plugin types, then runs Jest)

If you just need the single-command "build + test" pipeline for skaff-lib, use:
`bun run test:skaff-lib`

## General expectations
- Ensure any documentation edits remain consistent across the repo.
- When touching documentation, always look for opportunities to improve clarity or completeness.
