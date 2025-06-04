/** @type {import('@docusaurus/types').Config} */
module.exports = {
  title: 'Code Templator',
  tagline: 'Generate, scaffold & ship code faster',
  url: 'https://timonteutelink.github.io',
  baseUrl: '/',
  favicon: 'img/logo.svg',
  organizationName: 'timonteutelink',
  projectName: 'code-templator',

  presets: [
    ['@docusaurus/preset-classic', { docs: false, blog: false, pages: {}, theme: { customCss: require.resolve('./src/css/custom.css') } }]
  ],

  plugins: [
    // Library API – produced by docusaurus-plugin-typedoc-api
    [
      'docusaurus-plugin-typedoc-api',
      {
        id: 'api-lib',
        projectName: '@timonteutelink/code-templator-lib',

        /** Run TypeDoc directly */
        entryPoints: ['../code-templator-lib/src/index.ts'],
        tsconfig: '../code-templator-lib/tsconfig.json',

        /** where it will live */
        routeBasePath: 'api-lib',

        /** nice left-nav title */
        sidebar: { categoryLabel: 'Library API', collapsed: false }
      }
    ],

    // CLI reference
    ['@docusaurus/plugin-content-docs', {
      id: 'cli',
      path: 'src/api/cli',
      routeBasePath: 'cli',
      sidebarPath: require.resolve('./sidebars.js'),
      editUrl: 'https://github.com/timonteutelink/code-templator/edit/main/'
    }],

    // Guides
    ['@docusaurus/plugin-content-docs', {
      id: 'guides',
      path: 'src/guides',
      routeBasePath: 'guides',
      sidebarPath: require.resolve('./sidebars.js'),
      showLastUpdateAuthor: true,
      showLastUpdateTime: true
    }]
  ],

  themeConfig: {
    navbar: {
      title: 'Code Templator',
      logo: { src: 'img/logo.svg', alt: 'logo' },
      items: [
        { to: '/guides', label: 'Guides', position: 'left' },
        { to: '/api-lib', label: 'Library API', position: 'left' },
        { to: '/cli', label: 'CLI Commands', position: 'left' },
        { href: 'https://github.com/timonteutelink/code-templator', label: 'GitHub', position: 'right' }
      ]
    },
    footer: { copyright: `© ${new Date().getFullYear()} Timon Teutelink` }
  }
};

