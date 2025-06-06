import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class ProjectShow extends Base {
  static description = 'Display details for the current project';

  async run() {
    await this.parse(ProjectShow); // ensures global --format is parsed

    const res = await getCurrentProject();
    if ('error' in res) {
      this.error(res.error, { exit: 1 });
    }

    if (!res.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const dto = res.data.mapToDTO();
    if ('error' in dto) this.error(dto.error, { exit: 1 });

    const p = dto.data;
    this.output({
      currentBranch: p.gitStatus!.currentBranch,
      currentCommit: p.gitStatus!.currentCommitHash,
      gitClean: p.gitStatus!.isClean,
      instantiatedTemplates: p.settings.instantiatedTemplates.length,
      name: p.name,
      outdatedTemplate: p.outdatedTemplate,
      path: p.absPath,
      rootTemplate: p.rootTemplateName,
    });
  }
}

