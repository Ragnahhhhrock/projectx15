// Renders the history content to static HTML pages and a sitemap. Pure functions (no file access) so
// tests can regenerate everything in memory and compare it with what is committed.
import { ERAS, FAQS, KIND_LABEL, LASTMOD, PAGES, SITE, TIMELINE, type HistoryPage, type Milestone, type PageSlug } from './content';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** '1959-06-08' → '8 June 1959', '1952-06' → 'June 1952', '2005' → '2005' */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!m) return y;
  const month = MONTHS[Number(m) - 1];
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

export const urlPath = (slug: PageSlug): string => (slug ? `/history/${slug}/` : '/history/');
export const absUrl = (slug: PageSlug): string => SITE + urlPath(slug);
/** Path of the page's source file, relative to the repo root */
export const outputPath = (slug: PageSlug): string => (slug ? `history/${slug}/index.html` : 'history/index.html');
export const pageFor = (slug: PageSlug): HistoryPage => PAGES.find((p) => p.slug === slug)!;

const OG_IMAGE = `${SITE}/og-image.png`;
const OG_ALT = "The black X-15 rocket plane climbing under rocket power above the Earth's curved horizon, with the title Project X-15 and projectx15.com.";

/** JSON-LD must not be able to close its own script tag */
const json = (o: unknown): string => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

// ---- Fragments --------------------------------------------------------

export function renderTimeline(items: Milestone[], anchors: boolean): string {
  const li = (m: Milestone) => `
      <li class="tl-item tl-${m.kind}"${anchors ? ` id="${m.date}"` : ''}>
        <time class="tl-date" datetime="${m.date}">${fmtDate(m.date)}</time>
        <span class="tl-kind">${KIND_LABEL[m.kind]}</span>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.text)}</p>
        <a class="tl-more" href="${urlPath(m.page)}">${m.page === 'timeline' ? 'Timeline' : esc(pageFor(m.page).navLabel)}</a>
      </li>`;
  if (!anchors) return `<ol class="timeline">${items.map(li).join('')}\n    </ol>`;
  return ERAS.map((era) => {
    const inEra = items.filter((m) => Number(m.date.slice(0, 4)) >= era.from && Number(m.date.slice(0, 4)) <= era.to);
    if (!inEra.length) return '';
    return `<section class="tl-era" id="${era.id}" aria-labelledby="${era.id}-title">
    <h2 id="${era.id}-title">${esc(era.title)}</h2>
    <p class="tl-intro">${esc(era.intro)}</p>
    <ol class="timeline">${inEra.map(li).join('')}\n    </ol>
  </section>`;
  }).join('\n  ');
}

function renderCards(): string {
  const cards = PAGES.filter((p) => p.slug !== '').map((p) => `
    <li><a class="card" href="${urlPath(p.slug)}"><span class="card-title">${esc(p.navLabel)}</span><span class="card-blurb">${esc(p.blurb)}</span></a></li>`);
  return `<ul class="cards">${cards.join('')}\n  </ul>`;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function renderFaq(): string {
  return FAQS.map((f) => `<section class="faq-item" id="${slugify(f.q)}">
  <h2>${esc(f.q)}</h2>
  <p>${esc(f.a)}</p>
  <p class="faq-more"><a href="${f.more.href}">${esc(f.more.label)}</a></p>
</section>`).join('\n');
}

function expand(body: string): string {
  return body
    .replace('{{timeline:highlights}}', () => renderTimeline(TIMELINE.filter((m) => m.highlight), false))
    .replace('{{timeline:all}}', () => renderTimeline(TIMELINE, true))
    .replace('{{cards}}', () => renderCards())
    .replace('{{faq}}', () => renderFaq());
}

// ---- Structured data --------------------------------------------------

function structuredData(page: HistoryPage): string {
  const url = absUrl(page.slug);
  const org = { '@type': 'Organization', name: 'Project X-15', url: SITE };
  const crumbs = [{ name: 'Project X-15', url: `${SITE}/` }, { name: 'History', url: absUrl('') }];
  if (page.slug) crumbs.push({ name: page.navLabel, url });
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: page.h1,
      description: page.description,
      image: OG_IMAGE,
      datePublished: LASTMOD,
      dateModified: LASTMOD,
      inLanguage: 'en',
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: org,
      publisher: { ...org, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
      about: { '@type': 'Thing', name: 'North American X-15' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
    },
  ];
  if (page.slug === 'timeline') {
    graph.push({
      '@type': 'ItemList',
      name: 'X-15 program milestones',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: TIMELINE.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${fmtDate(m.date)}: ${m.title}`,
        url: `${url}#${m.date}`,
      })),
    });
  }
  if (page.slug === 'faq') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  return json({ '@context': 'https://schema.org', '@graph': graph });
}

