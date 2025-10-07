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

## General expectations
- Keep new instructions concise and ensure any documentation edits remain consistent across the repo.
- When touching documentation, always look for opportunities to improve clarity or completeness.
