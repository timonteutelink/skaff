module.exports = {
  docs: [
    'index',
    'introduction',
    {
      type: 'category',
      label: 'Basics',
      link: { type: 'doc', id: 'basics/index' },
      items: [
        'basics/cli-quickstart',
        'basics/web-quickstart',
        'basics/core-concepts',
      ],
    },
    {
      type: 'category',
      label: 'CLI',
      link: { type: 'doc', id: 'cli/index' },
      items: ['cli/setup', 'cli/projects', 'cli/automation', 'cli/plugins'],
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
      items: [
        'authoring/workflow',
        'authoring/advanced',
        'authoring/plugins',
        'authoring/maintenance',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      link: { type: 'doc', id: 'reference/index' },
      items: [
        'reference/configuration',
        'reference/template-config',
        'reference/plugins',
        'reference/security',
        'reference/cli',
      ],
    },
    'examples',
    'contributing',
  ],
};
