const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const fragmentDirectory = path.join(projectRoot, 'src', 'html');
const outputPath = path.join(projectRoot, 'index.html');
const assetManifestPath = path.join(projectRoot, 'asset-manifest.json');
const fragmentManifestPath = path.join(projectRoot, 'html-fragments.json');

const fragments = [
  'document-head.html',
  'intro-and-home.html',
  'health-and-couple.html',
  'cphone.html',
  'myphone.html',
  'worldbook-and-presets.html',
  'api-settings-core.html',
  'api-settings-providers.html',
  'api-settings-data.html',
  'data-and-social-list.html',
  'chat-interface.html',
  'appearance-and-thoughts.html',
  'calls-and-social.html',
  'chat-settings-main.html',
  'chat-settings-extra.html',
  'feature-screens.html',
  'modals-general.html',
  'modals-feature.html',
  'modals-phone-and-finance.html',
  'online-and-myphone-modals.html',
  'games-and-document-tail.html'
];

const generatedHtml = fragments
  .map(fragment => fs.readFileSync(path.join(fragmentDirectory, fragment), 'utf8'))
  .join('');

const generatedShell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EPhone</title>
</head>
<body>
  <noscript>此应用需要启用 JavaScript。</noscript>
  <script src="modules/bootstrap/document-loader.js"></script>
</body>
</html>
`;

const generatedFragmentManifest = `${JSON.stringify(fragments, null, 2)}\n`;

const localAssets = Array.from(
  generatedHtml.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi),
  match => match[1]
)
  .filter(asset => !/^(?:https?:)?\/\//i.test(asset))
  .map(asset => asset.replace(/^\.\//, '').split(/[?#]/, 1)[0])
  .filter(Boolean);

const generatedAssetManifest = `${JSON.stringify(
  Array.from(new Set([
    'index.html',
    'manifest.json',
    'html-fragments.json',
    'modules/bootstrap/document-loader.js',
    ...fragments.map(fragment => `src/html/${fragment}`),
    ...localAssets
  ])),
  null,
  2
)}\n`;

if (process.argv.includes('--check')) {
  const currentHtml = fs.readFileSync(outputPath, 'utf8');
  if (currentHtml !== generatedShell) {
    console.error('index.html is out of sync with the generated document shell.');
    process.exit(1);
  }
  if (fs.readFileSync(fragmentManifestPath, 'utf8') !== generatedFragmentManifest) {
    console.error('html-fragments.json is out of sync with the fragment order.');
    process.exit(1);
  }
  const currentAssetManifest = fs.readFileSync(assetManifestPath, 'utf8');
  if (currentAssetManifest !== generatedAssetManifest) {
    console.error('asset-manifest.json is out of sync with index.html.');
    process.exit(1);
  }
  console.log(`Document shell and ${fragments.length} HTML fragments verified.`);
} else {
  fs.writeFileSync(outputPath, generatedShell);
  fs.writeFileSync(fragmentManifestPath, generatedFragmentManifest);
  fs.writeFileSync(assetManifestPath, generatedAssetManifest);
  console.log(`Document shell and manifests generated for ${fragments.length} HTML fragments.`);
}
