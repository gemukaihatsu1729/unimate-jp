import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function collectHtmlInputs(dir: string, acc: Record<string, string> = {}): Record<string, string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'public') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlInputs(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const rel = path.relative(__dirname, fullPath).replace(/\\/g, '/');
      const key = rel.replace(/\.html$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      acc[key] = fullPath;
    }
  }
  return acc;
}

export default defineConfig({
  base: '/',
  server: {
    host: true,
    port: 5170
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: collectHtmlInputs(__dirname)
    }
  }
});
