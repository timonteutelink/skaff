module.exports = {
  docs: [
    'introduction',
    {
      type: 'category',
      label: 'Getting started',
      link: { type: 'doc', id: 'getting-started/index' },
      items: [
        'getting-started/cli-quickstart',
        'getting-started/web-quickstart',
        'getting-started/core-concepts',
      ],
    },
    {
      type: 'category',
      label: 'CLI',
      link: { type: 'doc', id: 'cli/index' },
      items: ['cli/setup', 'cli/projects', 'cli/automation'],
    },
    {
      type: 'doc',
      id: 'web/index',
      label: 'Web app',
    },
    {
      type: 'category',
      label: 'Template authoring',
      link: { type: 'doc', id: 'authoring/index' },
      items: ['authoring/workflow', 'authoring/advanced', 'authoring/maintenance'],
    },
    {
      type: 'category',
      label: 'Reference',
      link: { type: 'doc', id: 'reference/index' },
      items: ['reference/configuration', 'reference/template-config', 'reference/cli'],
    },
    'examples',
    'contributing',
  ],
};
