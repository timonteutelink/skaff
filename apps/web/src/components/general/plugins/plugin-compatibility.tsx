"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { PluginCompatibilityResult } from "@/lib/plugins/web-stage-loader";
import {
  buildCompatibilitySummary,
  buildWebInstallInstructions,
  formatGlobalConfigIssue,
  formatPluginMismatch,
  formatPluginName,
  formatPluginRequirement,
  formatTemplateSettingsWarning,
  getCompatibilityBreakdown,
} from "@/lib/plugins/plugin-compatibility-messages";

interface PluginCompatibilitySummaryProps {
  result: PluginCompatibilityResult;
  showDetails?: boolean;
}

export function PluginCompatibilitySummary({
  result,
  showDetails = false,
}: PluginCompatibilitySummaryProps) {
  const {
    missing,
    versionMismatches,
    invalidGlobalConfig,
    totalRequired,
    templateSettingsWarnings,
  } = getCompatibilityBreakdown(result);

  const badgeLabel =
    totalRequired === 0
      ? "No plugins required"
      : result.compatible
        ? "Compatible"
        : buildCompatibilitySummary(result);

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={result.compatible ? "secondary" : "destructive"}>
        {badgeLabel}
      </Badge>
      {showDetails && !result.compatible ? (
        <div className="text-xs text-muted-foreground space-y-1">
          {missing.length > 0 ? (
            <p>Missing: {missing.map(formatPluginRequirement).join(", ")}</p>
          ) : null}
          {versionMismatches.length > 0 ? (
            <p>
              Version mismatches:{" "}
              {versionMismatches.map(formatPluginMismatch).join(", ")}
            </p>
          ) : null}
          {invalidGlobalConfig.length > 0 ? (
            <p>
              Invalid global settings:{" "}
              {invalidGlobalConfig.map(formatGlobalConfigIssue).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface PluginCompatibilityDetailsProps {
  result: PluginCompatibilityResult;
  title?: string;
}

export function PluginCompatibilityDetails({
  result,
  title = "Plugin compatibility",
}: PluginCompatibilityDetailsProps) {
  const { missing, versionMismatches, invalidGlobalConfig, totalRequired } =
    getCompatibilityBreakdown(result);

  if (totalRequired === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">
          No plugins are required by this template.
        </p>
      </section>
    );
  }

  if (result.compatible) {
    return (
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">
          All required plugins are installed and compatible.
        </p>
        {templateSettingsWarnings.length > 0 ? (
          <Alert>
            <AlertTitle>Template settings warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 text-sm">
                {templateSettingsWarnings.map((warning) => (
                  <li key={warning.module}>
                    {formatTemplateSettingsWarning(warning)}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    );
  }

  const missingSpecs = missing.map(formatPluginRequirement);
  const mismatchSpecs = versionMismatches.map(formatPluginRequirement);
  const missingInstall = buildWebInstallInstructions(missingSpecs);
  const mismatchInstall = buildWebInstallInstructions(mismatchSpecs);

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <Alert variant="destructive">
        <AlertTitle>Missing or incompatible plugins</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            This template requires plugins that are not available in the current
            Web UI build. Install or update the plugins and rebuild the Web UI
            to continue.
          </p>
          {missing.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">Missing plugins</p>
              <ul className="list-disc pl-4 text-sm">
                {missing.map((plugin) => (
                  <li key={plugin.module}>{formatPluginRequirement(plugin)}</li>
                ))}
              </ul>
              {missingInstall ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Install in Web builds with:</p>
                  <pre className="bg-muted p-2 rounded text-xs">
                    {missingInstall.docker}
                  </pre>
                  <pre className="bg-muted p-2 rounded text-xs">
                    {missingInstall.nix}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          {versionMismatches.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">Version mismatches</p>
              <ul className="list-disc pl-4 text-sm">
                {versionMismatches.map((plugin) => (
                  <li key={plugin.module}>{formatPluginMismatch(plugin)}</li>
                ))}
              </ul>
              {mismatchInstall ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Rebuild with required versions:</p>
                  <pre className="bg-muted p-2 rounded text-xs">
                    {mismatchInstall.docker}
                  </pre>
                  <pre className="bg-muted p-2 rounded text-xs">
                    {mismatchInstall.nix}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          {invalidGlobalConfig.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-sm">
                Invalid global plugin settings
              </p>
              <ul className="list-disc pl-4 text-sm">
                {invalidGlobalConfig.map((plugin) => (
                  <li key={plugin.module}>
                    {formatGlobalConfigIssue(plugin)}
                  </li>
                ))}
              </ul>
              <div className="space-y-2 text-sm">
                <p className="font-medium">Fix settings in the Web UI:</p>
                <p>
                  Open <span className="font-semibold">Settings</span> →{" "}
                  <span className="font-semibold">Plugin Settings</span> and
                  update the missing values.
                </p>
                <p className="font-medium">CLI alternative:</p>
                <pre className="bg-muted p-2 rounded text-xs">
                  {`skaff plugin-settings set ${invalidGlobalConfig
                    .map((plugin) => formatPluginName(plugin))
                    .join(" ")}`}
                </pre>
              </div>
            </div>
          ) : null}
        </AlertDescription>
      </Alert>
      {templateSettingsWarnings.length > 0 ? (
        <Alert>
          <AlertTitle>Template settings warnings</AlertTitle>
          <AlertDescription>
            <p>
              This template does not fully satisfy plugin-required settings
              schemas. Extend the template&apos;s settings schema to match the
              plugin requirements.
            </p>
            <ul className="list-disc pl-4 text-sm">
              {templateSettingsWarnings.map((warning) => (
                <li key={warning.module}>
                  {formatTemplateSettingsWarning(warning)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
