import { Result } from "../../lib/types";
import { GitService, resolveGitService } from "../infra/git-service";

export class GitWorkflow {
  constructor(private readonly gitService: GitService = resolveGitService()) {}

  public async initializeRepository(projectPath: string): Promise<Result<void>> {
    return this.gitService.createGitRepo(projectPath);
  }

  public async commitAllChanges(
    projectPath: string,
    message: string,
  ): Promise<Result<void>> {
    return this.gitService.commitAll(projectPath, message);
  }
}
