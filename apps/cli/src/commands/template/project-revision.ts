import { loadProjectTemplateRevision } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class TemplateProjectRevision extends Base {
  static description =
    'Show the template revision that was instantiated for this project';

  async run() {
    await this.parse(TemplateProjectRevision);

    const project = await getCurrentProject();
    if ('error' in project)
      this.error(
        project.error ??
        'No project found. Please run this command in a project directory.',
        { exit: 1 },
      );

    if (!project.data)
      this.error('No project is currently selected.', { exit: 1 });

    const res = await loadProjectTemplateRevision(project.data);
    if ('error' in res) this.error(res.error, { exit: 1 });
    if (!res.data)
      this.error('Project not found or no associated template revision', {
        exit: 1,
      });

    const tpl = res.data;

    this.output({
      description: tpl.config.templateConfig.description,
      project: project.data.instantiatedProjectSettings.projectName,
      revision: tpl.commitHash,
      template: tpl.config.templateConfig.name,
    });
  }
}

