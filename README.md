# Code Templator

[![NPM Version – Library](https://img.shields.io/npm/v/@timonteutelink/code-templator-lib.svg?label=Library%20NPM)](https://www.npmjs.com/package/@timonteutelink/code-templator-lib)
![Build Status – Library](https://img.shields.io/github/actions/workflow/status/timonteutelink/code-templator/library-ci.yml?branch=main)
[![API Docs – TypeDoc](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://your-docs-domain)
[![NPM Version – CLI](https://img.shields.io/npm/v/code-templator.svg?label=CLI%20NPM)](https://www.npmjs.com/package/code-templator)
![Build Status – CLI](https://img.shields.io/github/actions/workflow/status/timonteutelink/code-templator/cli-ci.yml?branch=main)
![Build Status – Web UI](https://img.shields.io/github/actions/workflow/status/timonteutelink/code-templator/web-ci.yml?branch=main)

## Introduction

**Code Templator** is a powerful templating engine and toolkit for generating **and** evolving software projects. It helps developers and engineering teams quickly scaffold new projects with best practices, while **also** keeping those projects up-to-date as templates improve. Unlike traditional code generators that only create a project once, Code Templator lets you continuously reapply template changes (via git patches) so your code stays in sync with the latest template enhancements. This means you can standardize project structure and configurations across many repositories and easily incorporate updates over time.

Templates in Code Templator are simply directory folders with files written using **Handlebars**, a popular logic-less templating language (templates look like regular text with embedded placeholders). Each template has a `templateConfig.ts` that defines a schema (using **Zod**, a TypeScript-first schema validation library) for user-provided settings and feature toggles. This ensures template inputs (like project name, author info, or feature flags) are **validated and strongly typed**, giving users a safe and predictable generation process.

## Key Features

* **Customizable Templates** – Define templates as folder structures with Handlebars-based files for flexible content generation. You can template anything: code files, config files, README text, etc., using the full power of Handlebars expressions and helpers.
* **Template Configuration with Zod** – Each template ships with a `templateConfig.ts` that uses Zod schemas to define required inputs and optional features. This provides a clear contract for template options (e.g. enabling/disabling certain components) and automatically validates user input.
* **Nested Subtemplates** – Organize templates into **subtemplates** for modularity. Subtemplates allow optional pieces of a project (for example, a Docker setup, a testing framework, or specific plugin) to be generated on demand. They can be added or removed at any time, even after the project is created, without breaking the overall structure.
* **Git Patch Application** – Instead of naive file copying, Code Templator applies templates using git diffs/patches. This **unique approach** means you can re-run or update a template on an already modified project. Changes from the template are merged into your codebase as a git patch, preserving any custom modifications you’ve made while applying new template updates. This makes Code Templator not just a generator, but a tool for **maintaining** and evolving projects over time.
* **Multi-Interface Monorepo** – Code Templator is delivered as a TypeScript **monorepo** containing:

  * a command-line interface (**CLI**) built with Oclif (`apps/cli`)
  * a web-based GUI (Next.js app in `apps/web`) for interactive templating through a browser
  * a reusable core library (`packages/code-templator-lib`) published to NPM as `@timonteutelink/code-templator-lib` for integration into other tools or CI pipelines
    These components share the same core logic, enabling you to use Code Templator in the way that best fits your workflow.

## Use Cases

Code Templator can be used to standardize and bootstrap a variety of project types. Here are a few real-world examples of what you can build with it:

* **Next.js App Scaffolding** – Create a company-standard Next.js starter app with all the boilerplate (folder structure, linting, CI config, etc.) set up. Subtemplates could allow toggling features like Tailwind CSS, authentication module, testing setup, etc. as needed.
* **Rust CLI Generator** – Define a template for a Rust command-line application using Clap or StructOpt. The template could include a pre-configured `Cargo.toml`, example command modules, and CI workflows. Developers can generate a new Rust CLI tool in seconds with all best practices in place.
* **WordPress Plugin Template** – Scaffold a new WordPress plugin project (PHP) with the correct file layout, sample plugin code, and deployment scripts. Using subtemplates, you might optionally add components like a custom Gutenberg block or integration with an external API.
* **Helm Chart Builder** – Maintain a template for Helm charts to deploy applications on Kubernetes. The base template could create a standard chart structure, and subtemplates could represent add-on k8s resources (e.g. an Ingress, a Database config, a HorizontalPodAutoscaler). Teams can generate a chart and later apply additional subtemplates to introduce new resources as the application grows.

These examples illustrate how Code Templator helps enforce consistency across projects. A platform engineering team can codify their best practices into templates, so that every new service or app starts with the right foundation. More importantly, when best practices evolve (say you change your CI/CD setup or upgrade a framework), you can update the template and then reapply it to existing projects to automatically propagate those changes.

## Evolving Projects Over Time

One of the **biggest advantages** of Code Templator is that it treats project templates as living blueprints rather than one-off generators. You don’t have to abandon the template after initial generation – instead, you can continuously pull in updates:

* **Reapply Template Updates:** If the template improves (new features, dependency upgrades, refactoring, etc.), simply run the CLI to apply the latest template to your project. Code Templator will generate a git patch of the differences and apply it to your repository. You get to review changes (just like a pull request) and merge them, ensuring your project stays up-to-date with minimal effort. This addresses the common issue where scaffolded projects diverge and miss out on upstream improvements.
* **Add/Remove Subtemplates:** Decided to add a new module to your project later on? No problem – run a command to apply the corresponding subtemplate. Code Templator will insert the new files and code diffs for that feature into your project. Conversely, if you no longer need a component, the tool can generate a patch to remove or disable it. This dynamic nature lets your codebase evolve along with your requirements.

By using git patches under the hood, these updates are transparent and safe. You maintain full control – if there are conflicts with your local changes, you can resolve them manually during the patch apply (just as you would with any merge conflict). In essence, Code Templator enables **continuous templating**: your projects can keep in sync with template revisions without resorting to manual copy-paste.

## Project Structure and Packages

This repository is a monorepo containing multiple packages/apps, each with its own responsibility. The main components are:

* **CLI –** Located in [`apps/cli`](apps/cli). An Oclif-based command-line interface for using Code Templator via terminal. It provides commands to create new projects, apply subtemplates, update projects, etc. *([See CLI README](apps/cli/README.md) for usage details.)*
* **Web UI –** Located in [`apps/web`](apps/web). A Next.js application that offers a web interface for Code Templator. This is primarily for local use (e.g. run it on your machine to interactively choose a template, fill in settings, and preview diffs before applying). *([See Web UI README](apps/web/README.md) for more info.)*
* **Core Library –** Located in [`packages/code-templator-lib`](packages/code-templator-lib). A reusable TypeScript library that implements the templating engine logic (loading templates, generating diffs, applying patches, etc.). This library is published to NPM as **`@timonteutelink/code-templator-lib`** and can be used in other Node.js projects or CI pipelines. *([See Library README](packages/code-templator-lib/README.md) for API details.)*

Each subproject has its own README with specifics. The root README (this file) provides a high-level overview and links to those submodules.

## Documentation

**Full documentation** for Code Templator is available on our documentation site (built with Docusaurus). There you will find:

* **Getting Started Guides:** Step-by-step tutorials on installing the CLI, creating your first project from a template, and using the web UI.
* **CLI Reference:** Detailed documentation of every CLI command and flag (auto-generated from the Oclif CLI help).
* **API Reference:** TypeDoc-generated reference for the code-templator-lib (for those who want to use the library directly in JavaScript/TypeScript).
* **Template Authoring Guide:** Best practices for writing your own templates (using Handlebars syntax, defining `templateConfig.ts` with Zod schemas, organizing subtemplates, etc.).
* **Examples and Recipes:** More example templates and use-case guides to help you get the most out of Code Templator.

👉 **Visit the [Code Templator Documentation](https://your-docs-domain)** for in-depth guides and reference material.

*(If you are reading the README on GitHub, the documentation is also hosted in the `docs/` directory of the repository for offline access.)*

## Contributing

Contributions are welcome! If you have ideas for improvements or have found a bug, please open an issue or submit a pull request. We aim to follow a typical open-source workflow on GitHub: for larger changes, please discuss in an issue first. All contributions should adhere to the code style and standards of the project (linting and tests will run in CI).

If you want to add a new template or example to the repository, feel free – templates are a great way to extend the usefulness of Code Templator for more frameworks and languages. Check out the documentation’s authoring guide for tips on creating high-quality templates.

## License

This project is open-source software licensed under the **AGPL-3.0 License**. See the [LICENSE](LICENSE) file for details. This means any distributed modifications or derivative works should also be open-sourced under the same license. We chose AGPL to encourage a community of sharing improvements to the templating engine and to ensure that enhancements to Code Templator benefit everyone.

---

*Happy templating!*

