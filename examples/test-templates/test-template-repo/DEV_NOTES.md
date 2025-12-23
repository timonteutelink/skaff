# Local test template repo (manual testing)

The Skaff template loader scans `<path>/templates` for template repositories, so
point `TEMPLATE_DIR_PATHS` at the repo root that contains the `templates/`
folder. See:

- `packages/skaff-lib/src/repositories/root-template-repository.ts`
- `packages/skaff-lib/src/lib/config.ts`

## Manual testing flow

```bash
export TEMPLATE_DIR_PATHS=/workspace/skaff/templates/test-templates
skaff project new demo-project test_template
```

`/workspace/skaff/templates/test-templates` is a convenience symlink to this
repo (`examples/test-templates/test-template-repo`), so the CLI can resolve the
local template without cloning a remote repository.
