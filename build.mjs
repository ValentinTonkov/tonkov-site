// Static build: views/ (Nunjucks) + data/ (JSON) → dist/ (plain HTML + assets).
//
//   node build.mjs            build once
//   node build.mjs --serve    build and serve dist/ on http://localhost:4173
//   node build.mjs --watch    rebuild when views/, data/ or web/ change
//   node build.mjs --absolute keep root-relative URLs (/css/site.css) instead of relative ones
//
// The templates use root-relative URLs exactly as the Yii2 app will (/product/x.html, /css/site.css).
// By default the build rewrites them to relative paths so dist/ also works when opened
// straight from disk or from a sub-folder.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import nunjucks from 'nunjucks';

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const ABSOLUTE = args.has('--absolute');

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/* ----------------------------------------------------------------- vendor */
// Bootstrap, Bootstrap Icons and the font are copied from node_modules into web/ once,
// so web/ is self-contained and can be dropped into the Yii2 web root as it is.
function syncVendor() {
  const copy = (from, to) => {
    const dest = path.join(ROOT, 'web', to);
    if (fs.existsSync(dest)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(ROOT, 'node_modules', from), dest, { recursive: true });
  };
  copy('bootstrap/dist/css/bootstrap.min.css', 'vendor/bootstrap/css/bootstrap.min.css');
  copy('bootstrap/dist/js/bootstrap.bundle.min.js', 'vendor/bootstrap/js/bootstrap.bundle.min.js');
  copy('bootstrap-icons/font/bootstrap-icons.min.css', 'vendor/bootstrap-icons/bootstrap-icons.min.css');
  copy('bootstrap-icons/font/fonts', 'vendor/bootstrap-icons/fonts');
  for (const subset of ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext']) {
    copy(`@fontsource-variable/sofia-sans/files/sofia-sans-${subset}-wght-normal.woff2`, `fonts/sofia-sans-${subset}.woff2`);
  }
}

/* ------------------------------------------------------------------- data */
function loadData() {
  const site = readJson('data/site.json');
  const categories = readJson('data/categories.json');
  const images = readJson('data/images.json');
  const recipes = readJson('data/recipes.json');
  const guide = readJson('data/guide.json');
  const faq = readJson('data/faq.json');
  const gallery = readJson('data/gallery.json');

  const products = fs
    .readdirSync(path.join(ROOT, 'data/products'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => readJson(`data/products/${f}`))
    .filter((p) => p.active !== false);

  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));
  for (const c of categories) {
    c.url = `/category/${c.slug}.html`;
    c.children = categories.filter((x) => x.parent === c.slug);
    c.parentCategory = c.parent ? catBySlug[c.parent] : null;
  }
  for (const p of products) {
    p.url = `/product/${p.slug}.html`;
    p.categoryObj = catBySlug[p.category];
    if (!p.categoryObj) throw new Error(`Продукт „${p.slug}“ е с непозната категория „${p.category}“`);
    p.root = p.categoryObj.parentCategory || p.categoryObj; // main direction
    p.image = p.images?.[0] || null;
  }
  for (const c of categories) {
    const slugs = new Set([c.slug, ...c.children.map((x) => x.slug)]);
    c.products = products.filter((p) => slugs.has(p.category));
  }
  const recipeCat = Object.fromEntries(recipes.categories.map((c) => [c.slug, c.name]));
  for (const r of recipes.recipes) r.categoryName = recipeCat[r.category];

  return { site, categories, catBySlug, images, recipes, guide, faq, gallery, products };
}

/* -------------------------------------------------------------- templating */
const eur = new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatEur = (n) => `${Number.isInteger(n) ? eur.format(n) : n.toFixed(2).replace('.', ',')} €`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tiny Markdown subset used in the data: paragraphs, "- " lists and **bold**. */
function md(text) {
  if (!text) return '';
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return String(text)
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter(Boolean);
      const out = [];
      let list = [];
      const flush = () => {
        if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
        list = [];
      };
      const para = [];
      for (const line of lines) {
        if (/^- /.test(line)) {
          if (para.length) out.push(`<p>${para.splice(0).map(inline).join('<br>')}</p>`);
          list.push(line.slice(2));
        } else {
          flush();
          para.push(line);
        }
      }
      if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      flush();
      return out.join('\n');
    })
    .join('\n');
}

