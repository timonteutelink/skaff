import { Flags } from '@oclif/core';
import { getProjects } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class ProjectLs extends Base {
  static description =
    'List projects in the current directory (use --project PATH to scope the search, --name to filter by project name)';
  static flags = {
    ...Base.flags,
    name: Flags.string({
      char: 'n',
      description: 'Filter by project name',
    }),
  };

  async run() {
    const { flags } = await this.parse(ProjectLs);

    const res = await getProjects(process.cwd());
    if ('error' in res) this.error(res.error, { exit: 1 });

    let projects = res.data;
    if (flags.name) {
      projects = projects.filter(
        p => p.instantiatedProjectSettings.projectName === flags.name,
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

