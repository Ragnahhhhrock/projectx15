// Writes the static history pages (history/**/index.html) and public/sitemap.xml from
// scripts/history/content.ts. Run after editing content: npm run gen-history
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PAGES } from './history/content';
import { outputPath, renderPage, renderSitemap } from './history/render';

for (const page of PAGES) {
  const out = outputPath(page.slug);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPage(page));
  console.log(`wrote ${out}`);
}
writeFileSync('public/sitemap.xml', renderSitemap());
console.log('wrote public/sitemap.xml');
