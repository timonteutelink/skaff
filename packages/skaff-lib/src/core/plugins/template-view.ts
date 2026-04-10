import type { TemplateConfig } from "@timonteutelink/template-types-lib";
import type { Template } from "../templates/Template";
import type { TemplateView } from "./plugin-types";

/**
 * Creates a minimal, read-only TemplateView from a Template instance.
 *
 * This function extracts only the safe, non-sensitive information from a Template
 * that plugins are allowed to access. Filesystem paths and internal implementation
 * details are intentionally excluded.
 *
 * @param template - The full Template instance
 * @returns A read-only TemplateView with minimal information
 */
export function createTemplateView(template: Template): TemplateView {
  const subTemplateNames: string[] = [];
  for (const subTemplates of Object.values(template.subTemplates)) {
    for (const subTemplate of subTemplates) {
      subTemplateNames.push(subTemplate.config.templateConfig.name);
    }
  }

  // Extract description, handling both string and function forms
  const description =
    typeof template.config.templateConfig.description === "string"
      ? template.config.templateConfig.description
      : undefined;

  // Create a frozen copy of the template config
  const templateConfig = template.config.templateConfig;

  return Object.freeze({
    name: templateConfig.name,
    description,
    config: Object.freeze({
      name: templateConfig.name,
      author: templateConfig.author,
      specVersion: templateConfig.specVersion,
      description,
      multiInstance: templateConfig.multiInstance,
      isRootTemplate: templateConfig.isRootTemplate,
    }),
    subTemplateNames: Object.freeze(subTemplateNames),
    isDetachedSubtreeRoot: template.isDetachedSubtreeRoot,
    commitHash: template.commitHash,
    isLocal: template.isLocal,
  });
}

/**
 * DTO type for template data that can be used to create a TemplateView.
 * This represents the browser-safe serialized form of a Template.
 */
export interface TemplateViewDTO {
  config: {
    templateConfig: TemplateConfig;
  };
  subTemplates?: Record<
    string,
    Array<{ config: { templateConfig: { name: string } } }>
  >;
  isDetachedSubtreeRoot?: boolean;
  currentCommitHash?: string;
  isLocal?: boolean;
}

/**
 * Creates a TemplateView from a TemplateDTO (browser-safe representation).
 *
 * This is useful when the full Template is not available but you have
 * the serialized DTO version.
 */
export function createTemplateViewFromDTO(dto: TemplateViewDTO): TemplateView {
  const subTemplateNames: string[] = [];
  if (dto.subTemplates) {
    for (const subTemplates of Object.values(dto.subTemplates)) {
      for (const subTemplate of subTemplates) {
        subTemplateNames.push(subTemplate.config.templateConfig.name);
      }
    }
  }

  const templateConfig = dto.config.templateConfig;
  const description =
    typeof templateConfig.description === "string"
      ? templateConfig.description
      : undefined;

  return Object.freeze({
    name: templateConfig.name,
    description,
    config: Object.freeze({
      name: templateConfig.name,
      author: templateConfig.author,
      specVersion: templateConfig.specVersion,
      description,
      multiInstance: templateConfig.multiInstance,
      isRootTemplate: templateConfig.isRootTemplate,
    }),
    subTemplateNames: Object.freeze(subTemplateNames),
    isDetachedSubtreeRoot: dto.isDetachedSubtreeRoot ?? false,
    commitHash: dto.currentCommitHash,
    isLocal: dto.isLocal ?? false,
  });
}
