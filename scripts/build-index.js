const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const fragmentDirectory = path.join(projectRoot, 'src', 'html');
const outputPath = path.join(projectRoot, 'index.html');
const assetManifestPath = path.join(projectRoot, 'asset-manifest.json');

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

const localAssets = Array.from(
  generatedHtml.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi),
  match => match[1]
)
  .filter(asset => !/^(?:https?:)?\/\//i.test(asset))
  .map(asset => asset.replace(/^\.\//, '').split(/[?#]/, 1)[0])
  .filter(Boolean);

const generatedAssetManifest = `${JSON.stringify(
  Array.from(new Set(['index.html', 'manifest.json', ...localAssets])),
  null,
  2
)}\n`;

if (process.argv.includes('--check')) {
  const currentHtml = fs.readFileSync(outputPath, 'utf8');
  if (currentHtml !== generatedHtml) {
    console.error('index.html is out of sync with src/html fragments.');
    process.exit(1);
  }
  const currentAssetManifest = fs.readFileSync(assetManifestPath, 'utf8');
  if (currentAssetManifest !== generatedAssetManifest) {
    console.error('asset-manifest.json is out of sync with index.html.');
    process.exit(1);
  }
  console.log(`index.html and asset manifest verified from ${fragments.length} fragments.`);
} else {
  fs.writeFileSync(outputPath, generatedHtml);
  fs.writeFileSync(assetManifestPath, generatedAssetManifest);
  console.log(`index.html and asset manifest generated from ${fragments.length} fragments.`);
}
