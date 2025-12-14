# Skaff plugin support plan

## Overview
This plan introduces a first-class plugin surface so optional capabilities can extend Skaff without modifying the core packages. Plugins will be able to hook into template generation, surface custom type extensions, and offer CLI or Web UI affordances while remaining installable packages.

### Goals
- Keep the core library lean while enabling opt-in extensions.
- Provide consistent extension points across the library, CLI, and web interface.
- Support standalone type-only packages so templates can import shared definitions without pulling runtime code.
- Rely on npm-distributed packages (or workspace packages in monorepos) for installation and discovery.

### Plugin shape
A plugin ships one or more entry points:
- **Library hook**: implements `TemplateGenerationPlugin` (or similar) to modify the pipeline via `PipelineBuilder`.
- **Type exports**: publishes template type augmentations so template authors can import extended settings schemas.
- **CLI wiring**: optional entry that registers commands or middleware when the CLI bootstraps.
- **Web UI wiring**: optional entry that registers routes/components when the web app loads plugins.

A plugin may be published as separate packages (e.g., `@scope/skaff-plugin-foo-lib`, `@scope/skaff-plugin-foo-cli`, `@scope/skaff-plugin-foo-web`, `@scope/skaff-plugin-foo-types`) or a single package that exposes multiple subpath exports.

## High-level tasks

1. **Define plugin discovery contract**
   - Add configuration support (e.g., `skaff.plugins` array) that lists plugin module specifiers.
   - Implement a shared loader that `apps/cli` and `apps/web` can reuse to import the configured plugins and expose their declared entry points.

2. **Stabilize library extension points**
   - Finalize a `TemplateGenerationPlugin` interface with hooks for `PipelineBuilder` and generation context objects.
   - Ensure the generation pipeline composes plugins in a deterministic order and remains backward compatible when no plugins load.

3. **Publishable type surface**
   - Document how plugins can contribute additional template-config types without altering the core `template-types-lib` package.
   - Provide an example type-only package that templates can import to access plugin-specific schema helpers.

4. **CLI plugin integration**
   - Allow CLI bootstrap to load configured plugins and let each plugin register commands or middleware.
   - Ensure CLI prompts and output can be extended without forking the base command set.

5. **Web UI plugin integration**
   - Introduce a lightweight route/component registry so plugins can add pages or panels in the generation flow.
   - Support lazy loading of plugin UI bundles to keep the base build small when plugins are absent.

6. **Packaging and installation**
   - Document npm publishing expectations (scoped packages, semantic versioning, peer dependencies on core Skaff packages).
   - Support workspace-local plugin development for monorepos while keeping deployment aligned with npm packages.

7. **Example plugin**
   - Build a reference plugin that touches all surfaces (library hook, CLI, web UI, types) to validate the extension points and serve as a template for future plugins.

8. **Testing and validation**
   - Add automated tests that load sample plugins across the library, CLI, and web environments.
   - Include integration checks to ensure plugin failures are isolated and surfaced with clear errors.

9. **Documentation**
   - Provide contributor docs that explain how to author plugins, how discovery works, and how to consume plugin-provided types in templates.
   - Keep README and web documentation aligned with the new plugin architecture.
