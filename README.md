# Code Templator

**Code Templator** is an open-source toolkit for **generating, maintaining, and evolving software projects from templates**. It lets you quickly scaffold new projects with best practices *and* continuously apply template updates to existing projects. Unlike one-off code generators, Code Templator uses **git patches** to merge template changes into your codebase. This means you can customize your project freely and still pull in upstream template improvements over time – all while preserving your own edits.

**Features at a glance:**

* **Flexible Template Engine:** Templates are just folders of text files (code, config, docs – anything) with Handlebars placeholders. No special DSL – if you can write it in a file, you can template it.
* **Strongly-Typed Config:** Each template defines a schema (with TypeScript + Zod) for user inputs and feature toggles. This ensures safe, validated inputs and provides auto-generated prompts/UI forms for your template’s options.
* **Nested Subtemplates:** Compose templates within templates. A *root template* can have any number of subtemplates (even nested multiple levels) representing optional components or features. You can add or remove subtemplates at any point – e.g. enable a “Dockerfile” subtemplate in a Node.js app or remove an optional module – without breaking the project.
* **Git Patch Workflow:** Under the hood, Code Templator applies changes via git diffs. When you generate a project or apply a subtemplate, it creates a git patch of the differences and applies it to your repo. This approach makes template updates non-destructive – you review and commit changes like a normal code change, preserving git history and your custom modifications.
* **Multi-Interface Monorepo:** Use Code Templator however you prefer. It includes a CLI (`apps/cli`) for terminal lovers, a local Web UI (`apps/web`) for an interactive form-driven experience (with diff previews), and a reusable Node.js API (`packages/code-templator-lib`) for integration into scripts or CI pipelines. All interfaces share the same core logic.

## How It Works

**Templates.** A template is a self-contained folder (usually stored in a git repo) containing a `templates/` directory (with all the template files) and a `templateConfig.ts` file defining the template’s metadata and schema. The template config uses our [template-types-lib] to declare: the template’s name, description, author, the Zod schema for settings, and any special behavior (like subtemplates or file post-processing). All user-defined settings become available to the Handlebars templates, allowing dynamic generation of files and content.

**Project Generation.** To create a new project, choose a root template and provide values for its settings (via CLI prompts, a JSON file, or the Web UI form). Code Templator then renders the template into a new project folder. It initializes a git repository for the project and records the template name, commit hash, and all settings in a `templateSettings.json` file inside the project. This file tracks the **template state** of the project (including all subtemplates and their options).

**Continuous Updates.** The recorded template state enables powerful syncing:

* Need to update your project to the latest template version? Run the update command – Code Templator will fetch the updated template, diff your project against it, and apply the changes as a git patch for you to review and merge. Your custom changes remain intact.
* Want to add a new feature module later? Simply instantiate the corresponding subtemplate. For example, if your Next.js app needs a new page, apply the “page” subtemplate – new files and modifications will be patched in. Removing a feature is just as easy: the tool can generate a patch to undo a subtemplate’s additions.

This **continuous templating** workflow means your project’s boilerplate never grows stale – you can always align with improvements in the template or adapt to new requirements by adding/removing template pieces.

**Templating Modes.** Code Templator is designed to handle a variety of use cases:

* *Full Project Scaffolding:* Generate an entire project from a template (with its own git repo and tracking). This is the primary mode – ideal for kickstarting new applications or services with a known structure.
* *Partial Templating (Stateful):* Apply a template *into* an existing project, while keeping a templateSettings record. This is useful for adding a new component/module to a larger codebase and still being able to update or remove it later via the template engine. (Planned feature)
* *Partial Templating (Stateless):* One-off injection of templated files into an existing project, **without** tracking state. This is like an “insert snippet” operation – useful when you just want to drop in some boilerplate and manage it entirely by hand afterward.

No matter the mode, the same git-diff approach is used to ensure that introducing template changes is transparent and conflict-minimized.

## Example Use Cases

* **Standardizing New Apps:** Kickstart projects with your organization’s best practices. For example, a “Next.js App” template can set up a complete web application skeleton – including folder structure, ESLint/Prettier config, CI workflows, etc. Subtemplates let developers toggle features like Tailwind CSS, authentication, testing setup, etc., at creation time. Every new app starts consistent, and when the template evolves (say, new ESLint rules or CI improvements), you can propagate those changes to all existing apps effortlessly.
* **Modular Monorepo Scaffolding:** Manage complex setups with subtemplates. Imagine a **Turborepo** template for a polyglot monorepo. The root template creates the repository with shared config (e.g. a Nx or Turborepo config). Subtemplates could allow adding a new package or app to the monorepo (e.g. a Next.js webapp module or a Node microservice). You could even nest subtemplates further: a “Next.js App” subtemplate might itself include a “Homepage Page” subtemplate to add a default page component. This makes it easy to grow the repository by injecting new pieces as needed.
* **Infrastructure as Code Templates:** Use Code Templator for ops too. For instance, a **Helm Chart** template could scaffold a standard Kubernetes chart. Subtemplates under it might include an Ingress resource, a Deployment config, a HorizontalPodAutoscaler, etc. Each subtemplate can also update central files – our Helm subtemplate example automatically merges environment variables into the chart’s `values.yaml` using a side-effect function. The result is a tailored chart where you can add components on demand and still update the whole chart when best practices change.
* **CLI and Library Generators:** Create templates for any programming language or framework. A **Rust CLI tool** template could generate a new binary crate with Clap argument parsing, a configured Cargo.toml, and CI scripts. Need to add another CLI sub-command later? Add a subtemplate that creates a new module and wires it into the CLI.
* **Plugin/Extension Scaffolding:** Streamline plugin development with templates. A **WordPress Plugin** template can provide the basic PHP file structure, readme, and deployment scripts. Subtemplates might add optional components like a custom Gutenberg block or third-party API integration boilerplate. Similarly, you could template browser extensions, VSCode plugins, etc., with optional features.