function createEnv(data) {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ROOT, 'views'), { noCache: true }), {
    autoescape: true,
    trimBlocks: true,
    lstripBlocks: true,
    throwOnUndefined: false,
  });
  const safe = (html) => new nunjucks.runtime.SafeString(html);

  env.addFilter('md', (t) => safe(md(t)));
  env.addFilter('eur', (n) => formatEur(n));
  env.addFilter('json', (v) => safe(JSON.stringify(v).replace(/</g, '\\u003c')));
  env.addFilter('nbsp', (s) => safe(esc(s).replace(/ (\S{1,2}) /g, ' $1&nbsp;')));

  /** Price label for a product: "290 €", "323 – 407 €", or "Цена по запитване". */
  env.addGlobal('priceLabel', (p) => {
    if (p.price == null) return 'Цена по запитване';
    return p.priceMax ? `${formatEur(p.price).replace(' €', '')} – ${formatEur(p.priceMax)}` : formatEur(p.price);
  });

  /**
   * <picture> for a photo from site_pictures/ (optimised by scripts/images.mjs).
   * picture('hero_section', 'alt text', { sizes: '100vw', class: '...', eager: true, position: '50% 60%' })
   */
  env.addGlobal('picture', (name, alt = '', opts = {}) => {
    const img = data.images[name];
    if (!img) throw new Error(`Няма снимка „${name}“ в data/images.json — пуснете "npm run images"`);
    const srcset = img.widths.map((w) => `/img/site/${name}-${w}.webp ${w}w`).join(', ');
    const style = opts.position ? ` style="object-position:${esc(opts.position)}"` : '';
    return safe(
      `<picture>` +
        `<source type="image/webp" srcset="${srcset}" sizes="${esc(opts.sizes || '100vw')}">` +
        `<img src="/img/site/${img.fallback}" alt="${esc(alt)}" width="${img.w}" height="${img.h}"` +
        `${opts.class ? ` class="${esc(opts.class)}"` : ''}${style}` +
        ` ${opts.eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>` +
        `</picture>`,
    );
  });

  env.addGlobal('clamp', (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000);
  for (const [k, v] of Object.entries(data)) env.addGlobal(k, v);
  env.addGlobal('year', new Date().getFullYear());
  return env;
}

/* ------------------------------------------------------------------ routes */
function routes(d) {
  const pages = [
    { out: 'index.html', view: 'site/index', ctx: { active: 'home', bodyClass: 'has-hero page-home' } },
    { out: 'about.html', view: 'site/about', ctx: { active: 'about' } },
    { out: 'contact.html', view: 'site/contact', ctx: { active: 'contact' } },
    { out: 'order.html', view: 'site/order', ctx: {} },
    { out: 'gallery.html', view: 'site/gallery', ctx: { active: 'gallery' } },
    { out: 'privacy-policy.html', view: 'site/privacy', ctx: {} },
    { out: '404.html', view: 'site/error', ctx: {} },
    { out: 'cart/index.html', view: 'cart/index', ctx: {} },
    { out: 'autoclave/recipes.html', view: 'autoclave/recipes', ctx: { active: 'recipes' } },
    { out: 'autoclave/guide.html', view: 'autoclave/guide', ctx: { active: 'avtoklavi' } },
  ];
  for (const c of d.categories) {
    const root = c.parentCategory || c;
    pages.push({
      out: `category/${c.slug}.html`,
      view: c.view || 'category/view',
      ctx: { category: c, active: root.slug, bodyClass: c.image ? 'has-hero' : '' },
    });
  }
  for (const p of d.products) {
    const related = p.categoryObj.products.filter((x) => x.slug !== p.slug);
    const i = p.categoryObj.products.indexOf(p);
    const pick = [...related.slice(i), ...related.slice(0, i)].slice(0, 4);
    pages.push({ out: `product/${p.slug}.html`, view: 'product/view', ctx: { product: p, related: pick, active: p.root.slug } });
  }
  return pages;
}

