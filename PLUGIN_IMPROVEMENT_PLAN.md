Create a plan for securing or improving the plugin situation in the webinterface. We need to fix problem 1.1! The webinterface is distributed using its dockerfile. Should we add a build arg or a environment arg to the dockerfile to add specific webbased plugins? This way the precise version of the plugin can be distributed? Or should we always load it from the path defined in ~/.config/skaff/settings.json? Or should we allow loading plugins from the gui? How can we ensure secure plugins? Are they secure when the npm registry has provenance and a user can view the code? what is the best we can do to improve and secure our plugin loading support in skaff-lib, skaff-web and skaff-cli! It also needs to be a versatile and usefull solution! How do dynamic imports work in a webbrowser? Plugins can be made by anyone in the ecosystem just like templates! We only really deploy the web interface in docker! I want plugins to be only installable from the dockerfile if that is more secure? For oclif we might be able to use the oclif plugin ecosystem! and when someone uses skaff lib they can directly install the plugin? Would this be the most secure installation method? Docker build/env args, oclif plugins and direct installation when using lib! Plugins should not be allowed to be installed any other way. If a template is loaded that requires a plugin but then plugin is not installed then that template can not be used until the plugin is installed! We will provide prebuilt images for the web interface on docker hub! Users can selfhost the interface or run it locally! We also bundle using nix so the solution probably requires a runtime installation process. We will have a specific scope on npm for official plugins and users can also install any of their own npm packages on npm registry or any other registry(Possibly using authentication)! When a template requires a plugin that is not installed the template will be visible but will be disabled with a clear message(Missing plugin or version(s) incompatible)! 


# Secure Plugin Installation Plan for Skaff

## Understanding the Constraints

Let me first clarify my understanding of your requirements:

1. **Web interface** - Docker-only deployment, plugins must be installed at build time
2. **CLI** - Could leverage oclif's plugin ecosystem
3. **Library** - Direct npm installation when using skaff-lib programmatically
4. **Security** - Plugins from npm with provenance, no runtime installation in web
5. **Nix** - Bundling requires consideration for runtime processes
6. **Template compatibility** - Templates requiring missing plugins are disabled, not hidden

---

## Questions Before Proceeding

Before I finalize the plan, I need clarification on a few points:

### Q1: Plugin Scope Strategy
You mentioned a specific npm scope for official plugins (e.g., `@skaff/plugin-*`). Should we:
- **(A)** Only allow official `@skaff/*` plugins by default, with explicit opt-in for third-party
- **(B)** Allow any npm package but show "unverified" warning for non-official
- **(C)** Allow any package equally, relying on npm provenance alone

### Q2: Plugin Version Pinning
When a Dockerfile specifies plugins, should versions be:
- **(A)** Exact versions only (`@skaff/plugin-foo@1.2.3`)
- **(B)** Semver ranges allowed (`@skaff/plugin-foo@^1.2.0`)
- **(C)** Both, but exact recommended in production

### Q3: Private Registry Authentication
For users with private npm registries, should authentication be:
- **(A)** Environment variables at build time only (`.npmrc` baked in)
- **(B)** Runtime secrets mounted into container
- **(C)** Both supported with documentation

### Q4: CLI Plugin Installation Permission
For the CLI using oclif plugins, who should be able to install plugins:
- **(A)** Only during initial setup (like npm global install)
- **(B)** Any user at any time via `skaff plugins:install`
- **(C)** Configurable via admin policy

---

## Proposed Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PLUGIN INSTALLATION                          │
├─────────────────┬──────────────────────┬────────────────────────────┤
│   skaff-web     │     skaff-cli        │       skaff-lib            │
│   (Docker)      │     (oclif)          │       (Library)            │
├─────────────────┼──────────────────────┼────────────────────────────┤
│ Build-time only │ oclif plugin system  │ Direct npm dependency      │
│ via Dockerfile  │ skaff plugins:install│ in package.json            │
│ ARG/ENV config  │ plugins.json         │                            │
└─────────────────┴──────────────────────┴────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PLUGIN REGISTRY (npm)                           │
├─────────────────────────────────────────────────────────────────────┤
│ @skaff/plugin-* (official, verified, provenance)                    │
│ @org/skaff-plugin-* (third-party, npm provenance)                   │
│ private registries (authenticated, user responsibility)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Plan

