import path from "node:path";
import { Result, TemplateDTO } from "./../lib/types";
import { DOCS_BASE_URL } from "../lib/constants";

export function projectSearchPathKey(
  projectSearchPath?: string,
): string | undefined {
  if (!projectSearchPath) {
    return;
  }
  const processedPath = projectSearchPath
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .trim();
  return processedPath.slice(
    processedPath.lastIndexOf("_", processedPath.lastIndexOf("_") - 1) + 1,
  );
}

export function getDocLink(documentPath: string) {
  return path.join(DOCS_BASE_URL, documentPath);
}

export function findTemplate(
  rootTemplate: TemplateDTO,
  subTemplateName: string,
): Result<TemplateDTO | null> {
  if (rootTemplate.config.templateConfig.name === subTemplateName) {
    return { data: rootTemplate };
  }

  for (const subTemplates of Object.values(rootTemplate.subTemplates)) {
    for (const subTemplate of subTemplates) {
      const result = findTemplate(subTemplate, subTemplateName);
      if ("error" in result) {
        return result;
      }
      if ("data" in result && result.data) {
        return result;
      }
    }
  }

  return { data: null };
}

export function deepSortObject<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(deepSortObject) as any;
  }
  if (obj !== null && typeof obj === "object") {
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = deepSortObject((obj as any)[key]);
    }
    return result as T;
  }
  return obj;
}

export function isSubset(
  baseObject: Record<string, any>,
  objectToCompareTo: Record<string, any>,
): boolean {
  for (const key in baseObject) {
    if (
      !(key in objectToCompareTo) ||
      baseObject[key] !== objectToCompareTo[key]
    ) {
      return false;
    }
  }
  return true;
}