/* --------------------------------------------------- root-relative → relative */
function relativize(html, outPath) {
  if (ABSOLUTE) return html;
  const depth = outPath.split('/').length - 1;
  const rel = depth ? '../'.repeat(depth) : './';
  const fixUrl = (u) => {
    if (!u.startsWith('/') || u.startsWith('//')) return u;
    const cut = u.search(/[?#]/);
    const p = cut === -1 ? u : u.slice(0, cut);
    const tail = cut === -1 ? '' : u.slice(cut);
    return rel + (p === '/' ? 'index.html' : p.slice(1)) + tail;
  };
  return html
    .replace(' data-root="/"', ` data-root="${rel}"`) // base path for URLs built in site.js
    .replace(/(\s(?:href|src|action|poster|data-src|data-full|content)=")(\/[^"]*)"/g, (m, a, u) => `${a}${fixUrl(u)}"`)
    .replace(/(\ssrcset=")([^"]+)"/g, (m, a, list) => `${a}${list.split(/,\s*/).map((part) => { const [u, w] = part.trim().split(/\s+/); return [fixUrl(u), w].filter(Boolean).join(' '); }).join(', ')}"`);
}

/* ------------------------------------------------------------------- build */
function build() {
  const t0 = Date.now();
  syncVendor();
  const data = loadData();
  const env = createEnv(data);

  // render everything first — a template error must not leave dist/ half-built
  const pages = routes(data);
  const rendered = [];
  for (const page of pages) {
    if (!fs.existsSync(path.join(ROOT, 'views', `${page.view}.njk`))) {
      console.warn(`  ! липсва изглед views/${page.view}.njk — пропускам ${page.out}`);
      continue;
    }
    const html = env.render(`${page.view}.njk`, { ...page.ctx, pagePath: `/${page.out}` });
    rendered.push([page.out, relativize(html, page.out)]);
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(path.join(ROOT, 'web'), DIST, { recursive: true });
  for (const [out, html] of rendered) {
    const file = path.join(DIST, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  }

  // sitemap.xml (absolute URLs)
  const urls = pages.filter((p) => !['404.html', 'cart/index.html'].includes(p.out)).map((p) => `${data.site.url}/${p.out === 'index.html' ? '' : p.out}`);
  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
  );

  console.log(`dist/ — ${pages.length} страници, ${data.products.length} продукта (${Date.now() - t0} ms)`);
}

function safeBuild() {
  try {
    build();
  } catch (e) {
    console.error(`\n✗ ${e.message}\n`);
    if (!args.has('--watch')) process.exit(1);
  }
}

safeBuild();

/* ------------------------------------------------------------------- watch */
if (args.has('--watch')) {
  let timer;
  for (const dir of ['views', 'data', 'web']) {
    fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(safeBuild, 150);
    });
  }
  console.log('Следя views/, data/ и web/ за промени…');
}

/* ------------------------------------------------------------------- serve */
if (args.has('--serve')) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf', '.xml': 'application/xml' };
  const port = Number(process.env.PORT) || 4173;
  http
    .createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      let file = path.join(DIST, p);
      if (!file.startsWith(DIST)) file = path.join(DIST, '404.html');
      const exists = fs.existsSync(file) && fs.statSync(file).isFile();
      if (!exists) file = path.join(DIST, '404.html');
      // dist/ is rebuilt while the server runs — a file can vanish between the check and the read
      const stream = fs.createReadStream(file);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '1' });
        res.end('Rebuilding — reload in a second.');
      });
      stream.on('open', () => {
        res.writeHead(exists ? 200 : 404, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        stream.pipe(res);
      });
    })
    .on('error', (e) => {
      console.error(e.code === 'EADDRINUSE' ? `\n✗ Порт ${port} е зает — вече върви друг "npm run dev"? Спрете го или пуснете с PORT=4174.\n` : e);
      process.exit(1);
    })
    .listen(port, () => console.log(`http://localhost:${port}`));
}