### Part 1: Web Interface (Docker Build-Time Installation)

#### 1.1 Dockerfile Modifications

**Current State:** The Dockerfile builds the web app without plugin support.

**Proposed Changes:**

```dockerfile
# New build arguments for plugin installation
ARG SKAFF_PLUGINS=""
ARG SKAFF_PLUGIN_REGISTRY="https://registry.npmjs.org"
ARG NPM_TOKEN=""

# Install plugins at build time
RUN if [ -n "$SKAFF_PLUGINS" ]; then \
      for plugin in $SKAFF_PLUGINS; do \
        npm install --save "$plugin"; \
      done; \
    fi

# Generate plugin manifest at build time
RUN node scripts/generate-plugin-manifest.js
```

**Usage:**
```bash
docker build \
  --build-arg SKAFF_PLUGINS="@skaff/plugin-greeter@1.0.0 @skaff/plugin-docker@2.1.0" \
  -t my-skaff-web .
```

#### 1.2 Build-Time Plugin Manifest Generation

Create a script that scans installed plugins and generates a static manifest:

**File:** `apps/web/scripts/generate-plugin-manifest.js`
- Scans `node_modules` for packages matching plugin criteria
- Validates each plugin's `manifest` export
- Generates `public/plugin-manifest.json` with:
  - Plugin name, version, capabilities
  - Import path (relative to bundle)
  - Integrity hash (SHA-256 of plugin code)

#### 1.3 Web Plugin Loader Modifications

**Current:** `apps/web/src/lib/plugins/web-stage-loader.ts` uses dynamic `import()`

**Problem:** Dynamic imports in browsers work via:
1. **Bundled imports** - Resolved at build time, included in bundle
2. **External URLs** - Fetched at runtime (security risk)
3. **Import maps** - Browser feature for mapping specifiers to URLs

**Proposed Solution:** Use bundled imports only

**New Approach:**
```typescript
// apps/web/src/lib/plugins/plugin-registry.ts

// Generated at build time by generate-plugin-manifest.js
import pluginManifest from '@/public/plugin-manifest.json';

// Static imports for all installed plugins (generated at build time)
// This file is auto-generated - do not edit manually
import * as pluginGreeter from '@skaff/plugin-greeter';
import * as pluginDocker from '@skaff/plugin-docker';

const INSTALLED_PLUGINS: Record<string, SkaffPluginModule> = {
  '@skaff/plugin-greeter': pluginGreeter.default,
  '@skaff/plugin-docker': pluginDocker.default,
};

export function getInstalledPlugin(name: string): SkaffPluginModule | null {
  return INSTALLED_PLUGINS[name] ?? null;
}

export function getPluginManifest(): PluginManifestEntry[] {
  return pluginManifest;
}
```

**Benefits:**
- No runtime dynamic imports
- All plugin code is bundled and minified
- Tree-shaking removes unused plugin code
- CSP can block external script loading

#### 1.4 Plugin Verification at Build Time

Add verification step in Dockerfile:

```dockerfile
# Verify plugin provenance and signatures
RUN node scripts/verify-plugins.js
```

**Verification checks:**
1. npm provenance attestation (if available)
2. Package integrity against lock file
3. Plugin manifest schema validation
4. No dangerous exports (no raw `eval`, etc.)

---

### Part 2: CLI (oclif Plugin System)

#### 2.1 Leverage oclif's Plugin Architecture

oclif has a built-in plugin system that's well-tested and secure:

**Current:** `apps/cli` uses oclif but doesn't expose plugin installation

**Proposed:** Enable oclif plugin commands

