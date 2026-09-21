/**
 * Finds the pages a venue's own site has for one night.
 *
 * The model's web_fetch can only open URLs that already appeared in the
 * conversation — in search results, in a fetched page, or in the request.
 * Venue sites (Hï, Ushuaïa, Pacha…) render their event listings with
 * JavaScript, so a fetched listing shows no links, and a web search rarely
 * ranks one date's page of one club. The sitemap is plain XML and lists
 * every event-date page: read it here, pick the URLs that carry the date
 * (or the brand), and hand them to the model in the user message, where
 * they become fetchable.
 */
const FETCH_TIMEOUT_MS = 6000;
const MAX_SITEMAPS = 8;
const MAX_URLS = 8;
const MAX_BYTES = 3 * 1024 * 1024;

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'LineApp-agent/1.0 (+lineup research)', accept: 'text/xml,application/xml,text/plain,text/html;q=0.5' } });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return null;
    const text = await res.text();
    return text.length > MAX_BYTES ? null : text;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function origin(site: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return u.origin;
  } catch {
    return null;
  }
}

function locs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) out.push(m[1]!);
  return out;
}

/** The date in the forms URLs use: 2026-09-26, 2026/09/26, 26-09-2026, 20260926, 26-september-2026, september-26-2026. */
export function datePatterns(isoDate: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return [];
  const [, y, mo, d] = m;
  const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][Number(mo) - 1]!;
  const dd = String(Number(d));
  return [`${y}-${mo}-${d}`, `${y}/${mo}/${d}`, `${d}-${mo}-${y}`, `${d}/${mo}/${y}`, `${y}${mo}${d}`, `${d}${mo}${y}`,
    `${dd}-${month}-${y}`, `${month}-${dd}-${y}`, `${dd}-${month.slice(0, 3)}-${y}`, `${month.slice(0, 3)}-${dd}-${y}`];
}

export function slugTokens(name: string): string[] {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

/**
 * URLs on `site` that mention `date` — or, failing that, every token of a
 * `term` (an event brand) — from the site's sitemaps. Empty when the site
 * has no readable sitemap. Never throws.
 */
export async function findPagesOnSite(site: string, date: string | null, terms: string[]): Promise<string[]> {
  const base = origin(site);
  if (!base) return [];

  // Sitemap locations: robots.txt first, then the two conventional names.
  const robots = await fetchText(`${base}/robots.txt`);
  const declared = robots ? [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!) : [];
  const roots = declared.length > 0 ? declared : [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];

  const seen = new Set<string>();
  const pages: string[] = [];
  const queue = [...roots];
  let fetched = 0;
  while (queue.length > 0 && fetched < MAX_SITEMAPS) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const xml = await fetchText(url);
    fetched += 1;
    if (!xml) continue;
    const entries = locs(xml);
    if (/<sitemapindex/i.test(xml)) {
      // Children that sound like events first; the rest only if budget remains.
      const ranked = entries.sort((a, b) => Number(/event|date|agenda|calendar|party|program/i.test(b)) - Number(/event|date|agenda|calendar|party|program/i.test(a)));
      queue.push(...ranked);
    } else {
      pages.push(...entries);
    }
  }
  if (pages.length === 0) return [];

  const lower = pages.map((p) => [p, p.toLowerCase()] as const);
  const byDate = date ? datePatterns(date) : [];
  let hits = byDate.length > 0 ? lower.filter(([, l]) => byDate.some((d) => l.includes(d))).map(([p]) => p) : [];
  const tokens = terms.flatMap(slugTokens);
  if (hits.length > MAX_URLS && tokens.length > 0) {
    // Many pages that night (a festival, a multi-club group): prefer the ones naming the brand.
    const narrowed = hits.filter((p) => tokens.some((t) => p.toLowerCase().includes(t)));
    if (narrowed.length > 0) hits = narrowed;
  }
  if (hits.length === 0 && tokens.length > 0) {
    // No date in the URL scheme: the brand's pages, so the model can read the date off them.
    hits = lower.filter(([, l]) => tokens.every((t) => l.includes(t))).map(([p]) => p);
  }
  return hits.slice(0, MAX_URLS);
}
