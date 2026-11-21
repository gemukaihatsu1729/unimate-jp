import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const siteDir = path.join(rootDir, 'site');
const gamesRootDir = path.join(rootDir, 'games');

function run(command, cwd = rootDir) {
  console.log(`\n▶ ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

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

function injectHeadSnippets(targetDir) {
  const adsenseClientId = (process.env.ADSENSE_CLIENT_ID || '').trim();
  const gaMeasurementId = (process.env.GA_MEASUREMENT_ID || '').trim();

  if (adsenseClientId && !/^ca-pub-\d+$/.test(adsenseClientId)) {
    throw new Error(`Invalid ADSENSE_CLIENT_ID format: "${adsenseClientId}" (expected ca-pub-XXXXXXXXXXXXXXXX)`);
  }
  if (gaMeasurementId && !/^G-[A-Z0-9]+$/i.test(gaMeasurementId)) {
    throw new Error(`Invalid GA_MEASUREMENT_ID format: "${gaMeasurementId}" (expected G-XXXXXXXXXX)`);
  }

  const snippets = [];
  if (adsenseClientId) {
    snippets.push(
      `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}" crossorigin="anonymous"></script>`
    );
    const pubId = adsenseClientId.replace(/^ca-/, '');
    const adsTxtPath = path.join(targetDir, 'ads.txt');
    fs.writeFileSync(adsTxtPath, `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`, 'utf8');
    console.log(`✓ Generated dist/ads.txt for ${pubId}`);
  }

  if (gaMeasurementId) {
    snippets.push(
      `    <script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>\n` +
        `    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaMeasurementId}');</script>`
    );
  }

  if (snippets.length === 0) {
    return;
  }

  const block = `\n${snippets.join('\n')}\n  </head>`;
  const htmlFiles = listHtmlFiles(targetDir);
  let injectedCount = 0;

  for (const htmlFile of htmlFiles) {
    const content = fs.readFileSync(htmlFile, 'utf8');
    if (adsenseClientId && content.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')) {
      continue;
    }
    if (content.includes('</head>')) {
      const updated = content.replace('</head>', block);
      fs.writeFileSync(htmlFile, updated, 'utf8');
      injectedCount += 1;
    }
  }
  console.log(`✓ Injected analytics/AdSense snippets into ${injectedCount} HTML files`);
}

function main() {
  console.log('=== Building unimate-jp.com monorepo ===');

  // 1. Reset root dist/
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  // 2. Build site portal & static pages
  run('npm run build --workspace=site');
  const siteDistDir = path.join(siteDir, 'dist');
  fs.cpSync(siteDistDir, distDir, { recursive: true });

  // 3. Discover & build all games under games/*
  const gameSlugs = fs
    .readdirSync(gamesRootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(gamesRootDir, slug, 'package.json')))
    .sort();

  if (gameSlugs.length === 0) {
    throw new Error('No games found under games/*');
  }

  for (const slug of gameSlugs) {
    run(`npm run build --workspace=games/${slug}`);
    const gameDistDir = path.join(gamesRootDir, slug, 'dist');
    const destDir = path.join(distDir, 'games', slug);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(gameDistDir, destDir, { recursive: true });
    console.log(`✓ Placed games/${slug} -> dist/games/${slug}/`);
  }

  // 4. Optional AdSense / GA4 injection from environment variables
  injectHeadSnippets(distDir);

  // 5. Verify critical output paths
  const requiredOutputs = [
    'index.html',
    'games/index.html',
    'portfolio/index.html',
    'blog/index.html',
    'about/index.html',
    'privacy/index.html',
    'contact/index.html',
    '404.html',
    'robots.txt',
    'sitemap.xml',
    ...gameSlugs.map((slug) => `games/${slug}/index.html`)
  ];

  for (const relPath of requiredOutputs) {
    const absPath = path.join(distDir, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Missing required build output: ${relPath}`);
    }
  }

  console.log('\n✅ Build succeeded! Output summary:');
  console.log(`   Root:     dist/index.html`);
  console.log(`   Portal:   dist/games/index.html`);
  for (const slug of gameSlugs) {
    console.log(`   Game:     dist/games/${slug}/index.html`);
  }
}

main();
