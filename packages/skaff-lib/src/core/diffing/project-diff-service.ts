import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

import { NewTemplateDiffResult, ParsedFile, Result } from "../../lib/types";
import { Project } from "../../models/project";
import { ProjectDiffPlanner } from "./ProjectDiffPlanner";

const planner = new ProjectDiffPlanner();

export async function generateModifyTemplateDiff(
  newTemplateSettings: UserTemplateSettings,
  project: Project,
  instantiatedTemplateId: string,
): Promise<Result<NewTemplateDiffResult>> {
  return planner.generateModifyTemplateDiff(
    newTemplateSettings,
    project,
    instantiatedTemplateId,
  );
}

export async function generateNewTemplateDiff(
  _rootTemplateName: string,
  templateName: string,
  parentInstanceId: string | undefined,
  destinationProject: Project,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  return planner.generateNewTemplateDiff(
    templateName,
    parentInstanceId,
    userTemplateSettings,
    destinationProject,
  );
}

export async function generateUpdateTemplateDiff(
  project: Project,
  newTemplateRevisionHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  return planner.generateUpdateTemplateDiff(project, newTemplateRevisionHash);
}

export async function resolveConflictsAndRetrieveAppliedDiff(
  project: Project,
): Promise<Result<ParsedFile[]>> {
  return planner.resolveConflictsAndRetrieveAppliedDiff(project);
}

export async function applyDiffToProject(
  project: Project,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: true }>> {
  return planner.applyDiffToProject(project, diffHash);
}

export async function diffProjectFromItsTemplate(
  project: Project,
): Promise<Result<{ files: ParsedFile[]; hash: string }>> {
  return planner.diffProjectFromTemplate(project);
}