```typescript
// apps/cli/src/index.ts
import { Config } from '@oclif/core';

const config = await Config.load(__dirname);
// oclif automatically supports:
// - skaff plugins:install <plugin>
// - skaff plugins:uninstall <plugin>
// - skaff plugins:list
// - skaff plugins:update
```

#### 2.2 Plugin Installation Location

oclif stores plugins in `~/.local/share/skaff/` (or platform equivalent):

```
~/.local/share/skaff/
├── node_modules/           # Installed plugins
├── package.json            # Plugin dependencies
└── plugins.json            # oclif plugin state
```

This is separate from `~/.config/skaff/settings.json` (user preferences).

#### 2.3 Plugin Source Restrictions

Configure oclif to only allow npm registry sources:

```typescript
// apps/cli/oclif.manifest.json
{
  "plugins": {
    "allowedScopes": ["@skaff", "@timonteutelink"],
    "allowedRegistries": ["https://registry.npmjs.org"],
    "requireProvenance": true  // Custom extension
  }
}
```

#### 2.4 Integration with Template Requirements

When CLI loads a template that requires a plugin:

```typescript
// apps/cli/src/commands/project/new.ts
const requiredPlugins = template.config.plugins?.map(p => p.module) ?? [];
const installedPlugins = await getInstalledPlugins();

const missing = requiredPlugins.filter(p => !installedPlugins.has(p));
if (missing.length > 0) {
  this.log(chalk.yellow(`Template requires missing plugins:`));
  missing.forEach(p => this.log(`  - ${p}`));
  this.log(chalk.cyan(`Install with: skaff plugins:install ${missing.join(' ')}`));
  throw new Error('Missing required plugins');
}
```

---

### Part 3: Library (Direct npm Installation)

#### 3.1 Plugin Resolution from Dependencies

When using skaff-lib directly, plugins are installed via npm:

```json
// User's package.json
{
  "dependencies": {
    "@timonteutelink/skaff-lib": "^1.0.0",
    "@skaff/plugin-greeter": "^1.0.0"
  }
}
```

**Plugin discovery:**
```typescript
// packages/skaff-lib/src/core/plugins/plugin-resolver.ts
export async function resolveInstalledPlugins(): Promise<InstalledPlugin[]> {
  // Use require.resolve to find plugins in node_modules
  // Validate each plugin's manifest
  // Return list of installed, validated plugins
}
```

#### 3.2 No Runtime Installation

skaff-lib should NOT provide a runtime installation mechanism:

```typescript
// packages/skaff-lib/src/index.ts

// DO NOT EXPORT:
// - installPlugin()
// - downloadPlugin()
// - fetchPluginFromRegistry()

// ONLY EXPORT:
// - loadPluginsForTemplate() - loads from node_modules
// - validatePlugin() - validates a plugin module
```

---

### Part 4: Template Plugin Requirements

#### 4.1 Plugin Declaration in Template Config

Templates declare required plugins:

```typescript
// templateConfig.ts
export const plugins: TemplatePluginConfig[] = [
  { 
    module: "@skaff/plugin-docker", 
    version: "^2.0.0",  // NEW: version constraint
    optional: false,    // NEW: required vs optional
  },
];
```

#### 4.2 Version Compatibility Checking

**New file:** `packages/skaff-lib/src/core/plugins/plugin-compatibility.ts`

```typescript
export interface PluginCompatibilityResult {
  compatible: boolean;
  installedVersion?: string;
  requiredVersion: string;
  reason?: 'missing' | 'version_mismatch' | 'deprecated';
}

export function checkPluginCompatibility(
  required: TemplatePluginConfig,
  installed: InstalledPlugin | undefined,
): PluginCompatibilityResult {
  if (!installed) {
    return { compatible: false, requiredVersion: required.version, reason: 'missing' };
  }
  
  if (!semver.satisfies(installed.version, required.version)) {
    return {
      compatible: false,
      installedVersion: installed.version,
      requiredVersion: required.version,
      reason: 'version_mismatch',
    };
  }
  
  return { compatible: true, installedVersion: installed.version, requiredVersion: required.version };
}
```

