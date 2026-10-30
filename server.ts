import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { ALL_CATEGORIES, INITIAL_FALLBACK_MOVIES } from './src/data/categories.ts';
import type {
  CastMember,
  DirectDownloadButton,
  EpisodeItem,
  MovieCardItem,
  MovieDetailData,
  StreamSource,
} from './src/types/cinema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIRRORS = [
  'https://4yer8f.movielinkbd.at',
  'https://cmyyhb.movielinkbd.at',
  'https://movielinkbd.tv',
  'https://movielinkbd.one',
];

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const catalogCache = new Map<string, CacheEntry<{ items: MovieCardItem[]; maxPage: number; activeOrigin: string }>>();
const detailCache = new Map<string, CacheEntry<MovieDetailData>>();

/**
 * Decodes MovieLinkBD's LCG XOR cipher used in `mlbdInlinePlayerData` and `data-dl` attributes.
 */
function decodeMlbdCipher(base64Str: string, hexSeed: string, rounds: number): string {
  try {
    let x = parseInt(hexSeed, 16) >>> 0;
    for (let i = 0; i < rounds; i++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    }
    const raw = Buffer.from(base64Str.trim(), 'base64');
    const out = Buffer.alloc(raw.length);
    for (let j = 0; j < raw.length; j++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      out[j] = raw[j] ^ ((x >>> 16) & 255);
    }
    return out.toString('utf8');
  } catch {
    return '';
  }
}

function decodeHtmlEntities(str: string): string {
  return (str || '')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&bull;/g, '•')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

