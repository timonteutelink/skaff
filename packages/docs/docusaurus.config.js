/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'Code Templator',
  tagline: 'Generate, scaffold & ship code faster',
  url: 'https://timonteutelink.github.io',
  baseUrl: '/code-templator/',
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
        id: 'template-types-lib',

        entryPoints: ['../template-types-lib/src/index.ts'],
        tsconfig: '../template-types-lib/tsconfig.json',

        out: 'src/docs/template-types-lib',

        sidebar: {
          autoConfiguration: true
        },

        basePath: 'template-types-lib',

        options: "./template-types-lib-typedoc.json"
      }
    ],

    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'template-types-lib',
        path: 'src/docs/template-types-lib',
        routeBasePath: 'template-types-lib',

        includeCurrentVersion: true,
      },
    ],

    [
      'docusaurus-plugin-typedoc',
      {
        id: 'code-templator-lib',

        entryPoints: ['../code-templator-lib/src/index.ts'],
        tsconfig: '../code-templator-lib/tsconfig.json',

        out: 'src/docs/code-templator-lib',

        sidebar: {
          autoConfiguration: true
        },

        basePath: 'code-templator-lib',

        options: "./code-templator-lib-typedoc.json"
      }
    ],

    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'code-templator-lib',
        path: 'src/docs/code-templator-lib',
        routeBasePath: 'code-templator-lib',

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
        { to: '/code-templator-lib', label: 'Lib Reference', position: 'left' },
        { to: '/template-types-lib', label: 'Template Types Lib Reference', position: 'left' },
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

