<p align="center">
  <img src="assets/logo.svg" alt="Skaff logo" width="480" height ="240">
</p>

#

<p align="center"><strong>Modern scaffolding toolkit</strong> for bootstrapping consistent, reproducible projects from templates.</p>

<p align="center">
  <a href="https://github.com/timonteutelink/skaff/actions/workflows/releaseCli.yml"><img alt="CI Status Cli" src="https://github.com/timonteutelink/skaff/actions/workflows/releaseCli.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/timonteutelink/skaff/actions/workflows/releaseWeb.yml"><img alt="CI Status Web" src="https://github.com/timonteutelink/skaff/actions/workflows/releaseWeb.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/timonteutelink/skaff/actions/workflows/releaseLib.yml"><img alt="CI Status Lib" src="https://github.com/timonteutelink/skaff/actions/workflows/releaseLib.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/timonteutelink/skaff/actions/workflows/releaseTypes.yml"><img alt="CI Status Types" src="https://github.com/timonteutelink/skaff/actions/workflows/releaseTypes.yml/badge.svg?branch=main"></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@timonteutelink/skaff"><img alt="@timonteutelink/skaff" src="https://img.shields.io/npm/v/%40timonteutelink%2Fskaff?label=%40timonteutelink%2Fskaff"></a>
  <a href="https://www.npmjs.com/package/@timonteutelink/skaff-lib"><img alt="@timonteutelink/skaff-lib" src="https://img.shields.io/npm/v/%40timonteutelink%2Fskaff-lib?label=%40timonteutelink%2Fskaff-lib"></a>
  <a href="https://www.npmjs.com/package/@timonteutelink/template-types-lib"><img alt="@timonteutelink/template-types-lib" src="https://img.shields.io/npm/v/%40timonteutelink%2Ftemplate-types-lib?label=%40timonteutelink%2Ftemplate-types-lib"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue">
</p>
<p align="center">
</p>

<p align="center">
  <a href="https://timonteutelink.github.io/skaff">Documentation</a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="https://discord.gg/efVC93Cr">Discord</a>
</p>


## Installation

The CLI can be used without a global install.

### `bunx`

```bash
bunx @timonteutelink/skaff --version
```

### Global install

If you prefer a permanent install:

```bash
npm install -g @timonteutelink/skaff
# or, with bun:
bun add -g @timonteutelink/skaff
```

### GitHub releases

Prebuilt binaries for major platforms are attached to each GitHub release. Download the appropriate binary and place it on your `PATH`.

### Nix flake

skaff is packaged as a Nix flake. To run it:

```bash
# run directly from GitHub
nix run github:timonteutelink/skaff

# or from a local checkout:
nix develop       # enter a dev shell with all dependencies
nix build         # build the package
nix run           # execute the CLI
```

## Quickstart

To scaffold a new project from a template, call the `project new` command. This example generates a **FastAPI** service named `banana` from the [`example-templates` repository](https://github.com/timonteutelink/example-templates):

```bash
bunx @timonteutelink/skaff project new banana \
  --repo github:timonteutelink/example-templates \
  fastapi
```

This will clone or fetch the `fastapi` template, prompt you for required values and options, then produce a ready‑to‑run FastAPI application. For an overview of available commands and options, run:

```bash
skaff --help

```

## Overview

**skaff** helps teams standardize how they start new services, microservices and libraries. It codifies best practices into reusable templates, prompts you for the variables that matter, and writes out a ready‑to‑run project. Because templates are versioned and configured with Zod schemas, they remain type‑safe and upgradeable. The CLI runs anywhere Node or Bun can, prebuilt binaries can be downloaded from releases, and a Nix flake is provided for reproducible builds.

## Features

- **One‑command scaffolding.** Generate a new project or apply a subtemplate with a single command or click. A guided prompt collects the name, options and feature flags and applies them consistently across all files and configs.
- **Diff preview and patching.** skaff shows you exactly what will be created or changed. For existing projects it generates a git patch so you can inspect and commit the changes yourself.
![Preview Patching](assets/previewPatching.png)
- **Multi‑platform distribution.** Use it instantly via `npx` or `bunx`, install globally with npm or bun, download a prebuilt binary, or run it as a reproducible Nix flake.
- **Visual Web UI.** A Next.js powered interface allows you to browse templates, fill in form fields, preview the resulting file tree or diff, and apply patches without touching the terminal
- **Flexible configuration.** Configure where your templates live and where to create projects through a simple JSON config or environment variables like `TEMPLATE_DIR_PATHS`, `PROJECT_SEARCH_PATHS`
- **Language agnostic.** Templates can target any stack like FastAPI, React, Go and Rust as long as they ship a schema. Additional template repositories can be referenced with `--repo`, and GitHub template retrieval is on the roadmap.

## How it works

When you invoke skaff, it will:

1. Resolve the template source (local directory, configured paths or a remote repo).
2. Read the template’s schema and definitions from `templateConfig.ts`.
3. Prompt you for the required inputs, validating them with Zod.
4. Generate files and configuration into the target directory.
5. Produce a git diff or patch so you can review and commit the changes.

Templates may also include tasks, linting and formatting setups so that your new project is productive out of the box.

## CLI

The CLI follows the standard `skaff <command> [options]` pattern. Common commands include:

- `skaff project new <name> [template]` – create a new project or subproject.
- `skaff help [command]` – print detailed help for a command.

Run `skaff --help` to see the full list of commands and flags.

## Web interface

In addition to the CLI, skaff provides a Web UI. The Web interface makes it easy to browse templates, enter values through forms, preview the file tree or diff and apply the changes interactively

### Using Docker

The recommended way to run the Web UI is via Docker. Pull the image and run it on port 3000:

```bash
docker run -p 3000:3000 -v ~/projects/templated:/projects timonteutelink/skaff:latest
```

Now open **http://localhost:3000** in your browser. The volume mount allows the UI to read your `~/projects/templated` directory.

### Running locally

If you have Node.js and bun or Bun installed, you can run the Web UI from source:

```bash
bun install
bun build
bun --filter apps/web dev
```

Open http://localhost:3000 to access the interface. When running locally the app uses your home directory’s `~/.config/skaff` by default, and you can update the settings through the UI.

## Contributing

We appreciate contributions of all kinds. Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide. In summary:

- Set up the monorepo with `bun install` and build the core libs
- Use `bun test` to run unit tests, and run `bun format` / `bun lint` before committing
- Work on a feature branch and open a Pull Request against `main`. PRs run continuous integration and should be kept focused
- Releases are handled by maintainers via semantic versioning and GitHub Actions; you usually don’t need to publish packages yourself

## License

skaff is released under the **GNU General Public License v3.0**. This copyleft license ensures that any modifications and improvements you distribute must also be made available under the same terms, keeping the tooling free and open for everyone. See the [LICENSE](./LICENSE) file for the full text.

---

## Documentation & community

- **Documentation:** The full manual and API reference are hosted at [timonteutelink.github.io/skaff](https://timonteutelink.github.io/skaff).
- **Community:** Join our Discord to ask questions and share ideas: [https://discord.gg/efVC93Cr](https://discord.gg/efVC93Cr).

---
