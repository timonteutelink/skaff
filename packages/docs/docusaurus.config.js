/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'Code Templator',
  tagline: 'Generate, scaffold & ship code faster',
  url: 'https://timonteutelink.github.io',
  baseUrl: '/',
  favicon: 'img/logo.svg',
  organizationName: 'timonteutelink',
  projectName: 'timonteutelink.github.io',
  organizationName: 'timonteutelink',
  trailingSlash: false,

  presets: [
    ['@docusaurus/preset-classic', { docs: false, blog: false, pages: {}, theme: { customCss: require.resolve('./src/css/custom.css') } }]
  ],

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'lib',

        entryPoints: ['../code-templator-lib/src/index.ts'],
        tsconfig: '../code-templator-lib/tsconfig.json',

        out: 'src/docs/lib',

        sidebar: {
          autoConfiguration: true
        },

        basePath: 'lib',
      }
    ],

    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'lib',
        path: 'src/docs/lib',
        routeBasePath: 'lib',

        // sidebarPath: require.resolve('./src/sidebars/lib-sidebar.js'),
        includeCurrentVersion: true,
      },
    ],

    // CLI reference
    ['@docusaurus/plugin-content-docs', {
      id: 'cli',
      path: 'src/docs/cli',
      routeBasePath: 'cli',
      sidebarPath: require.resolve('./src/sidebars/cli-sidebar.js'),
      editUrl: 'https://github.com/timonteutelink/code-templator/edit/main/'
    }],

    // Guides
    ['@docusaurus/plugin-content-docs', {
      id: 'guides',
      path: 'src/docs/guides',
      routeBasePath: 'docs',
      sidebarPath: require.resolve('./src/sidebars/docs-sidebar.js'),
      showLastUpdateAuthor: true,
      showLastUpdateTime: true
    }]
  ],

  themeConfig: {
    navbar: {
      title: 'Code Templator',
      logo: { src: 'img/logo.svg', alt: 'logo' },
      items: [
        { to: '/docs', label: 'Docs', position: 'left' },
        { to: '/lib', label: 'Lib Reference', position: 'left' },
        { to: '/cli', label: 'CLI Documentation', position: 'left' },
        { href: 'https://github.com/timonteutelink/code-templator', label: 'GitHub', position: 'right' }
      ]
    },
    footer: { copyright: `© ${new Date().getFullYear()} Timon Teutelink` },
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
  }
};