These are just a few ideas – Code Templator can template *any* project that lives in a folder with text-based files. By combining Handlebars templating with the organizational power of subtemplates and the safety of git, you’re free to create templates for virtually any domain or stack.

## Getting Started

**1．Install the CLI:** Code Templator requires [Node.js](https://nodejs.org) (or [Bun](https://bun.sh)) and git. You can install the CLI globally via your preferred package manager:

```bash
# Using Bun (>= 1.2)
bun add -g @timonteutelink/code-templator-cli

# Or using npm
npm install -g @timonteutelink/code-templator-cli

# Or npx (no install step)
npx code-templator --help
```

> **Note:** The CLI is published as `@timonteutelink/code-templator-cli` on npm. You’ll also need `git` available in your PATH, as the engine uses git for diffing and patching.

**2．Create a new project from a template:** Once installed, you can generate a project in one command. For example, to create a new Next.js API route project:

```bash
code-templator project new my-api next-api
```

*(This will interactively prompt you for any template-specific settings, then scaffold `my-api/` as a new git repo.)*

<details>
  <summary><strong>▶ Sample Output</strong> (click to expand)</summary>

After running the above, you might see output summarizing the included features and files, for example:

* **Template:** Next.js API (with TypeScript)
* **Features:** ESLint, Prettier, Testing, Serverless-ready config

Your new project structure could look like:

```
my-api/
├─ pages/api/hello.ts    # Example endpoint (Hello World)
├─ package.json          # Project metadata & scripts
├─ .eslintrc.js          # Preconfigured linting rules
├─ .github/workflows/ci.yml   # CI pipeline ready to go
└─ ... other standard files ...
```

</details>

Now you have a fully functional project! You can `cd my-api` and start developing right away. In this example, the Next.js API template includes everything to deploy a serverless function (just `npm run dev` or `bun dev` to start).

**3．Apply a subtemplate (optional):** Want to extend your project? You can add subtemplates to an existing project using the CLI. For instance, if the `next-api` project has an optional “webpage” subtemplate, you could run:

```bash
code-templator project diff prepare-instantiation root webpage
```

This will generate a git diff introducing the new subtemplate (e.g. adding a new page file). Review the diff, then run `code-templator project diff apply <diff-id>` to apply it, or re-run with the `--apply` flag for one-step patching. *(The Web UI provides a more visual way to do this, if you prefer.)*

**4．Learn more:** Now that you’ve created a project, check out the documentation for next steps. You might explore:

* **Using the Web UI:** If you’d rather pick templates and options in a browser, see *Using the Web Interface* in the docs.
* **Template Authoring:** Ready to create your own templates? See the *Template Authoring Guide* to learn how to write templates with `templateConfig.ts` and subtemplates.
* **CLI Reference:** The CLI has many commands (for updates, diffing, etc.). See the [CLI Documentation][cli-docs] for a full reference.

## Documentation

Full documentation is available **[here on the Code Templator website](https://timonteutelink.github.io/code-templator/)**. Key sections include:

* **Getting Started Guide** – step-by-step installation and your first template project.
* **Using the Web UI** – running the local web interface and its features.
* **Template Authoring Guide** – how to build your own templates (with examples).
* **CLI & API Reference** – detailed reference for CLI commands and the TypeScript library.

## Contributing

Contributions are welcome! 🎉 If you have an idea for improvement or find a bug, please open an issue or pull request. We follow a typical GitHub flow:

* **Development:** This project is a TypeScript monorepo managed with pnpm workspaces. For local development, fork and clone the repo, run `pnpm install`, and you can work on the packages (CLI, web, etc.). We use Prettier and ESLint for consistency – please format your code before committing (CI will check this).
* **Feature Branches & PRs:** For any change, create a feature branch and submit a pull request to the **main** branch. Include a clear description of the problem or feature. For larger changes, it’s best to discuss in an issue first to align on design.
* **Testing:** Ensure that any new features or fixes include appropriate tests if possible. We aim to keep the core library reliable, as it’s used by all interfaces.
* **Releases:** The project uses semantic versioning. The repository is versioned with a single version number across packages for consistency. Releases are triggered via tags on the main branch (CI/CD will publish the CLI to npm and Docker, and the libraries to npm, etc., as needed).

We’d also love contributions of **new templates** or improvements to existing ones. If you have a great template for a framework or use case, feel free to add it to our [example templates repository](https://github.com/timonteutelink/code-templator-example-templates) or share it with the community!

By contributing, you agree that your contributions will be licensed under the same AGPL-3.0 license that covers this project.

## License

Code Templator is licensed under the **GNU AGPLv3** (see the [LICENSE](LICENSE) file for details). This copyleft license ensures that any modifications or derivative works you distribute must be open-sourced under the same terms. We chose AGPL to encourage a community of sharing improvements – if you extend Code Templator, those enhancements can benefit everyone. 😄

[cli-docs]: https://timonteutelink.github.io/code-templator/cli/ "Code Templator CLI Reference"
[template-types-lib]: https://timonteutelink.github.io/code-templator/template-types-lib/ "Template Types API"

---

*Happy templating!* Go build amazing projects faster, and keep them in sync with ease, using Code Templator.

