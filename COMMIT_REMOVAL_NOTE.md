# Remove Latest Commit from PR #110

## Task
Remove commit `29caff12` ("Fix sandboxed template testing pipeline") from PR #110.

## Current State of PR #110
- Branch: `codex/add-integration-tests-for-local-templates`
- Current HEAD: `29caff12db01e147d8890d485457ab02a222da9d`
- Contains 2 commits:
  1. `c0cc455b` - "Add local template integration test"
  2. `29caff12` - "Fix sandboxed template testing pipeline" ← **TO BE REMOVED**

## Required Action
To remove the latest commit from PR #110, the branch `codex/add-integration-tests-for-local-templates` must be reset to commit `c0cc455b`.

###  Manual Steps (requires repository write access with force push):
```bash
git checkout codex/add-integration-tests-for-local-templates
git reset --hard c0cc455b
git push origin codex/add-integration-tests-for-local-templates --force
```

## What will be removed
**Commit**: `29caff12db01e147d8890d485457ab02a222da9d`
**Message**: "Fix sandboxed template testing pipeline"
**Author**: timonteutelink <timon@teutelink.nl>
**Date**: Wed Dec 24 03:29:33 2025 +0100

**Modified files** (15 files):
- examples/plugins/plugin-greeter/src/index.ts
- examples/test-templates/test-template-repo/templates/test-template/templateConfig.ts
- examples/test-templates/test-template-repo/templates/test-template/test-subtemplate-1/teststuff/templateConfig.ts
- packages/skaff-lib/jest.config.ts
- packages/skaff-lib/src/core/generation/pipeline/pipeline-runner.ts
- packages/skaff-lib/src/core/infra/hardened-sandbox.ts
- packages/skaff-lib/src/core/infra/sandbox-endowments.ts
- packages/skaff-lib/src/core/shared/HandlebarsEnvironment.ts
- packages/skaff-lib/src/core/templates/config/TemplateConfigLoader.ts
- packages/skaff-lib/src/utils/handlebars-helpers.ts
- packages/skaff-lib/tests/helpers/template-fixtures.ts
- packages/skaff-lib/tests/plugin-loader.test.ts
- packages/skaff-lib/tests/setup-env.ts
- packages/skaff-lib/tests/template-plugin-integration.test.ts
- packages/template-types-lib/src/types/template-config-types.ts

## Result After Removal
The PR will contain only:
- Commit `c0cc455b`: "Add local template integration test" (the first commit)

Base branch (`codex/implement-central-sandboxing-service-for-plugins`) will remain unchanged at `557f5c9b`.
