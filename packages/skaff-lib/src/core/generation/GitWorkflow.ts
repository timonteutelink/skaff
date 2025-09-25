import { Result } from "../../lib/types";
import { commitAll, createGitRepo } from "../../services/git-service";

export class GitWorkflow {
  public async initializeRepository(projectPath: string): Promise<Result<void>> {
    return createGitRepo(projectPath);
  }

  public async commitAllChanges(
    projectPath: string,
    message: string,
  ): Promise<Result<void>> {
    return commitAll(projectPath, message);
  }
}
