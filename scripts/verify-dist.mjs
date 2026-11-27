import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

function listHtmlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyInternalLinks(htmlFiles) {
  const errors = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(distDir, file);
    const baseDir = path.dirname(file);

    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const ref = match[1];
      if (/^(https?:|mailto:|#)/.test(ref)) continue;
      const cleanRef = ref.split('#')[0].split('?')[0];
      if (!cleanRef) continue;

      let target = cleanRef.startsWith('/')
        ? path.join(distDir, cleanRef)
        : path.resolve(baseDir, cleanRef);

      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, 'index.html');
      }

      if (!fs.existsSync(target)) {
        errors.push(`${relFile} -> broken reference "${ref}" (resolved: ${path.relative(distDir, target)})`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Broken internal links/assets detected:\n${errors.join('\n')}`);
  }
  console.log(`✓ Verified internal links & assets across ${htmlFiles.length} HTML files`);
}

function verifyNoLeftoverGithubIo(htmlFiles) {
  const filesToCheck = [...htmlFiles, path.join(distDir, 'common', 'js', 'result-ad.js')];
  for (const file of filesToCheck) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('github.io')) {
      throw new Error(`Leftover github.io reference in ${path.relative(distDir, file)}`);
    }
  }
  console.log('✓ Verified zero leftover github.io references in dist HTML/JS');
}

function verifyGameResultAds() {
  const games = [
    { slug: 'mousoutero', firstButtonId: 'btn-share-x' },
    { slug: 'zonbi', firstButtonId: 'btn-share-x' },
    { slug: 'flashanzan', firstButtonId: 'btn-share-x' },
    { slug: 'bikechase', firstButtonId: 'btn-share-x' },
    { slug: 'helicargo', firstButtonId: 'btn-share-x' }
  ];

  for (const { slug, firstButtonId } of games) {
    const htmlPath = path.join(distDir, 'games', slug, 'index.html');
    assert(fs.existsSync(htmlPath), `Missing game HTML: games/${slug}/index.html`);
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert(
      /<script[^>]+src="\/common\/js\/result-ad\.js"[^>]*>/i.test(html),
      `games/${slug}/index.html is missing /common/js/result-ad.js script tag`
    );

    const adAttr = `data-result-ad="${slug}"`;
    const adIdx = html.indexOf(adAttr);
    assert(adIdx !== -1, `games/${slug}/index.html is missing ${adAttr}`);

    const btnIdx = html.indexOf(`id="${firstButtonId}"`);
    assert(btnIdx !== -1, `games/${slug}/index.html is missing id="${firstButtonId}"`);
    assert(
      adIdx < btnIdx,
      `games/${slug}/index.html: ${adAttr} must appear before first action button #${firstButtonId}`
    );
  }
  console.log(`✓ Verified result-ad.js integration and DOM placement across all ${games.length} games`);
}

function verifyResultAdScriptConfig() {
  const scriptPath = path.join(distDir, 'common', 'js', 'result-ad.js');
  assert(fs.existsSync(scriptPath), 'Missing dist/common/js/result-ad.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert(!script.includes('__ADSENSE_CLIENT_ID__'), 'Unreplaced __ADSENSE_CLIENT_ID__ placeholder in dist/common/js/result-ad.js');
  assert(!script.includes('__ADSENSE_RESULT_SLOT_ID__'), 'Unreplaced __ADSENSE_RESULT_SLOT_ID__ placeholder in dist/common/js/result-ad.js');

  const expectedClient = (process.env.ADSENSE_CLIENT_ID || '').trim();
  const expectedSlot = (process.env.ADSENSE_RESULT_SLOT_ID || '').trim();
  const adsTxtPath = path.join(distDir, 'ads.txt');

  if (expectedClient) {
    assert(script.includes(JSON.stringify(expectedClient)), 'ADSENSE_CLIENT_ID not embedded in result-ad.js');
    assert(fs.existsSync(adsTxtPath), 'dist/ads.txt missing when ADSENSE_CLIENT_ID is set');
    const adsTxt = fs.readFileSync(adsTxtPath, 'utf8');
    assert(adsTxt.includes(expectedClient.replace(/^ca-/, '')), 'dist/ads.txt does not match ADSENSE_CLIENT_ID');
  } else {
    assert(script.includes('var AD_CLIENT = "";'), 'AD_CLIENT should be empty when ADSENSE_CLIENT_ID is unset');
    assert(!fs.existsSync(adsTxtPath), 'dist/ads.txt should not exist when ADSENSE_CLIENT_ID is unset');
  }

  if (expectedSlot) {
    assert(script.includes(JSON.stringify(expectedSlot)), 'ADSENSE_RESULT_SLOT_ID not embedded in result-ad.js');
  } else {
    assert(script.includes('var AD_SLOT = "";'), 'AD_SLOT should be empty when ADSENSE_RESULT_SLOT_ID is unset');
  }

  console.log('✓ Verified dist/common/js/result-ad.js configuration & ads.txt consistency');
}

function verifySitemap() {
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  assert(fs.existsSync(sitemapPath), 'Missing dist/sitemap.xml');
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert(locs.length > 0, 'dist/sitemap.xml has no <loc> entries');

  for (const loc of locs) {
    const parsed = new URL(loc);
    assert(parsed.hostname === 'unimate-jp.com', `Unexpected sitemap hostname: ${loc}`);
    let target = path.join(distDir, parsed.pathname);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    assert(fs.existsSync(target), `Sitemap entry does not exist in dist/: ${loc}`);
  }
  console.log(`✓ Verified all ${locs.length} entries in dist/sitemap.xml exist in dist/`);
}

function main() {
  assert(fs.existsSync(distDir), 'dist/ directory not found. Run `npm run build` first.');
  const htmlFiles = listHtmlFiles(distDir);
  assert(htmlFiles.length > 0, 'No HTML files found in dist/');

  verifyInternalLinks(htmlFiles);
  verifyNoLeftoverGithubIo(htmlFiles);
  verifyGameResultAds();
  verifyResultAdScriptConfig();
  verifySitemap();

  console.log('\n✅ All dist verification checks passed!');
}

main();
