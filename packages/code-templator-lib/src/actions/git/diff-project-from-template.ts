import { ParsedFile, Result } from "../../lib";
import { Project } from "../../models";
import { diffProjectFromItsTemplate } from "../../services/project-diff-service";

export async function diffProjectFromTemplate(
  project: Project
): Promise<Result<ParsedFile[]>> {
  return diffProjectFromItsTemplate(project);
}
