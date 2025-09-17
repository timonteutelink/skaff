/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'Skaff',
  tagline: 'Generate, scaffold & ship code faster',
  url: 'https://timonteutelink.github.io',
  baseUrl: '/skaff/',
  favicon: 'img/skafflogo.png',
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
        id: 'skaff-lib',

        entryPoints: ['../skaff-lib/src/index.ts'],
        tsconfig: '../skaff-lib/tsconfig.json',

        out: 'src/docs/skaff-lib',

        sidebar: {
          autoConfiguration: true
        },

        basePath: 'skaff-lib',

        options: "./skaff-lib-typedoc.json"
      }
    ],

    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'skaff-lib',
        path: 'src/docs/skaff-lib',
        routeBasePath: 'skaff-lib',

        includeCurrentVersion: true,
      },
    ],

    // CLI reference
    ['@docusaurus/plugin-content-docs', {
      id: 'cli',
      path: 'src/docs/cli',
      routeBasePath: 'cli',
      sidebarPath: require.resolve('./src/sidebars/cli-sidebar.js'),
      editUrl: 'https://github.com/timonteutelink/skaff/edit/main/'
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
      logo: { src: 'img/skafflogo.png', alt: 'logo' },
      items: [
        { to: '/docs', label: 'Docs', position: 'left' },
        { to: '/skaff-lib', label: 'Lib Reference', position: 'left' },
        { to: '/template-types-lib', label: 'Template Types Lib Reference', position: 'left' },
        { to: '/cli', label: 'CLI Documentation', position: 'left' },
        { href: 'https://github.com/timonteutelink/skaff', label: 'GitHub', position: 'right' }
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