async function fetchFromMirrors(targetPath: string, includeAdultCookie = true): Promise<{ html: string; finalOrigin: string; finalUrl: string }> {
  const cleanPath = targetPath.startsWith('http')
    ? new URL(targetPath).pathname + new URL(targetPath).search
    : targetPath.startsWith('/')
      ? targetPath
      : `/${targetPath}`;

  let lastErr: unknown = null;
  for (const origin of MIRRORS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const url = `${origin}${cleanPath}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
          Cookie: includeAdultCookie ? 'mlbd_show18=1; hide18On=false' : '',
          Referer: `${origin}/`,
        },
      });
      clearTimeout(timer);
      if (!res.ok && res.status !== 404) continue;
      const html = await res.text();
      const finalOrigin = new URL(res.url || url).origin;
      return { html, finalOrigin, finalUrl: res.url || url };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All MovieLinkBD mirrors unreachable');
}

function parseMovieCards(html: string, origin: string): { items: MovieCardItem[]; maxPage: number } {
  const bodyIdx = html.indexOf('<body');
  const body = bodyIdx >= 0 ? html.slice(bodyIdx) : html;
  const blocks = body.split(/<div class="movie-card"/i).slice(1);
  const items: MovieCardItem[] = [];
  const seenPaths = new Set<string>();

  for (const block of blocks) {
    const chunk = block.slice(0, 3200);
    // Skip JS template literals in inline scripts
    if (chunk.includes("'+esc(") || chunk.includes('${')) continue;

    const titleMatch =
      chunk.match(/class=["']title["'][^>]*>([\s\S]*?)<\/a>/i) ||
      chunk.match(/alt=["']([^"']+)["']/i);
    const hrefMatch = chunk.match(/<a[^>]+href=["']([^"']+)["']/i);
    if (!titleMatch || !hrefMatch) continue;

    const rawHref = hrefMatch[1].trim();
    if (!rawHref || rawHref.includes("'+") || rawHref === '#') continue;

    const itemPath = rawHref.startsWith('http')
      ? new URL(rawHref).pathname
      : rawHref.startsWith('/')
        ? rawHref
        : `/${rawHref}`;

    if (seenPaths.has(itemPath)) continue;
    seenPaths.add(itemPath);

    const fullUrl = rawHref.startsWith('http') ? rawHref : `${origin}${itemPath}`;
    const title = decodeHtmlEntities(titleMatch[1]);
    if (!title) continue;

    const posterMatch =
      chunk.match(/data-src=["'](https?:\/\/[^"']+)["']/i) ||
      chunk.match(/src=["'](https?:\/\/[^"']+)["']/i);
    const poster = posterMatch ? posterMatch[1].trim() : '';

    const quality = decodeHtmlEntities(
      (chunk.match(/<span class=["']quality["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || 'WEB-DL'
    );
    const language = decodeHtmlEntities(
      (chunk.match(/<span class=["']language["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || 'MULTI'
    );
    const views = decodeHtmlEntities(
      (chunk.match(/<span class=["']views-badge-top["'][^>]*>[\s\S]*?<\/i>\s*([^<]+)<\/span>/i) || [])[1] || '2.4K'
    );
    const timeAgo = decodeHtmlEntities(
      (chunk.match(/<div class=["']upload-time["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || 'Recently added'
    );
    const episodePill = decodeHtmlEntities(
      (chunk.match(/<span class=["']badge ep-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ''
    );

    const isPinned = chunk.includes('pin-badge') || chunk.includes('data-pin="1"');
    const isAdult =
      chunk.includes('data-18="1"') ||
      itemPath.includes('18plus') ||
      episodePill.toUpperCase().includes('18+');

    let typeBadge: 'MOVIE' | 'SERIES' | 'ANIME' | 'DRAMA' = 'MOVIE';
    if (itemPath.includes('/anime/')) typeBadge = 'ANIME';
    else if (itemPath.includes('/drama/')) typeBadge = 'DRAMA';
    else if (itemPath.includes('/series/') || Boolean(episodePill)) typeBadge = 'SERIES';

    items.push({
      id: itemPath.replace(/[^a-zA-Z0-9_-]/g, '_'),
      title,
      url: fullUrl,
      path: itemPath,
      poster,
      quality: quality || 'HD',
      views: views || '1.9K',
      language: language || 'MULTI',
      typeBadge,
      timeAgo: timeAgo || 'Updated live',
      episodePill,
      isPinned,
      isAdult,
    });
  }

  // Extract max page number
  const pageMatches = [...body.matchAll(/\/page\/(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => !isNaN(n) && n > 0 && n <= 2000);
  const maxPage = pageMatches.length > 0 ? Math.max(...pageMatches) : 520;

  return { items, maxPage };
}

function parseMovieDetail(html: string, pageUrl: string, origin: string): MovieDetailData {
  // 1. Decode mlbdInlinePlayerData JSON if available
  let inlineData: any = null;
  const playerScriptMatch = html.match(
    /<script[^>]*id=["']mlbdInlinePlayerData["'][^>]*data-s=["']([^"']+)["'][^>]*data-r=["'](\d+)["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (playerScriptMatch) {
    const decodedJson = decodeMlbdCipher(
      playerScriptMatch[3],
      playerScriptMatch[1],
      parseInt(playerScriptMatch[2], 10) || 600
    );
    try {
      inlineData = JSON.parse(decodedJson);
    } catch {
      inlineData = null;
    }
  }

  // 2. Decode all <a data-dl="..." data-ds="..." data-dr="..."> direct download buttons
  const downloadButtons: DirectDownloadButton[] = [];
  const dlRegex = /<a[^>]*data-dl=["']([^"']+)["'][^>]*data-ds=["']([^"']+)["'][^>]*data-dr=["'](\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(dlRegex)) {
    const decodedHref = decodeMlbdCipher(match[1], match[2], parseInt(match[3], 10) || 300);
    const label = decodeHtmlEntities(match[4]);
    if (decodedHref) {
      const fullDlUrl = decodedHref.startsWith('http')
        ? decodedHref
        : `${origin}${decodedHref.startsWith('/') ? '' : '/'}${decodedHref}`;
      const bracketMatch = label.match(/\[(.*?)\]/);
      const parts = bracketMatch ? bracketMatch[1].split('•').map((s) => s.trim()) : [];
      downloadButtons.push({
        label: label || 'Direct Download',
        url: fullDlUrl,
        quality: parts[0] || 'HD',
        size: parts[1] || '',
      });
    }
  }

  // 3. Parse metadata fields from detail HTML
  const title =
    inlineData?.title ||
    decodeHtmlEntities((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || 'Movie Details');

  const poster =
    inlineData?.poster ||
    (html.match(/<div class=["']image-container-view["'][\s\S]*?<img[^>]+src=["'](https?:\/\/[^"']+)["']/i) || [])[1] ||
    '';

  const qualityNote = decodeHtmlEntities(
    (html.match(/<div class=["']movie-info-view["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || ''
  );

  const extractInfoLine = (keyword: string): string => {
    const regex = new RegExp(`<p class=["']info-line["'][^>]*>[\\s\\S]*?${keyword}:?<\\/b>([\\s\\S]*?)<\\/p>`, 'i');
    const m = html.match(regex);
    return m ? decodeHtmlEntities(m[1]) : '';
  };

  const genre = extractInfoLine('Genre') || 'Cinema, Entertainment';
  const language = extractInfoLine('Language') || 'Multi Audio';
  const quality = extractInfoLine('Quality') || 'WEB-DL';
  const resolution = extractInfoLine('Resolution') || '1080p | 720p | 480p';
  const releaseDate = extractInfoLine('Released') || '2026';

  const storyline = decodeHtmlEntities(
    (html.match(/<p class=["']story-text["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] ||
      (html.match(/<meta name=["']description["'] content=["']([^"']+)["']/i) || [])[1] ||
      ''
  );

  const trailerMatch = html.match(/data-mlbd-trailer=["']([a-zA-Z0-9_-]{6,20})["']/i);
  const youtubeTrailerId = trailerMatch ? trailerMatch[1] : '';

  // 4. Parse Cast members
  const cast: CastMember[] = [];
  const castRegex = /<a class=["']mlbd-cast__p["'][^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>[\s\S]*?<small>([\s\S]*?)<\/small>/gi;
  for (const m of html.matchAll(castRegex)) {
    cast.push({
      url: m[1],
      photo: m[2],
      name: decodeHtmlEntities(m[3]),
      role: decodeHtmlEntities(m[4]),
    });
  }

  // 5. Parse Community Vote summary if present
  let communityScore: MovieDetailData['communityScore'] | undefined;
  const voteMatch = html.match(/data-summary=["']([^"']+)["']/i);
  if (voteMatch) {
    try {
      const parsedVote = JSON.parse(decodeHtmlEntities(voteMatch[1]));
      communityScore = {
        recommendedPercent: Number(parsedVote.recommended_percent) || 85,
        totalVotes: Number(parsedVote.total) || 12,
        verdict: parsedVote.verdict || ' দর্শকদের পছন্দ',
      };
    } catch {
      // ignore
    }
  }

  // 6. Map episodes and sources from inlineData
  const episodes: EpisodeItem[] = Array.isArray(inlineData?.episodes)
    ? inlineData.episodes.map((ep: any, idx: number) => {
        const sources: StreamSource[] = Array.isArray(ep.sources)
          ? ep.sources
              .filter((s: any) => s && (s.url || s.download_url))
              .map((s: any) => ({
                id: String(s.id || `src-${idx}-${s.quality || 720}`),
                quality: Number(s.quality) || 720,
                qualityLabel: s.quality_label || `${s.quality || 720}p`,
                audio: String(s.audio || 'Default'),
                audioLanguages: Array.isArray(s.audio_languages) ? s.audio_languages : [String(s.audio || 'Original')],
                provider: String(s.provider || 'MLBD CDN'),
                url: String(s.url || ''),
                downloadUrl: String(s.download_url || s.url || ''),
                type: String(s.type || 'mkv').toLowerCase(),
                name: String(s.name || `${title} - ${s.quality || 720}p`),
                screenshot: s.screenshot || undefined,
              }))
          : [];

        return {
          id: String(ep.id || `ep-${idx + 1}`),
          label: String(ep.label || (ep.number ? `Episode ${ep.number}` : 'Full Movie')),
          number: ep.number ?? null,
          season: ep.season ?? null,
          kind: String(ep.kind || 'movie'),
          sources,
        };
      })
    : [];

  const screenshots: string[] = Array.isArray(inlineData?.screenshots)
    ? inlineData.screenshots.map((s: any) => s?.url).filter(Boolean)
    : [];

  return {
    title,
    url: pageUrl,
    poster,
    qualityNote,
    typeBadge: inlineData?.content_type === 'series' || episodes.length > 1 ? 'SERIES' : 'MOVIE',
    language,
    quality,
    genre,
    resolution,
    releaseDate,
    storyline,
    youtubeTrailerId,
    screenshots,
    episodes,
    downloadButtons,
    cast: cast.slice(0, 12),
    communityScore,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Live Categories Endpoint
  app.get('/api/categories', (_req, res) => {
    res.json({
      categories: ALL_CATEGORIES,
      mirrors: MIRRORS,
    });
  });

  // 2. Live Catalog & Search Endpoint (All 520+ pages & 90+ categories)
  app.get('/api/catalog', async (req, res) => {
    const rawPath = String(req.query.path || '/').trim();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const search = String(req.query.q || '').trim();
    const includeAdult = String(req.query.adult || '1') !== '0';

    let targetPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    if (search) {
      targetPath = `/search?q=${encodeURIComponent(search)}`;
    } else if (page > 1) {
      const base = targetPath === '/' ? '' : targetPath.replace(/\/+$/, '');
      targetPath = `${base}/page/${page}`;
    }

    const cacheKey = `${targetPath}::adult=${includeAdult ? 1 : 0}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({
        ok: true,
        cached: true,
        path: rawPath,
        page,
        maxPage: cached.data.maxPage,
        activeOrigin: cached.data.activeOrigin,
        items: includeAdult ? cached.data.items : cached.data.items.filter((i) => !i.isAdult),
      });
      return;
    }

    try {
      const { html, finalOrigin } = await fetchFromMirrors(targetPath, includeAdult);
      const { items, maxPage } = parseMovieCards(html, finalOrigin);

      if (items.length > 0) {
        catalogCache.set(cacheKey, {
          data: { items, maxPage, activeOrigin: finalOrigin },
          expiresAt: Date.now() + 90_000, // 90s live cache
        });
        res.json({
          ok: true,
          cached: false,
          path: rawPath,
          page,
          maxPage,
          activeOrigin: finalOrigin,
          items: includeAdult ? items : items.filter((i) => !i.isAdult),
        });
        return;
      }
    } catch (err) {
      console.error('Live catalog fetch error:', err);
    }

    // Fallback to initial curated pool if mirror timed out
    const fallbackItems = INITIAL_FALLBACK_MOVIES[rawPath] || INITIAL_FALLBACK_MOVIES['/'] || [];
    res.json({
      ok: true,
      fallback: true,
      path: rawPath,
      page,
      maxPage: 520,
      activeOrigin: MIRRORS[0],
      items: includeAdult ? fallbackItems : fallbackItems.filter((i) => !i.isAdult),
    });
  });

  // 3. Live Movie / Anime / Series Decryptor & Detail Extractor
  app.get('/api/details', async (req, res) => {
    const rawPath = String(req.query.path || req.query.url || '').trim();
    const fallbackTitle = String(req.query.title || '').trim();

    if (!rawPath && !fallbackTitle) {
      res.status(400).json({ ok: false, error: 'Missing path or title parameter' });
      return;
    }

    const cached = detailCache.get(rawPath);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ ok: true, cached: true, detail: cached.data });
      return;
    }

    try {
      let { html, finalOrigin, finalUrl } = await fetchFromMirrors(rawPath || '/', true);

      // If dynamic mKs_ session slug expired and returned 404, auto-resolve via title search!
      const is404 =
        html.length < 1500 ||
        html.includes('<div class="n">404</div>') ||
        html.includes('Page not found');

      if (is404 && fallbackTitle) {
        const cleanQuery = fallbackTitle
          .replace(/\[.*?\]|\(.*?\)/g, ' ')
          .replace(/S\d+|Ep\s*\d+/gi, ' ')
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .join(' ');

        if (cleanQuery) {
          const searchRes = await fetchFromMirrors(`/search?q=${encodeURIComponent(cleanQuery)}`, true);
          const { items } = parseMovieCards(searchRes.html, searchRes.finalOrigin);
          if (items.length > 0) {
            const resolved = await fetchFromMirrors(items[0].path, true);
            html = resolved.html;
            finalOrigin = resolved.finalOrigin;
            finalUrl = resolved.finalUrl;
          }
        }
      }

      const detail = parseMovieDetail(html, finalUrl, finalOrigin);
      if (detail.episodes.length > 0 || detail.downloadButtons.length > 0 || detail.storyline) {
        detailCache.set(rawPath, {
          data: detail,
          expiresAt: Date.now() + 5 * 60_000,
        });
      }

      res.json({ ok: true, detail });
    } catch (err) {
      console.error('Detail fetch error:', err);
      res.status(500).json({
        ok: false,
        error: 'Failed to load live movie details from MovieLinkBD mirror.',
      });
    }
  });

  // 4. Clean iPhone-Compatible Live Site Proxy for In-App Iframe Mode
  app.get('/api/proxy-page', async (req, res) => {
    const rawPath = String(req.query.path || '/').trim();
    const stripAds = String(req.query.clean || '1') !== '0';

    try {
      const { html, finalOrigin } = await fetchFromMirrors(rawPath, true);
      let processed = html;

      // Always remove the iOS forced top-level redirect script so it works on iPhone Safari inside an iframe
      processed = processed.replace(
        /<script>\(function\(\)\{try\{var ua=navigator\.userAgent[\s\S]*?<\/script>/i,
        ''
      );

      if (stripAds) {
        // Strip popunder & click-hijack ad scripts while preserving player & search scripts
        processed = processed
          .replace(/<script[^>]*id=["']mlbd-display-ads[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<script[^>]*id=["']mlbd-click-ads[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/\/mlbd-adopen\.php/g, '/api/noop');
      }

      // Inject base tag + navigation bridge so clicks inside the iframe stay inside our clean proxy
      const bridgeScript = `
        <base href="${finalOrigin}/" />
        <style>
          #mlbd-adfree, .mlbd-ad-slot, [data-mlbd-ad] { display: none !important; }
        </style>
        <script>
          document.addEventListener('click', function(e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            var href = a.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            try {
              var u = new URL(href, '${finalOrigin}');
              if (u.hostname.includes('movielinkbd')) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = '/api/proxy-page?clean=${stripAds ? '1' : '0'}&path=' + encodeURIComponent(u.pathname + u.search);
              }
            } catch (_) {}
          }, true);
          document.addEventListener('submit', function(e) {
            var form = e.target;
            if (form && form.action && form.action.includes('search')) {
              e.preventDefault();
              var qInput = form.querySelector('input[name="q"]');
              if (qInput && qInput.value) {
                window.location.href = '/api/proxy-page?clean=${stripAds ? '1' : '0'}&path=' + encodeURIComponent('/search?q=' + encodeURIComponent(qInput.value));
              }
            }
          }, true);
        </script>
      `;

      processed = processed.replace(/<head[^>]*>/i, (match) => `${match}${bridgeScript}`);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(processed);
    } catch (err) {
      res.status(502).send(`
        <!doctype html>
        <html>
          <body style="background:#090b10;color:#f1f5f9;font-family:sans-serif;padding:2rem;text-align:center;">
            <h3>সার্ভারের সাথে সংযোগ করা যাচ্ছে না</h3>
            <p>অনুগ্রহ করে Native App Mode ব্যবহার করুন অথবা আবার চেষ্টা করুন।</p>
          </body>
        </html>
      `);
    }
  });

  app.all('/api/noop', (_req, res) => {
    res.status(204).end();
  });

  // Vite middleware for development / static assets for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MovieLinkBD iPhone Cinema Server running on http://localhost:${PORT}`);
  });
}

startServer();
