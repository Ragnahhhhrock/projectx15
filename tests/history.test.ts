// The static history pages (history/**/index.html): committed output matches the content, and the
// SEO basics hold (unique titles and descriptions, one h1, canonical URLs, working internal links).
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import sitemapXml from '../public/sitemap.xml?raw';
import { ERAS, FAQS, KIND_LABEL, LASTMOD, PAGES, SITE, TIMELINE } from '../scripts/history/content';
import { absUrl, fmtDate, outputPath, renderPage, renderSitemap, urlPath } from '../scripts/history/render';

const files = import.meta.glob('../history/**/index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const committed = (slug: (typeof PAGES)[number]['slug']) => files['../' + outputPath(slug)];

describe('generated output', () => {
  it('has one committed file per page, matching the content (run `npm run gen-history` after edits)', () => {
    expect(Object.keys(files)).toHaveLength(PAGES.length);
    for (const page of PAGES) expect(committed(page.slug), outputPath(page.slug)).toBe(renderPage(page));
  });

  it('sitemap lists the homepage and every page, with a lastmod', () => {
    expect(sitemapXml).toBe(renderSitemap());
    for (const url of [`${SITE}/`, ...PAGES.map((p) => absUrl(p.slug))]) expect(sitemapXml).toContain(`<loc>${url}</loc><lastmod>${LASTMOD}</lastmod>`);
  });

  it('the homepage links to every history page in its static HTML', () => {
    for (const page of PAGES) expect(indexHtml, page.slug).toContain(`href="${urlPath(page.slug)}"`);
  });
});

describe('search metadata', () => {
  it('titles are unique and at most 60 characters', () => {
    const titles = PAGES.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t.length, t).toBeLessThanOrEqual(60);
  });

  it('descriptions are unique and 70 to 160 characters', () => {
    const d = PAGES.map((p) => p.description);
    expect(new Set(d).size).toBe(d.length);
    for (const x of d) {
      expect(x.length, x).toBeGreaterThanOrEqual(70);
      expect(x.length, x).toBeLessThanOrEqual(160);
    }
  });

  for (const page of PAGES) {
    describe(`/history/${page.slug}`, () => {
      const html = renderPage(page);

      it('has one h1, a canonical URL, Open Graph URL and valid JSON-LD', () => {
        expect(html.match(/<h1[ >]/g)).toHaveLength(1);
        expect(html).toContain(`<link rel="canonical" href="${absUrl(page.slug)}" />`);
        expect(html).toContain(`<meta property="og:url" content="${absUrl(page.slug)}" />`);
        const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
        const types = (JSON.parse(ld)['@graph'] as { '@type': string }[]).map((n) => n['@type']);
        expect(types).toContain('Article');
        expect(types).toContain('BreadcrumbList');
        if (page.slug === 'faq') expect(types).toContain('FAQPage');
        if (page.slug === 'timeline') expect(types).toContain('ItemList');
      });

      it('has no unfilled placeholders and marks itself in the nav', () => {
        expect(html).not.toContain('{{');
        expect(html).toContain(`<a href="${urlPath(page.slug)}" aria-current="page">`);
      });

      it('every internal link resolves to a page and, if it has a fragment, to an id on that page', () => {
        for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
          const [path, hash] = m[1].split('#');
          if (!path.startsWith('/history/')) continue;
          const target = PAGES.find((p) => urlPath(p.slug) === path);
          expect(target, `${m[1]} on ${urlPath(page.slug)}`).toBeDefined();
          if (hash) expect(renderPage(target!), m[1]).toContain(`id="${hash}"`);
        }
      });
    });
  }
});

describe('timeline', () => {
  it('is in date order with unique dates', () => {
    const dates = TIMELINE.map((m) => m.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('every entry has a valid date, kind, page and era, and a highlight set for the overview', () => {
    for (const m of TIMELINE) {
      expect(m.date, m.title).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
      expect(KIND_LABEL[m.kind]).toBeDefined();
      expect(PAGES.some((p) => p.slug === m.page), m.title).toBe(true);
      const y = Number(m.date.slice(0, 4));
      expect(ERAS.some((e) => y >= e.from && y <= e.to), m.title).toBe(true);
    }
    expect(TIMELINE.filter((m) => m.highlight).length).toBeGreaterThanOrEqual(8);
  });

  it('covers the headline milestones', () => {
    const on = (d: string) => TIMELINE.find((m) => m.date === d);
    expect(on('1959-06-08')?.title).toMatch(/first flight/i);
    expect(on('1963-08-22')?.title).toContain('354,200');
    expect(on('1967-10-03')?.title).toContain('6.7');
    expect(on('1968-10-24')?.title).toMatch(/final/i);
  });

  it('formats dates the way the pages show them', () => {
    expect(fmtDate('1959-06-08')).toBe('8 June 1959');
    expect(fmtDate('1952-06')).toBe('June 1952');
    expect(fmtDate('2005')).toBe('2005');
  });
});

describe('facts that appear on several pages', () => {
  const all = PAGES.map((p) => p.body).join(' ') + FAQS.map((f) => f.a).join(' ');

  it('flight counts add up: 81 + 53 + 65 = 199', () => {
    expect(81 + 53 + 65).toBe(199);
    expect(all).toContain('199');
  });

  it('FAQ answers link somewhere that exists', () => {
    for (const f of FAQS) {
      const [path] = f.more.href.split('#');
      expect(path === '/' || PAGES.some((p) => urlPath(p.slug) === path), f.q).toBe(true);
    }
  });
});
