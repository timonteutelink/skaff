import { Flags } from '@oclif/core';
import { getProjects } from '@timonteutelink/code-templator-lib';

import Base from '../../base-command.js';

export default class ProjectLs extends Base {
  static description =
    'List projects in the current directory (add --project to filter by name)';
static flags = {
    ...Base.flags,
    project: Flags.string({
      char: 'p',
      description: 'Filter by project name',
    }),
  };

  async run() {
    const { flags } = await this.parse(ProjectLs);

    const res = await getProjects(process.cwd());
    if ('error' in res) this.error(res.error, { exit: 1 });

    let projects = res.data;
    if (flags.project) {
      projects = projects.filter(
        p => p.instantiatedProjectSettings.projectName === flags.project,
      );
      if (projects.length === 0)
        this.error('No projects found with the given name', { exit: 1 });
    }

    this.output(
      projects
        .map(p => p.mapToDTO())
        .filter(p => 'data' in p)
        .map(p => p.data)
        .map(p => ({
          branch: p.gitStatus!.currentBranch,
          clean: p.gitStatus!.isClean,
          name: p.name,
          outdatedTemplate: p.outdatedTemplate,
          path: p.absPath,
          template: p.rootTemplateName,
        })),
    );
  }
}