// ---- Page shell ---------------------------------------------------------

export function renderPage(page: HistoryPage): string {
  const url = absUrl(page.slug);
  const i = PAGES.indexOf(page);
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  const navItems = PAGES.map((p) => `<li><a href="${urlPath(p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ''}>${esc(p.navLabel)}</a></li>`).join('\n          ');
  const sources = page.sources.map((s) => `<li><a href="${s.url}" rel="noopener">${esc(s.label)}</a></li>`).join('\n        ');
  const crumbTrail = page.slug
    ? `<li><a href="/">Project X-15</a></li><li><a href="/history/">History</a></li><li aria-current="page">${esc(page.navLabel)}</li>`
    : `<li><a href="/">Project X-15</a></li><li aria-current="page">History</li>`;
  const pager = `<nav class="pager" aria-label="More X-15 history">
      ${prev ? `<a class="pager-prev" href="${urlPath(prev.slug)}"><span>Previous</span>${esc(prev.navLabel)}</a>` : '<span></span>'}
      ${next ? `<a class="pager-next" href="${urlPath(next.slug)}"><span>Next</span>${esc(next.navLabel)}</a>` : '<span></span>'}
    </nav>`;
  const footerLinks = PAGES.map((p) => `<a href="${urlPath(p.slug)}">${esc(p.navLabel)}</a>`).join('\n        ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <meta name="author" content="Project X-15" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="theme-color" content="#05070a" />
    <meta name="color-scheme" content="dark" />
    <link rel="canonical" href="${url}" />

    <!-- Google tag (gtag.js), same property as the simulator homepage. -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-36Q83P4LEH"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-36Q83P4LEH');
    </script>

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Project X-15" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:secure_url" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(OG_ALT)}" />
    <meta property="article:modified_time" content="${LASTMOD}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" />
    <meta name="twitter:image" content="${SITE}/twitter-card.png" />
    <meta name="twitter:image:alt" content="${esc(OG_ALT)}" />

    <script type="application/ld+json">
${structuredData(page)}
    </script>
  </head>
  <body class="history">
    <a class="skip" href="#main">Skip to content</a>
    <header class="site-header">
      <a class="brand" href="/" aria-label="Project X-15, the flight simulator"><img src="/favicon.svg" alt="" width="28" height="28" /><span>Project X-15</span></a>
      <nav class="site-nav" aria-label="X-15 history">
        <ul>
          ${navItems}
        </ul>
      </nav>
    </header>

    <main id="main">
      <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbTrail}</ol></nav>
      <article>
        <header class="page-head">
          <p class="kicker">${esc(page.kicker)}</p>
          <h1>${esc(page.h1)}</h1>
        </header>
${expand(page.body.trim())}
        <section class="sources" aria-labelledby="sources-title">
          <h2 id="sources-title">Sources</h2>
          <ul>
        ${sources}
          </ul>
        </section>
      </article>

      ${pager}

      <aside class="cta" aria-labelledby="cta-title">
        <h2 id="cta-title">Fly the X-15 in your browser</h2>
        <p>Drop from the B-52, light the XLR99, ride it to the edge of space and land on Rogers Dry Lake. Every flight is graded out of 1,000.</p>
        <a class="btn btn-primary" href="/">Fly the simulator</a>
      </aside>
    </main>

    <footer class="site-footer">
      <nav aria-label="X-15 history, footer">
        ${footerLinks}
      </nav>
      <p>Project X-15 is an independent flight simulator. It is not affiliated with or endorsed by NASA, the US Air Force or the US Navy. Questions: <a href="mailto:contact@projectx15.com">contact@projectx15.com</a></p>
    </footer>

    <script type="module" src="/src/history.ts"></script>
  </body>
</html>
`;
}

export function renderSitemap(): string {
  const urls = [`${SITE}/`, ...PAGES.map((p) => absUrl(p.slug))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${LASTMOD}</lastmod></url>`).join('\n')}
</urlset>
`;
}
