// Optimises the photos from site_pictures/ into web/img/site/ (WebP in several widths + a JPG fallback).
// Re-run it whenever a picture in site_pictures/ is replaced:  npm run images
//
// The templates reference these by name, e.g. {{ picture('hero_section', ...) }} — see build.mjs.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'site_pictures');
const OUT = path.join(ROOT, 'web/img/site');

const HERO = [768, 1280, 1920, 2560];
const CONTENT = [640, 1024, 1600];

// name → widths. Anything in site_pictures/ that is not listed gets CONTENT widths.
const WIDTHS = {
  hero_section: HERO,
  wood_hero: HERO,
  autoclave_hero: HERO,
  iot_hero: HERO,
  avtoklavi_karta_prozrachna: [800, 1400, 2000],
};
const SKIP = new Set(['logo']);

// Optional crop before resizing, as fractions of the original: { left, top, right, bottom }.
// working_autoclaves and gallery3 have a camera date stamp in the bottom-right corner.
const CROP = {
  working_autoclaves: { bottom: 0.075 },
  gallery3: { bottom: 0.06 },
};

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};

for (const file of fs.readdirSync(SRC).sort()) {
  const ext = path.extname(file).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;
  const name = path.basename(file, ext);
  if (SKIP.has(name)) continue;

  let input = sharp(path.join(SRC, file), { failOn: 'none' }).rotate();
  let { width, height, hasAlpha } = await input.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  if (CROP[name]) {
    const c = { left: 0, top: 0, right: 0, bottom: 0, ...CROP[name] };
    const region = { left: Math.round(width * c.left), top: Math.round(height * c.top) };
    region.width = Math.round(width * (1 - c.right)) - region.left;
    region.height = Math.round(height * (1 - c.bottom)) - region.top;
    // materialise the rotated image first so the crop uses upright coordinates
    input = sharp(await input.toBuffer()).extract(region);
    ({ width, height } = region);
  }
  const widths = (WIDTHS[name] || CONTENT).filter((w) => w <= width);
  if (!widths.length) widths.push(width);

  for (const w of widths) {
    await input.clone().resize({ width: w }).webp({ quality: hasAlpha ? 86 : 78 }).toFile(path.join(OUT, `${name}-${w}.webp`));
  }
  // fallback for very old browsers / social previews
  const fallbackW = Math.min(1600, width);
  const fallback = hasAlpha ? `${name}.png` : `${name}.jpg`;
  const pipe = input.clone().resize({ width: fallbackW });
  await (hasAlpha ? pipe.png({ compressionLevel: 9, palette: true }) : pipe.jpeg({ quality: 80, mozjpeg: true })).toFile(path.join(OUT, fallback));

  manifest[name] = { widths, fallback, ratio: +(width / height).toFixed(4), w: width, h: height };
  console.log(`${file} → ${widths.join(', ')} px`);
}

fs.writeFileSync(path.join(ROOT, 'data/images.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${Object.keys(manifest).length} снимки → web/img/site/, описани в data/images.json`);
