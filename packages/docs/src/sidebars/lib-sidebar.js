
module.exports = {
  typedocSidebar: [
    {
      type: 'category',
      label: 'Lib Reference',
      link: {
        type: 'doc',
        id: 'index',
      },
      items: require('./src/lib/typedoc-sidebar.cjs'),
    },
  ],
};

