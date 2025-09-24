import semver from "semver";

import { MAJOR_SPEC_VERSION } from "../../lib/constants";
import { logError } from "../../lib/utils";
import { checkMissingPartials, checkMissingSettings } from "../../utils/handlebars-utils";
import { getDocLink } from "../../utils/shared-utils";
import { Template } from "./Template";

export class InvalidTemplateSpecVersionError extends Error {
  constructor(templateName: string, templateSpecVersion: string) {
    const templateVersion = semver.coerce(templateSpecVersion) ?? "0.0.0";
    const majorTemplateVersion = semver.major(templateVersion);
    super(
      `Template: ${templateName} is using an ${
        majorTemplateVersion > MAJOR_SPEC_VERSION ? "newer" : "older"
      } version. Please upgrade to major version: ${MAJOR_SPEC_VERSION}. Check out ${getDocLink(
        `docs/migration-guide#${MAJOR_SPEC_VERSION}`,
      )} for a full migration guide`,
    );
    this.name = "InvalidTemplateSpecVersionError";
  }
}

export function validateTemplateSpecVersion(
  templateName: string,
  specVersion: string,
): void {
  if (
    semver.major(semver.coerce(specVersion) ?? "0.0.0") !== MAJOR_SPEC_VERSION
  ) {
    throw new InvalidTemplateSpecVersionError(templateName, specVersion);
  }
}

export async function validateTemplateResources(template: Template): Promise<void> {
  try {
    await checkMissingSettings(template);
    await checkMissingPartials(template);
  } catch (error) {
    logError({
      error,
      shortMessage: "Template validation failed",
    });
    throw error;
  }
}

export async function validateTemplate(template: Template): Promise<void> {
  validateTemplateSpecVersion(
    template.config.templateConfig.name,
    template.config.templateConfig.specVersion,
  );

  await validateTemplateResources(template);
}