#### 4.3 Template Disabling UI

**Web Interface:**
```tsx
// apps/web/src/components/template-card.tsx
function TemplateCard({ template }: Props) {
  const compatibility = usePluginCompatibility(template);
  
  if (!compatibility.allSatisfied) {
    return (
      <Card disabled className="opacity-60">
        <CardHeader>
          <h3>{template.name}</h3>
          <Badge variant="warning">Plugins Required</Badge>
        </CardHeader>
        <CardContent>
          <p>This template requires plugins that are not installed:</p>
          <ul>
            {compatibility.missing.map(p => (
              <li key={p.module}>
                {p.module} ({p.version}) - {p.reason}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Rebuild the Docker image with these plugins to use this template.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return <EnabledTemplateCard template={template} />;
}
```

**CLI:**
```
$ skaff template list
┌─────────────────┬──────────┬───────────────────────────────────┐
│ Template        │ Status   │ Notes                             │
├─────────────────┼──────────┼───────────────────────────────────┤
│ my-app          │ ✓ Ready  │                                   │
│ docker-service  │ ✗ Plugin │ Missing: @skaff/plugin-docker@2.x │
│ kubernetes-app  │ ✗ Plugin │ Version mismatch: k8s@1.x (have 2.x)
└─────────────────┴──────────┴───────────────────────────────────┘
```

---

### Part 5: Nix Integration

#### 5.1 Nix Package with Plugin Support

**Current:** `nix/skaff-package/` builds skaff without plugin configuration

**Proposed:** Add plugin overlay

```nix
# nix/skaff-package/web-package.nix
{ plugins ? [] }:

let
  # Resolve plugin packages from nixpkgs or custom derivations
  pluginPackages = map (p: pkgs.nodePackages.${p}) plugins;
in
pkgs.buildNpmPackage {
  # ... existing config ...
  
  preBuild = ''
    # Install plugins
    ${lib.concatMapStrings (p: "npm install ${p}\n") plugins}
    
    # Generate plugin manifest
    node scripts/generate-plugin-manifest.js
  '';
}
```

**Usage:**
```nix
skaff-web.override {
  plugins = [
    "@skaff/plugin-greeter"
    "@skaff/plugin-docker"
  ];
}
```

#### 5.2 Runtime vs Build-Time

For Nix, plugins MUST be build-time only:
- Nix store is immutable
- Runtime installation would require a mutable data directory
- This aligns with Docker build-time installation

---

### Part 6: Security Model

