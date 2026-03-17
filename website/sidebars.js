/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api-reference/overview',
        'api-reference/tiles',
        'api-reference/geocoding',
        'api-reference/routing',
        'api-reference/search',
        'api-reference/contributions',
        'api-reference/telemetry',
      ],
    },
    {
      type: 'category',
      label: 'SDKs',
      items: [
        'sdk/javascript',
        'sdk/react',
        'sdk/nextjs',
        'sdk/react-native',
        'sdk/flutter',
        'sdk/kotlin',
        'sdk/swift',
      ],
    },
    'self-hosting',
  ],
};

module.exports = sidebars;