#### 6.1 Trust Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRUST LEVELS                               │
├─────────────────────────────────────────────────────────────────┤
│ Level 1: Official (@skaff/*)                                    │
│   - Maintained by Skaff team                                    │
│   - Signed releases                                             │
│   - Security audited                                            │
│   - Shown with verified badge                                   │
├─────────────────────────────────────────────────────────────────┤
│ Level 2: Verified Third-Party                                   │
│   - npm provenance attestation                                  │
│   - Linked to GitHub Actions build                              │
│   - Reproducible builds                                         │
│   - Shown with provenance badge                                 │
├─────────────────────────────────────────────────────────────────┤
│ Level 3: Unverified Third-Party                                 │
│   - Standard npm package                                        │
│   - No provenance                                               │
│   - User assumes responsibility                                 │
│   - Shown with warning                                          │
├─────────────────────────────────────────────────────────────────┤
│ Level 4: Private Registry                                       │
│   - User's own registry                                         │
│   - Authentication required                                     │
│   - Full user responsibility                                    │
│   - No verification possible                                    │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2 npm Provenance Verification

npm provenance provides:
- **Build attestation** - Proof the package was built by a specific CI workflow
- **Source link** - Connection to source repository commit
- **Tamper detection** - Any modification breaks attestation

**Implementation:**
```typescript
// packages/skaff-lib/src/core/plugins/plugin-verifier.ts
import { verify } from '@sigstore/verify';

export async function verifyPluginProvenance(
  packageName: string,
  version: string,
): Promise<ProvenanceResult> {
  const attestation = await fetchNpmAttestation(packageName, version);
  
  if (!attestation) {
    return { verified: false, reason: 'no_attestation' };
  }
  
  const result = await verify(attestation);
  
  return {
    verified: result.valid,
    sourceRepo: result.sourceRepository,
    buildWorkflow: result.buildWorkflow,
    commitSha: result.commitSha,
  };
}
```

#### 6.3 Build-Time Security Checks

During Docker/Nix build:

1. **Integrity check** - Compare package hash against lock file
2. **Provenance check** - Verify npm attestation (if available)
3. **Manifest validation** - Plugin exports valid `SkaffPluginModule`
4. **Capability audit** - Log what capabilities plugin requests
5. **Dependency scan** - Check for known vulnerabilities (npm audit)

```dockerfile
# Dockerfile
RUN npm audit --production
RUN node scripts/verify-plugins.js --require-provenance
```

---

### Part 7: Prebuilt Docker Images

#### 7.1 Official Images on Docker Hub

**Strategy:** Provide base image + documented extension pattern

```
Docker Hub: skaff/skaff-web
├── latest        # Base image, no plugins
├── 1.0.0         # Specific version, no plugins
├── 1.0.0-full    # All official plugins included
└── 1.0.0-minimal # No plugins, smallest image
```

#### 7.2 Extension Dockerfile

Users extend the base image:

```dockerfile
FROM skaff/skaff-web:1.0.0

# Add custom plugins
ARG SKAFF_PLUGINS="@skaff/plugin-greeter @myorg/my-plugin"
RUN npm install $SKAFF_PLUGINS && node scripts/generate-plugin-manifest.js

# Rebuild with new plugins
RUN npm run build
```

#### 7.3 Multi-Stage Build for Security

```dockerfile
# Stage 1: Install and verify plugins
FROM node:20-alpine AS plugin-installer
WORKDIR /plugins
COPY package.json package-lock.json ./
ARG SKAFF_PLUGINS=""
RUN npm ci
RUN if [ -n "$SKAFF_PLUGINS" ]; then npm install $SKAFF_PLUGINS; fi
RUN npm audit --production
COPY scripts/verify-plugins.js ./
RUN node verify-plugins.js

# Stage 2: Build application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=plugin-installer /plugins/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
CMD ["node", "dist/server.js"]
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Add `version` field to `TemplatePluginConfig`
2. Implement `checkPluginCompatibility()` in skaff-lib
3. Create plugin manifest schema
4. Add "template disabled" UI states

### Phase 2: Web Build-Time Installation (Week 3-4)
1. Modify Dockerfile with plugin build args
2. Create `generate-plugin-manifest.js` script
3. Refactor `web-stage-loader.ts` to use static imports
4. Create plugin verification script

### Phase 3: CLI Plugin System (Week 5-6)
1. Enable oclif plugin commands
2. Add plugin source restrictions
3. Integrate with template requirements
4. Add `skaff plugins:verify` command

### Phase 4: Library Cleanup (Week 7)
1. Remove any dynamic plugin loading
2. Document npm-based installation
3. Add plugin discovery from node_modules

### Phase 5: Nix Integration (Week 8)
1. Add plugin overlay to Nix packages
2. Test build-time plugin installation
3. Document Nix usage

### Phase 6: Security & Polish (Week 9-10)
1. Implement provenance verification
2. Add trust level badges to UI
3. Security audit
4. Documentation

---

## Summary Table

| Environment | Installation Method | Runtime Loading | Security Model |
|-------------|-------------------|-----------------|----------------|
| Web (Docker) | Dockerfile build args | Static imports (bundled) | Build-time verification |
| CLI (oclif) | `skaff plugins:install` | oclif plugin loader | npm + provenance |
| Library | npm dependency | require/import | npm + provenance |
| Nix | Build-time overlay | Static imports | Nix hash verification |

---
