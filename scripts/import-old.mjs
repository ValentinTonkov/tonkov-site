// One-off import from the earlier prototype (~/tonkov-site) into this project.
// It writes data/products/*.json, data/recipes.json, data/guide.json, data/faq.json
// and copies + optimises the product / recipe / guide photos into web/img/.
//
// It was run once to seed the project. After that the JSON files in data/ are the
// source of truth and are edited by hand — re-running this script OVERWRITES them.
//
//   node scripts/import-old.mjs [path-to-old-project]

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OLD = path.resolve(process.argv[2] || path.join(process.env.HOME, 'tonkov-site'));
const OLD_ASSETS = path.join(OLD, 'src/assets');
const PICS = path.join(ROOT, 'site_pictures');
const IMG = path.join(ROOT, 'web/img');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
};

/* ------------------------------------------------------------------ images */

async function saveImage(srcAbs, outDir, baseName, { max = 1200, thumb = 520 } = {}) {
  fs.mkdirSync(path.join(IMG, outDir), { recursive: true });
  const input = sharp(srcAbs, { failOn: 'none' }).rotate();
  const meta = await input.metadata();
  const landscape = (meta.autoOrient?.width ?? meta.width) >= (meta.autoOrient?.height ?? meta.height);
  const big = await input
    .clone()
    .resize({ width: landscape ? max : undefined, height: landscape ? undefined : max, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(IMG, outDir, `${baseName}.webp`));
  const out = { src: `img/${outDir}/${baseName}.webp`, w: big.width, h: big.height };
  if (thumb) {
    await input
      .clone()
      .resize({ width: thumb, withoutEnlargement: true })
      .webp({ quality: 76 })
      .toFile(path.join(IMG, outDir, `${baseName}-t.webp`));
    out.thumb = `img/${outDir}/${baseName}-t.webp`;
  }
  return out;
}

const oldImg = (i) => path.join(OLD_ASSETS, typeof i === 'string' ? i : i.src);
const pic = (name) => path.join(PICS, name);

/* ------------------------------------------------------------- text helpers */

const TYPO = [
  [/краствички/g, 'краставички'],
  [/елетрическа/g, 'електрическа'],
  [/вензната/g, 'везната'],
  [/парамертите/g, 'параметрите'],
  [/фукнция/g, 'функция'],
  [/поддръка/g, 'поддръжка'],
  [/липсаваща/g, 'липсваща'],
  [/изградна/g, 'изградена'],
  [/оразменена/g, 'оразмерена'],
  [/окоплектовано/g, 'окомплектовано'],
  [/подващ/g, 'подаващ'],
  [/моторредукктор/g, 'моторедуктор'],
  [/моторредуктор/g, 'моторедуктор'],
  [/мотор редуктори/g, 'моторедуктори'],
  [/включане/g, 'включване'],
  [/смарфон/g, 'смартфон'],
  [/нярязват/g, 'нарязват'],
  [/дафиноф/g, 'дафинов'],
  [/бурканиу/g, 'буркани'],
  [/Сместта/g, 'Сместа'],
  [/сместта/g, 'сместа'],
  [/сърми/g, 'сарми'],
  [/лимонтозу/g, 'лимонтузу'],
  [/асолютно/g, 'абсолютно'],
  [/Отговорноста/g, 'Отговорността'],
  [/заплаваме/g, 'запалваме'],
  [/считае /g, 'считате, '],
  [/по-вече/g, 'повече'],
  [/букерния/g, 'бункерния'],
  [/ ,/g, ','],
  [/,(?=[^\s\d])/g, ', '],
  [/\s+\./g, '.'],
  [/ {2,}/g, ' '],
];
const fix = (s) => TYPO.reduce((t, [a, b]) => t.replace(a, b), s || '').trim();

const quotes = (s) => s.replace(/"([^"]+)"/g, '„$1“');

function cleanName(n) {
  return quotes(n)
    .replace(/(\d)\s?л(?=\s|$)/g, '$1 л')
    .replace(/1\.4/g, '1,4')
    .replace(/\s-\s/g, ' — ')
    .replace(/\/([^/]+)\//, '($1)')
    .replace(/Плато за мезета Модел 6/, 'Плато за мезета „Модел 6“')
    .replace(/Тройка бурета — 5 л/, 'Тройка бурета 5 л');
}

function cleanSize(v) {
  let s = v.trim();
  if (/по ваше желание/i.test(s)) return s;
  s = s
    .replace(/\s*mm\b/i, '')
    .replace(/(\d)\s*[xXхХ]\s*(?=\d)/g, '$1 × ')
    .replace(/(\d)\s+(\d{3,})$/, '$1 × $2');
  return /\d$/.test(s) ? `${s} мм` : s;
}

function cleanSpecs(specs, { dropSize = false } = {}) {
  return (specs || [])
    .filter((s) => !(dropSize && s.label === 'Размер'))
    .map((s) => {
      let value = s.value.trim();
      if (s.label === 'Размер') value = cleanSize(value);
      if (s.label === 'Материал') {
        value = value
          .replace(/^СТ3 с дебелина 2 мм\.?$/i, 'стомана Ст3, 2 мм')
          .replace(/^ст3 с дебелина 2\s?мм$/i, 'стомана Ст3, 2 мм')
          .replace(/^ст3$/i, 'стомана Ст3')
          .replace(/^st 3,? 3\s?mm$/i, 'стомана Ст3, 3 мм')
          .replace(/^6 мм Ст3 и 2 мм Ст3$/, 'стомана Ст3 — 6 мм и 2 мм')
          .replace(/^Рамка от дъб$/, 'рамка от дъб');
      }
      return { label: s.label, value };
    });
}

const spec = (d, label) => (d.specs || []).find((s) => s.label === label)?.value?.trim();

/* ------------------------------------------------------ wood: revised texts */

const BARREL_BODY =
  'Изработваме буретата по класическата бъчварска технология, без компромис заради малкия размер: радиално нарязан, естествено сушен дъб (благун), метални обръчи и дървена канелка. Не използваме силикони, пасти и уплътнения.\n\nБурето е напълно функциониращо — ракията, виното или уискито отлежават в него и с времето стават по-меки и ароматни. Преди първото пълнене се закисва с вода; как точно, е описано в „Описание и употреба“.';
const BARREL_DOC = { title: 'Буретата — описание и употреба (PDF)', href: 'docs/bureta-opisanie-i-upotreba.pdf' };
const ENGRAVE_DOC = { title: 'Варианти за гравюра (PDF)', href: 'docs/varianti-za-gravyura.pdf' };
const GLASSES = 'Чашите не влизат в комплекта.';
const SHADES = 'Предлага се в три нюанса: натурално дърво, череша и тъмен.';
const DOOR_COLORS = 'Цветови варианти: натурален дъб, тъмен байц или шарен.';

/** Returns { summary, description, notes?, documents? } for a wood product. */
function woodCopy(slug, d) {
  const mat = spec(d, 'Материал');
  const of = mat ? ` от ${mat}` : '';
  const m = (re) => re.test(slug);

  // --- бурета
  if (slug === 'bure-5-l')
    return {
      summary: 'Дъбово буре с канелка и стойка — за отлежаване и поднасяне на ракия или вино.',
      description: `Дъбово буре с обем 5 литра, със стойка.\n\n${BARREL_BODY}`,
      documents: [BARREL_DOC],
    };
  if (slug === 'bure-5l-s-2d-gravura')
    return {
      summary: 'Дъбово буре 5 л с гравиран надпис или мотив по ваш избор.',
      description: `Дъбово буре с обем 5 литра и гравюра на челото — надпис, дата, пожелание или мотив по ваш избор. Готовите мотиви са събрани във „Варианти за гравюра“.\n\n${BARREL_BODY}`,
      documents: [ENGRAVE_DOC, BARREL_DOC],
    };
  if (slug === 'bure-5l-sys-stoika-za-chashi')
    return {
      summary: 'Дъбово буре 5 л върху стойка с гнезда за чаши.',
      description: `Дъбово буре с обем 5 литра върху стойка, на която чашите висят от двете страни на бурето.\n\n${BARREL_BODY}`,
      notes: [GLASSES],
      documents: [BARREL_DOC],
    };
  if (slug === 'bure-5l-s-2d-gravura-i-stoika-za-chashi')
    return {
      summary: 'Дъбово буре 5 л с гравюра по ваш избор и стойка за чаши.',
      description: `Дъбово буре с обем 5 литра с гравюра на челото — надпис, дата или мотив по ваш избор — върху стойка с гнезда за чаши. Готовите мотиви са събрани във „Варианти за гравюра“.\n\n${BARREL_BODY}`,
      notes: [GLASSES],
      documents: [ENGRAVE_DOC, BARREL_DOC],
    };
  if (slug === 'troika-bureta-5l')
    return {
      summary: 'Три дъбови бурета по 5 литра на обща стойка.',
      description: `Три дъбови бурета по 5 литра, подредени на обща стойка — общо 15 литра.\n\n${BARREL_BODY}`,
      documents: [BARREL_DOC],
    };
  if (slug === 'troika-bureta-5l-s-gravura-i-stoika-za-chashi')
    return {
      summary: 'Три бурета по 5 литра с гравюра по ваш избор, на стойка с места за чаши.',
      description: `Три дъбови бурета по 5 литра с гравюра на челата по ваш избор, на обща стойка с гнезда за чаши. Готовите мотиви са събрани във „Варианти за гравюра“.\n\n${BARREL_BODY}`,
      notes: [GLASSES],
      documents: [ENGRAVE_DOC, BARREL_DOC],
    };
  if (m(/^kofa-za-kladenec/))
    return {
      summary: `Дървена кофа за кладенец${of}, 8 литра.`,
      description: `Кофа за кладенец${of} с обем 8 литра, с метални обръчи и дръжка. Правим я по същия начин като буретата — от дъги, стегнати с обръчи.`,
    };
  if (slug === 'kashpa') return { summary: 'Дървена кашпа от чам.', description: 'Кашпа от чам за двора, терасата или градината.' };
  if (slug === 'kutiq-s-pojelanie')
    return {
      summary: 'Дървена кутия за бутилка с гравирано пожелание по ваш избор.',
      description: 'Дървена кутия за бутилка с капак, върху който гравираме пожелание по ваш избор. Стандартно е от чам; по желание я изработваме и от друг материал.',
    };
  if (m(/^kutiq-za-vino/)) {
    const motif = d.name.match(/"([^"]+)"/)?.[1];
    return {
      summary: `Дървена кутия за бутилка вино с гравиран мотив „${motif}“.`,
      description: `Дървена кутия за бутилка вино с капак и гравиран мотив „${motif}“. Стандартно е от чам; по желание я изработваме и от друг материал.`,
    };
  }

  // --- гравюри, рамки, плочи
  if (slug === 'gravura-vyrhu-dyrvo')
    return {
      summary: 'Гравюра върху дърво по ваша снимка — със стойка или с магнит.',
      description: 'Гравираме вашата снимка върху дърво. Изделието е със стойка или с магнит — по ваш избор.\n\nЗа добър резултат ни изпратете снимка с висока резолюция.',
    };
  if (slug === 'gravura-vyrhu-dvusloina-plastmasa')
    return {
      summary: 'Гравюра върху двуслойна пластмаса в дъбова рамка.',
      description: 'Гравюра по ваша снимка или надпис върху двуслойна пластмаса, поставена в рамка от дъб.',
    };
  if (slug === 'plocha-s-pojelanie')
    return {
      summary: 'Дъбова плоча с пожелание, формат A4.',
      description: 'Дъбова плоча във формат A4. Надписът, разположението му и гравюрите са по ваш избор.',
    };
  if (slug === 'plocha-s-pojelanie-i-lazerno-gravirana-snimka')
    return {
      summary: 'Дъбова плоча с пожелание и лазерно гравирана снимка.',
      description: 'Дъбова плоча с резбована рамка, лазерно гравирана снимка и пожелание под нея — снимката и текстът са ваши.',
    };
  if (m(/^plocha-s-pojelanie/))
    return {
      summary: 'Дъбова плоча с гравирано пожелание.',
      description: 'Дъбова плоча с резбована украса и гравирано пожелание. Текстът е по ваш избор.',
    };
  if (slug === 'ramka-za-format-a4')
    return { summary: 'Резбована дъбова рамка за формат A4, байц „Палисандър“.', description: 'Резбована рамка от дъб за снимка, грамота или сертификат във формат A4. Цвят: байц „Палисандър“.' };
  if (slug === 'ramka-za-format-a4-natural')
    return { summary: 'Резбована дъбова рамка за формат A4, натурален цвят.', description: 'Резбована рамка от дъб за снимка, грамота или сертификат във формат A4. Цвят: натурален дъб.' };
  if (slug === 'ramka-model-1') return { summary: 'Резбована дъбова рамка.', description: 'Резбована рамка от дъб с тъмен байц.' };

  // --- табели
  if (slug === 'tabela-golyama-12')
    return {
      summary: 'Голяма дъбова табела с надпис по ваш избор.',
      description: 'Голяма табела от дъб с надпис по ваш избор — за механа, вила или двор. Изпълнения: натурален дъб, тъмен байц или шарен.',
    };
  if (m(/^tabela-za-vrata/)) {
    const color = /naturalen/.test(slug) ? 'Цвят: натурален дъб.' : /tymen/.test(slug) ? 'Цвят: тъмен байц.' : DOOR_COLORS;
    return {
      summary: 'Табела за врата от масивен дъб с релефен надпис по ваш избор.',
      description: `Табела за врата от масивен дъб с резбован кант и релефен надпис — фамилия, адрес или име на фирма. Надписът е по ваш избор. ${color}`,
    };
  }

  // --- свещници, моливници
  if (m(/^sveshtnik-motiv/)) {
    const n = slug.at(-1);
    const color = (d.description.match(/цвят: ([^\n]+)/)?.[1] || '').trim();
    return {
      summary: `Ажурен свещник от бук с келтски мотив ${n}.`,
      description: `Ажурен свещник от бук с келтски мотив ${n}. На снимката е в цвят „${color}“. ${SHADES}`,
    };
  }
  if (slug === 'molivnik')
    return { summary: 'Ажурен моливник от бук с келтски мотив.', description: `Ажурен моливник от бук с келтски мотив. На снимката е в тъмен цвят. ${SHADES}` };
  if (slug === 'kalinka') return { summary: 'Моливник „Калинка“ с три отвора.', description: 'Моливник от бук във формата на калинка, с три отвора за моливи и химикалки.' };

  // --- плата
  if (m(/^plato-za-mezeta-(gligan|gluhar|lovci)/)) {
    const motif = d.name.match(/"([^"]+)"/)?.[1];
    return {
      summary: `Дъбово плато за мезета с гравиран ловен мотив „${motif}“.`,
      description: `Плато за мезета от масивен дъб с гравиран ловен мотив „${motif}“. Можем да гравираме и картинка, изпратена от вас.`,
    };
  }
  if (slug === 'plato-za-mezeta-model-6')
    return { summary: 'Дъбово плато за мезета с резбован кант и отделения.', description: 'Плато за мезета от масивен дъб с резбован кант и отделения за различните мезета.' };
  if (m(/^plato-za-mezeta/)) return { summary: 'Дъбово плато за мезета с резбован кант.', description: 'Плато за мезета от масивен дъб с фрезован орнамент по ръба.' };

  // --- ловни
  if (slug === 'trofei-gligan-s-ramka-za-sertifikat')
    return {
      summary: 'Резбована основа за глигански зъби с рамка за сертификата на трофея.',
      description: 'Резбована дъбова основа за глигански зъби, съчетана с рамка за сертификата на трофея.',
      notes: ['Зъбите не влизат в комплекта.'],
    };
  if (m(/^trofei-zybi-gligan/))
    return {
      summary: 'Резбована дъбова основа за трофей — зъби на глиган.',
      description: 'Резбована дъбова основа за ловен трофей — зъби на глиган. Размерите се съобразяват с вашия трофей.',
      notes: ['Зъбите не влизат в комплекта.'],
    };
  if (m(/^trofei-sryndak/))
    return {
      summary: 'Резбована дъбова основа за трофей от сръндак.',
      description: `Резбована дъбова основа за трофей от сръндак${/cherep/.test(slug) ? ' с череп. Размерите се съобразяват с вашия трофей' : ''}.`,
      notes: ['Черепът не влиза в комплекта.'],
    };
  if (slug === 'lovna-zakachalka') return { summary: 'Дъбова закачалка с релефни ловни мотиви.', description: 'Закачалка за стена от масивен дъб с релефни ловни мотиви.' };
  if (slug === 'rogatina-kopie') return { summary: 'Рогатина (ловно копие) с дъбова дръжка.', description: 'Рогатина — ловно копие с дъбова дръжка.' };
  if (slug === 'gligan') return { summary: `Релефно пано „Глиган“${of}.`, description: `Релефно пано „Глиган“${of}, изработено на CNC фреза.` };
  if (m(/^gluhari/))
    return {
      summary: `Резбовано пано „Глухари“${of}${/ramka/.test(slug) ? ', в рамка' : ''}.`,
      description: `Резбовано пано „Глухари“${of}${/ramka/.test(slug) ? ', в рамка' : ' — ажурна дърворезба с глухари сред листа'}.`,
    };

  // --- икони и пана
  if (m(/^ikonostas/)) {
    const who = d.name.replace(/^Иконостас\s*-?\s*/, '');
    return {
      summary: `Домашен иконостас${of} с резбована икона „${who}“.`,
      description: `Домашен иконостас${of} с резбована икона „${who}“ и поставка за кандило.`,
    };
  }
  if (m(/^(arhangel-mihail|bogorodica|isus-hristos|sveti-)/))
    return { summary: `Резбована икона „${d.name}“${of}.`, description: `Резбована икона „${d.name}“${of}, изработена на CNC фреза.` };
  if (m(/^dyrven-kryst/))
    return { summary: 'Малък резбован кръст от орех или дъб.', description: 'Малък резбован кръст от орех или дъб. По желание го байцваме в цвят „Палисандър“.' };
  if (slug === 'plochka-deva-mariq') return { summary: 'Малка плочка с образа на Дева Мария.', description: `Малка резбована плочка с образа на Дева Мария${of}.` };
  if (m(/^(angel-s-lyra|bylgarska-devoika|jar-ptica|cvetq)/))
    return { summary: `Резбовано пано „${d.name}“${of}.`, description: `Резбовано пано „${d.name}“${of}, изработено на CNC фреза.` };

  // --- фигури
  if (m(/^(kone-s-podkova|lyv-2|rak-2|skorpion|slon|slynchogled)$/))
    return { summary: `Релефна фигура „${d.name}“${of}.`, description: `Релефна декоративна фигура „${d.name}“${of}, изработена на CNC фреза.` };
  if (slug === 'koledni-snejinki') return { summary: 'Коледни снежинки от бук.', description: 'Ажурни коледни снежинки от бук — украса за окачване.' };

  // --- бойни изкуства
  if (slug === 'boken')
    return {
      summary: 'Бокен — дървен тренировъчен меч от дъб или ясен.',
      description: 'Бокен — дървен тренировъчен меч от дъб или ясен. Можем да го изработим и по спецификация на клиента.',
    };
  if (m(/^tanto/)) return { summary: 'Танто — дървен тренировъчен нож от дъб.', description: 'Танто — дървен тренировъчен нож от дъб.' };
  if (slug === 'kluchodyrjatel-aikido') return { summary: 'Дъбов ключодържател „Айкидо“.', description: 'Ключодържател от дъб с резбовани йероглифи „айкидо“.' };

  // --- други
  if (slug === 'chesalo-za-gryb') return { summary: 'Чесало за гръб от дъб.', description: 'Чесало за гръб от дъб с резбована дръжка.' };
  if (slug === 'paner') return { summary: 'Ажурен панер от дъб.', description: 'Ажурен панер от дъб — за хляб, плодове или дребни предмети.' };
  if (slug === 'stelaj-za-med') return { summary: 'Стелаж за мед от чам.', description: 'Стелаж от чам за буркани с мед, с мотив „пчелна пита“.' };
  if (slug === 'stoika-za-vydici') return { summary: 'Стойка за въдици от чам.', description: 'Стойка от чам за подреждане и съхранение на въдици.' };
  if (slug === 'inkrustirana-masa-za-kafe')
    return { summary: 'Маса за кафе от чам и дъб с инкрустиран плот.', description: 'Маса за кафе от чам и дъб с инкрустиран орнамент на плота.' };
  if (slug === 'bukvi_i_cifri') return { summary: 'Дървени букви и цифри от дъб, в размер по ваше желание.', description: 'Букви и цифри от дъб, изрязани на CNC фреза. Размерът и надписът са по ваше желание.' };
  if (slug === 'tractor') return { summary: 'Дървен трактор от дъб.', description: 'Дървен трактор от дъб — сувенир или играчка. Размерът е по ваше желание.' };
  if (slug === 'darven-kupol-shatra')
    return {
      summary: 'Дървена куполна конструкция за навес, оранжерия или зимна градина.',
      description: 'Куполна конструкция от чам. Подходяща е за навес на открито, оранжерия, зимна градина и др. Размерите се уточняват по проект.',
    };

  return { summary: mat ? `Изделие${of}.` : '', description: fix(d.description) };
}

const WOOD_EXCLUDE = new Set([
  'chebyri', // чебъри — не се включват
  // бурета 1,4 л — не се включват
  'bure-1-4-l',
  'bure-1-4l-s-2d-gravura',
  'bure-1-4l-s-2d-gravura-i-stoika-za-chashi',
  'bure-s-3d-gravura',
  'bure-za-sanbernar',
  'bure-za-sanbernar-2',
  'troika-bureta',
  // „Подаръци с дисплей“ — сърцето е в галерията с уникати, картичката няма снимка и данни
  'darveno-sartse-s-displey',
  'kartichka-s-displey',
]);

const WOOD_ORDER = ['bureta-i-sadove', 'gravyura-po-snimka', 'dom-i-interior', 'lovni-motivi', 'ikoni-i-pana'];
const WOOD_CAT_SLUG = { 'gravyura-po-snimka': 'gravyuri-i-ramki' };

/* --------------------------------------------- other directions: overrides */

const MONITORING_EXCLUDE = new Set(['loger-nalyagane', 'meteostantsia', 'iot-klyuch', 'iot-energien-monitoring', 'loger-kotel']);

const OVERRIDES = {
  avtoklav: {
    name: 'Автоклав',
    summary: 'Електрически автоклав за домашни консерви — 21 буркана по 720 мл на едно зареждане, с тъчскрийн контролер.',
    description:
      'Електрически автоклав за домашно приготвяне на консерви. Работи с пара под налягане и стига до 120 °C — температурата, при която месото, рибата и готовите ястия се стерилизират сигурно. Със същия уред се приготвят и зеленчуци, туршии и компоти на по-ниски температури.\n\nЗадавате само температура и време на тъчскрийн контролера, монтиран на самия автоклав. Той загрява, поддържа зададената температура, отброява времето и изключва нагревателя, когато програмата свърши.\n\nКонтролерът се продава и отделно — попитайте ни.',
    features: [
      '21 буркана по 720 мл на едно зареждане',
      'Температура от 50 до 120 °C',
      'Таймер за времето на автоклавиране',
      'Тъчскрийн контролер, монтиран на автоклава',
      'Работа с пара под налягане',
      'Електрическа мощност 2 kW',
    ],
    images: [
      { file: pic('autoclave_hero.jpg'), alt: 'Автоклав с контролер, манометър и буркани с готови консерви' },
      { old: 'photos/avtoklav.jpg', alt: 'Автоклав с монтиран контролер и манометър' },
      { old: 'import/gorelki/autoclave2-4.jpg', alt: 'Три автоклава с контролери в работилницата' },
      { old: 'photos/kontroler-nastroyki.jpg', alt: 'Екранът на контролера: време 50 минути, температура 120 °C, бутон СТАРТ' },
      { old: 'photos/kontroler-zagryavane.jpg', alt: 'Екранът на контролера по време на загряване' },
      { old: 'import/gorelki/autoclave2-1.jpg', alt: 'Автоклав с контролер' },
      { old: 'import/gorelki/autoclave2-2.jpg', alt: 'Контролерът и манометърът отблизо' },
      { old: 'import/gorelki/autoclave2-3.jpg', alt: 'Автоклав — общ изглед' },
    ],
    videos: [
      { id: 'V5j1Xu847Jw', title: 'Какво представлява автоклавът' },
      { id: 'NZPiMVJGRBU', title: 'Процесите накратко' },
      { id: 'bhvWceyjCHw', title: 'Управление в режим „пара“' },
      { id: 'f_U0kV4wqrM', title: 'Якостни проверки' },
      { id: 'SuFCvVHR2Fw', title: 'Пример с паламуд' },
      { id: '7W2-ZNkWUbg', title: 'Продукти, направени с автоклава' },
    ],
    documents: [{ title: 'Ръководство за експлоатация (PDF)', href: 'docs/avtoklav-rakovodstvo.pdf' }],
  },

  'vezna-za-kosheri': {
    summary: 'Следи теглото на кошера и състоянието на пчелното семейство в реално време — без да отваряте кошера.',
    description:
      'Везната стои под кошера и измерва теглото му денонощно. Данните отиват в онлайн платформа, където виждате дневния прираст, историята и графиките за избран период — от телефона или компютъра, където и да сте.\n\n**Свързаност**\n\n- Wi-Fi мрежа\n- SIM карта на мобилен оператор\n- локален режим без интернет\n\n**Какво измерва**\n\nСтандартно — теглото на кошера и напрежението на батерията. По избор се добавят:\n\n- температура в кошера\n- температура, влажност и атмосферно налягане на въздуха\n\n**Измервания и история**\n\nИзмерване на всеки 68 минути. Данните се пазят 12 месеца.\n\n**Захранване**\n\nАвтономно — презареждаема батерия и соларен панел.',
    features: [
      'Тегло на кошера в реално време',
      'Wi-Fi, SIM карта или локален режим без интернет',
      'Онлайн платформа: дневен прираст, история и графики',
      'Измерване на всеки 68 минути, данните се пазят 12 месеца',
      'По избор: температура в кошера, температура, влажност и налягане на въздуха',
      'Автономно захранване — батерия и соларен панел',
    ],
    images: [
      { file: pic('scale_with_beehive.jpg'), alt: 'Кошер върху везна със соларен панел в пчелина' },
      { old: 'import/iot/vezna-za-kosheri-2.jpg', alt: 'Рамата на везната за кошери' },
      { old: 'photos/vezna-otgore.jpg', alt: 'Везната отгоре — рамата и кутията с електрониката' },
      { old: 'import/iot/vezna-za-kosheri-3.jpg', alt: 'Везна за кошери — изглед отгоре' },
      { old: 'import/iot/vezna-za-kosheri-4.jpg', alt: 'Везна за кошери — изглед отстрани' },
      { old: 'import/iot/vezna-za-kosheri-5.jpg', alt: 'Везни, подготвени за изпращане' },
      { old: 'import/iot/vezna-za-kosheri-1.jpg', alt: 'Кошери върху везни в пчелина' },
      { old: 'import/iot/vezna-za-kosheri-2.png', alt: 'Графика на теглото на кошера в платформата' },
      { old: 'import/iot/vezna-za-kosheri-3.png', alt: 'Екран от платформата с последните данни за два кошера' },
    ],
    demo: true,
  },

  // Нов продукт — описанието е общо; техническите данни се допълват (виж TODO.md)
  'termovazhe-za-zarno': {
    name: 'Термовъже за зърно',
    sku: null,
    price: 450,
    isNew: true,
    summary: 'Следи температурата на зърното в дълбочина и ви предупреждава, преди да е започнало да се загрява.',
    description:
      'Загряването е първият признак, че в зърното има влага, вредители или започва самозагряване. Термовъжето се спуска в насипа и измерва температурата с датчици, разположени по дължината му — така виждате какво става в дълбочина, а не само на повърхността.\n\nДанните се изпращат автоматично към онлайн платформа. Там следите графиките за всеки датчик и задавате граници — при излизане от тях получавате известие по имейл.',
    features: [
      'Температурни датчици по дължината на въжето — измерване на различни дълбочини',
      'Данните се изпращат автоматично към онлайн платформа',
      'Графики и история на измерванията',
      'Известие по имейл при температура извън зададените граници',
    ],
    specs: [],
    images: [{ file: pic('temp_rope.jpg'), alt: 'Термовъже за зърно TR_D2 — въже с датчици и две кутии с електрониката' }],
    videos: [],
    demo: true,
    demoUrl: 'https://grainstore.tonkov.eu',
    oldUrl: 'https://iot.tonkov.eu/product/termo-sonda-zyrno.html',
  },

  'solarna-stantsia-sswfi': {
    summary: 'Осигурява Wi-Fi мрежа и интернет там, където няма ток — за пчелин, склад или отдалечен обект.',
    description:
      'Соларна станция за поддръжка на Wi-Fi мрежа и достъп до интернет на места без електрозахранване. Подходяща е за пчелини, складове и други отдалечени обекти, където работят нашите везни и датчици.\n\nКонфигурацията и цената се уточняват според обекта.',
    features: [
      'Соларен панел 100 W и акумулатор',
      'Рутер за карта за данни (картата не влиза в комплекта)',
      'Контролер за съвместната работа на устройствата',
      'Табло със степен на защита IP67',
      'Лека оразмерена метална конструкция, боядисана с „Протекта“',
    ],
    priceNote: 'според конфигурацията',
  },

  'pakt-la-960': {
    group: 'Котли',
    summary: 'Пелетен агрегатен котел с горелка ABTEDGEU90 и бункер, монтиран върху котела.',
    description:
      'Пелетен агрегатен котел с хоризонтална тунелно-тръбна конструкция и бункер за пелети, монтиран върху самия котел. Лесен е за почистване и елементарен за обслужване.\n\nВсеки котел се изпитва на 4,5 атм. и минава тестово палене със загряване на предварително измерен обем вода — със запис за конкретния котел.',
    features: [
      'Горелка ABTEDGEU90',
      'Комбинирана хоризонтална тунелно-тръбна конструкция',
      '18 тръби 2" с дължина 960 мм',
      'Бункер за пелети, монтиран върху котела',
      'Заварки с добър провар и завършек',
      'Изпитан на 4,5 атм.',
      'Максимално уплътнен горивен път',
    ],
    videos: [1, 2, 3, 4, 5, 6].map((n, i) => ({ id: ['TYtI7K_4a1E', 'TOVXqbofOkw', 'U5-NN5yF1iQ', '20V21GdPC48', 'CJZUouKyITg', 'zxkiJWl9QjA'][i], title: `PAKT LA 960 — видео ${n}` })),
  },
  'gorelka-peletna-3': {
    group: 'Горелки',
    name: 'Горелка ABTEDGEU90 — двушнекова, оборудвана',
    summary: 'Напълно окомплектована двушнекова горелка с контролер „Натурела“ и Wi-Fi — готова за работа.',
    description:
      'Напълно окомплектовано съоръжение, готово за експлоатация. Горелката е с два шнека — подаващ и вътрешен — и се управлява от контролер „Натурела“ с Wi-Fi.\n\nПали сама и поддържа зададената температура, работи с почти всякакви пелети и може да се вгради в различни котли, инсталации и съоръжения. Компонентите се предлагат свободно на българския пазар, а поддръжката е елементарна.',
    features: [
      'Два шнека — подаващ и вътрешен',
      'Контролер „Натурела“ с Wi-Fi',
      'Самостоятелно палене и поддържане на зададена температура',
      'Непрекъснат режим или таймери',
      '4 степени на модулация',
      'Известяване за грешки и аварии',
      'Датчик за защита от обратно горене',
      'Датчик за температурата на изгорелите газове',
      'Статистика за разхода на пелети',
    ],
  },
  'gorelka-peletna-4': {
    group: 'Горелки',
    name: 'Горелка едношнекова, оборудвана',
    summary: 'Едношнекова горелка с всичко необходимо за устойчиво горене. Управлява се през уеб браузър.',
    description:
      'Горелка с минимално необходимото за устойчиво горене: един шнек, моторедуктор „Мелор“ и вентилатор ebm-papst (при много добра тяга на инсталацията вентилаторът може да отпадне).\n\nПараметрите се задават през уеб браузър по Wi-Fi — на място може и през hotspot от мобилен телефон. Цикълът стартира автоматично след включване и не изисква връзка с мрежа, а последните настройки се запазват.\n\nПодходяща е за котли, печки, казани и други съоръжения. Менюто и алгоритмите на управление могат да се персонализират — например модулация на мощността според измерена температура.',
    features: [
      'Един шнек, моторедуктор „Мелор“',
      'Вентилатор ebm-papst',
      'Управление през уеб браузър по Wi-Fi или hotspot',
      'Работи без връзка с мрежа след настройването',
      'Запомня последните настройки',
      'Възможност за персонализирани алгоритми на управление',
    ],
  },
  'gorelka-peletna-1': {
    group: 'Горелки',
    name: 'Горелка необорудвана, с кутия',
    summary: 'Необорудвана горелка ABT9EDGEU90 с кутия — базово тяло за собствена окомплектовка.',
    description:
      'Необорудвана пелетна горелка ABT9EDGEU90 — базово тяло, на което да монтирате механизми и компоненти, с които разполагате или които ще закупите отделно.\n\nВключва корпус, скара и предпазители за вентилатора и моторедуктора. Не включва шнек, датчици, моторедуктори и вентилатор.',
    features: [
      'Присъединителни отвори за моторедуктори „Мелор“ или 60KTYZ',
      'Основна тръба 2" за шнекова спирала 36,5 × 40 × 20 – 8 × 3,3 мм',
      'Накрайник 2" за вентилатор ebm-papst RLG97, 38 W',
      'Тръба 2" за вход на пелетите',
      'Места за запалка FKK PSx-2-240B, фотосензор Siemens QHB1 и датчик за обратно горене',
      'Покритие — термоустойчива боя до 800 °C',
    ],
    dropSize: true,
  },
  'gorelka-peletna-2': {
    group: 'Горелки',
    name: 'Горелка едношнекова директна, необорудвана',
    summary: 'Необорудвана едношнекова директна горелка — корпус, скара и кош за пелети.',
    description:
      'Конфигурация с минимален брой механизми, която позволява устойчиво и продължително горене — на базата на ABT9EDGEU90. Базово тяло, на което да монтирате налични или избрани от вас механизми и компоненти.\n\nВключва корпус, скара и кош за пелети. Не включва шнек, датчици, моторедуктори и вентилатор.',
    features: [
      'Присъединителни отвори за моторедуктори „Мелор“ или 60KTYZ',
      'Основна тръба 2" за шнекова спирала 36,5 × 40 × 20 – 8 × 3,3 мм',
      'Накрайник 2" за вентилатор',
      'Места за запалка FKK PSx-2-240B, фотодатчик и датчик за обратно горене',
      'Покритие — термоустойчива боя до 800 °C',
    ],
    dropSize: true,
  },
  'gorelka-peletna-5': {
    group: 'Горелки',
    name: 'Базова глава за горелка',
    summary: 'Базова глава за горелка — минималната геометрия, върху която да изградите своя.',
    description:
      'Основна развойна компоновка с минимално необходимата геометрия и елементи — без нищо излишно. Оставя ви пълна свобода в избора на механизми и захранване, а „консумативите“ са елементарни и евтини.',
    features: [
      'Подвързване на различни вентилатори',
      'Подвързване на различни моторедуктори',
      'Монтажни места за запалка, датчик за осветеност и датчик за обратно горене',
    ],
  },
  'kontroler-peletna-gorelka-2-shneka': {
    group: 'Контролери',
    name: 'Контролер за пелетна горелка — два шнека',
    summary: 'Управлява два шнека и вентилатор и превключва между две мощности според температурата на котела.',
    description:
      'Контролер за управление на два шнека (вкл./изкл.) и вентилатор (регулиране на оборотите). Термодатчик следи температурата на котела и превключва между два режима — две мощности.\n\nНастройва се през уеб браузър — от смартфон, лаптоп или компютър. Wi-Fi или hotspot са нужни само за конфигурирането; след това контролерът работи и офлайн. При необходимост добавяме и други функции.',
    features: [
      'Два шнека (вкл./изкл.) и вентилатор с регулиране на оборотите',
      'Термодатчик и два режима на мощност',
      'Настройка през уеб браузър',
      'Работи офлайн след конфигурирането',
      'По избор: интегриране с логер за котел',
    ],
  },
  'kontroler-peletna-gorelka-1-shnek': {
    group: 'Контролери',
    name: 'Контролер за пелетна горелка — един шнек',
    summary: 'Управлява шнека и вентилатора на горелката. Настройва се през уеб браузър.',
    description:
      'Контролер за управление на шнек (вкл./изкл.) и вентилатор (регулиране на оборотите).\n\nНастройва се през уеб браузър — от смартфон, лаптоп или компютър. Wi-Fi или hotspot са нужни само за конфигурирането; след това контролерът работи и офлайн. При необходимост добавяме и други функции.',
    features: ['Шнек (вкл./изкл.) и вентилатор с регулиране на оборотите', 'Настройка през уеб браузър', 'Работи офлайн след конфигурирането'],
  },
  chetka: { group: 'Аксесоари', name: 'Четка за котел', summary: 'Четка за почистване на котела.', description: 'Четка за почистване на тръбите на котела.' },
  lopatka: { group: 'Аксесоари', name: 'Лопатка с дълга дръжка', summary: 'Лопатка за изриване на пепелта.', description: 'Лопатка с дълга дръжка за изриване на пепелта от котела.' },
  'lopatka-2': { group: 'Аксесоари', name: 'Лопатка за пелети', summary: 'Лопатка за зареждане с пелети.', description: 'Лопатка за загребване и зареждане на пелети.' },
  montazh: {
    group: 'Услуги',
    name: 'Подвързване и първоначални настройки',
    summary: 'Свързване на котела или горелката с Wi-Fi, настройка на горенето и обучение на място.',
    description:
      '**Цената включва**\n\n- свързване на котела или горелката с Wi-Fi мрежа или hotspot на място\n- обучение за конкретното устройство\n- оптимизиране на горивния процес\n- електрическо свързване към захранващата мрежа (кабелите и консумативите са за ваша сметка)\n\nОбучението и свързването при нас са безплатни — в рамките на разумна продължителност и след предварителна уговорка.\n\n**Не включва**\n\n- свързване на тръби, инсталация или котела към нея\n- изолация на котела или тръбите\n- позициониране и монтаж на котела на работното му място\n- пълнене и обезвъздушаване на системата\n- свързване към комин или друг димоотвод',
    features: [],
    priceNote: 'за 4 часа работа; пътни — 0,15 € на изминат км',
  },
  servis: {
    group: 'Услуги',
    name: 'Обслужване и ремонт на котли и горелки',
    summary: 'Обслужване и ремонт на място — на час.',
    description: 'Обслужване и ремонт на пелетни котли и горелки на място, след предварителна уговорка.',
    priceNote: 'на час; пътни — 0,15 € на изминат км',
  },
};

const BURNER_ORDER = [
  'pakt-la-960',
  'gorelka-peletna-3',
  'gorelka-peletna-4',
  'gorelka-peletna-1',
  'gorelka-peletna-2',
  'gorelka-peletna-5',
  'kontroler-peletna-gorelka-2-shneka',
  'kontroler-peletna-gorelka-1-shnek',
  'chetka',
  'lopatka',
  'lopatka-2',
  'montazh',
  'servis',
];
const MONITORING_ORDER = ['vezna-za-kosheri', 'termovazhe-za-zarno', 'solarna-stantsia-sswfi'];

/* ------------------------------------------------------------------- build */

async function buildProduct(slug, d, categorySlug, extra = {}) {
  const o = { ...(OVERRIDES[slug] || {}), ...extra };
  const name = o.name ?? cleanName(d.name);

  // images
  const srcs = o.images
    ? o.images.map((i) => ({ file: i.file ?? oldImg(i.old), alt: i.alt }))
    : (d.images || []).map((i) => ({ file: oldImg(i), alt: typeof i === 'object' ? i.alt : undefined }));
  const images = [];
  for (const [n, s] of srcs.entries()) {
    if (!fs.existsSync(s.file)) {
      console.warn(`  ! липсва снимка: ${s.file}`);
      continue;
    }
    const saved = await saveImage(s.file, 'products', `${slug}-${n + 1}`);
    images.push({ ...saved, alt: s.alt || (n === 0 ? name : `${name} — снимка ${n + 1}`) });
  }

  const product = {
    slug,
    name,
    category: categorySlug,
    ...(o.group ? { group: o.group } : {}),
    active: true,
    ...(o.isNew ? { isNew: true } : {}),
    sku: o.sku !== undefined ? o.sku : d.sku,
    price: o.price !== undefined ? o.price : d.price,
    ...(d.priceMax ? { priceMax: d.priceMax } : {}),
    ...(o.priceNote ?? d.priceNote ? { priceNote: o.priceNote ?? d.priceNote } : {}),
    cta: d.cta,
    summary: o.summary ?? d.summary ?? '',
    description: o.description ?? fix(d.description),
    features: o.features ?? (d.features || []).map(fix),
    ...(o.notes ? { notes: o.notes } : {}),
    specs: o.specs ?? cleanSpecs(d.specs, { dropSize: o.dropSize }),
    ...(d.variants?.length ? { variants: d.variants } : {}),
    images,
    videos: o.videos ?? d.videos ?? [],
    documents: o.documents ?? (d.documents || []).map((x) => ({ title: x.title, href: x.href.replace(/^\//, '') })),
    ...(o.demo ? { demo: true } : {}),
    ...(o.demoUrl ? { demoUrl: o.demoUrl } : {}),
    oldUrl: o.oldUrl ?? d.oldUrl ?? null,
  };
  return product;
}

async function main() {
  const dir = (name) => path.join(OLD, 'src/content/products', name);
  const load = (name) =>
    Object.fromEntries(
      fs
        .readdirSync(dir(name))
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f.replace(/\.json$/, ''), readJson(path.join(dir(name), f))]),
    );

  // ---- автоклави
  console.log('Автоклави…');
  const avt = load('avtoklavi');
  writeJson(path.join(ROOT, 'data/products/avtoklavi.json'), [await buildProduct('avtoklav', avt.avtoklav, 'avtoklavi')]);

  // ---- мониторинг
  console.log('Мониторинг и контрол…');
  const mon = load('monitoring');
  const monOut = [];
  for (const slug of MONITORING_ORDER) monOut.push(await buildProduct(slug, mon[slug], 'monitoring'));
  for (const slug of MONITORING_EXCLUDE) console.log(`  – пропуснат: ${mon[slug].name}`);
  writeJson(path.join(ROOT, 'data/products/monitoring.json'), monOut);

  // ---- котли и горелки
  console.log('Котли и горелки…');
  const kot = load('kotli-i-gorelki');
  const kotOut = [];
  for (const slug of BURNER_ORDER) kotOut.push(await buildProduct(slug, kot[slug], 'kotli-i-gorelki'));
  writeJson(path.join(ROOT, 'data/products/kotli-i-gorelki.json'), kotOut);

  // ---- дърво
  console.log('Дърво…');
  const wood = load('darvo');
  const woodOut = [];
  const bySku = (a, b) => String(a[1].sku).localeCompare(String(b[1].sku), 'bg', { numeric: true });
  for (const cat of WOOD_ORDER) {
    for (const [slug, d] of Object.entries(wood).filter(([, d]) => d.category === cat).sort(bySku)) {
      if (WOOD_EXCLUDE.has(slug)) {
        console.log(`  – пропуснат: ${d.name}`);
        continue;
      }
      const copy = woodCopy(slug, d);
      const extra = { summary: copy.summary, description: copy.description, features: [], notes: copy.notes, documents: copy.documents ?? [] };
      if (slug === 'bure-5l-sys-stoika-za-chashi')
        extra.images = [
          { file: pic('bure_5l.jpg'), alt: 'Дъбово буре 5 л върху стойка с гнезда за чаши' },
          ...d.images.slice(1).map((i) => ({ old: typeof i === 'string' ? i : i.src })),
        ];
      woodOut.push(await buildProduct(slug, d, WOOD_CAT_SLUG[cat] ?? cat, extra));
    }
  }
  // 5-литровото буре със стойка за чаши е с новата снимка — нека е първо
  woodOut.sort((a, b) => (b.slug === 'bure-5l-sys-stoika-za-chashi') - (a.slug === 'bure-5l-sys-stoika-za-chashi'));
  writeJson(path.join(ROOT, 'data/products/darvo.json'), woodOut);

  // ---- рецепти
  console.log('Рецепти…');
  const rec = readJson(path.join(OLD, 'src/data/recipes.json'));
  const recipes = [];
  for (const r of rec.recipes) {
    const images = [];
    for (const [n, i] of (r.images || []).entries()) {
      const saved = await saveImage(oldImg(i), 'recipes', `${r.id}-${n + 1}`, { max: 1000, thumb: 560 });
      images.push({ ...saved, alt: n === 0 ? r.name : `${r.name} — снимка ${n + 1}` });
    }
    recipes.push({
      slug: r.id,
      name: r.name,
      category: r.category,
      temperature: r.temperature,
      time: r.time,
      method: fix(r.method).replace(/\s*Важно! Моля погледнете забележката вдясно!/, "").trim(),
      note: fix(r.note),
      images,
    });
  }
  writeJson(path.join(ROOT, 'data/recipes.json'), {
    note: rec.note,
    categories: [
      { slug: 'meso', name: 'Месо' },
      { slug: 'riba', name: 'Риба' },
      { slug: 'plodove-i-zelenchutsi', name: 'Плодове и зеленчуци' },
      { slug: 'drugi', name: 'Други' },
    ],
    recipes,
  });

  // ---- работа с автоклава
  console.log('Работа с автоклава…');
  const guide = readJson(path.join(OLD, 'src/data/avtoklav-rakovodstvo.json'));
  let step = 0;
  for (const section of guide.sections) {
    for (const s of section.steps) {
      step++;
      for (const key of ['image', 'extraImage']) {
        if (!s[key]) continue;
        const base = path.basename(s[key].src).replace(/\.\w+$/, '');
        const saved = await saveImage(path.join(OLD_ASSETS, s[key].src), 'guide', base, { max: 1000, thumb: 0 });
        s[key] = { ...saved, alt: s[key].alt };
      }
    }
  }
  writeJson(path.join(ROOT, 'data/guide.json'), {
    pdf: 'docs/avtoklav-rakovodstvo.pdf',
    warning: guide.warning,
    videos: [
      { id: 'NZPiMVJGRBU', title: 'Процесите накратко' },
      { id: 'bhvWceyjCHw', title: 'Управление в режим „пара“' },
    ],
    sections: guide.sections,
  });
  console.log(`  ${step} стъпки`);

  // ---- въпроси за котлите и горелките
  const faq = readJson(path.join(OLD, 'src/data/kotli-vaprosi.json'));
  const sentence = (s) => {
    const t = fix(s).replace(/\s*\.\.\.\s*/g, '… ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/…\s*\)/g, '…)').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  writeJson(path.join(ROOT, 'data/faq.json'), {
    groups: faq.groups.map((g) => ({
      title: g.title,
      items: g.items.map((i) => ({
        q: sentence(i.q).replace(/\s*…\s*$/, '…').replace(/([^?….!])$/, '$1?'),
        a: sentence(i.a).replace(/цената на скарата 12 лв\s*…?/, 'скарата струва около 6 €').replace(/([^?….!)])$/, '$1.'),
      })),
    })),
  });

  // ---- миниатюри на видеата
  console.log('Видео миниатюри…');
  fs.mkdirSync(path.join(IMG, 'video'), { recursive: true });
  const ytDir = path.join(OLD_ASSETS, 'import/youtube');
  for (const f of fs.readdirSync(ytDir)) {
    await sharp(path.join(ytDir, f)).resize({ width: 640 }).webp({ quality: 74 }).toFile(path.join(IMG, 'video', f.replace(/\.\w+$/, '.webp')));
  }

  // ---- по-стари проекти за галерията
  console.log('Галерия (по-стари проекти)…');
  const oldGallery = ['img-5904', 'img-5912', 'p8210475', 'p8210503', 'p8210502', 'p9090006'];
  for (const g of oldGallery) await saveImage(path.join(OLD_ASSETS, 'import/tonkov/gallery', `${g}.jpg`), 'gallery', g, { max: 1200, thumb: 640 });

  // ---- лого
  fs.copyFileSync(path.join(OLD_ASSETS, 'brand/logo.png'), path.join(IMG, 'logo.png'));
  fs.copyFileSync(path.join(OLD_ASSETS, 'brand/logo-svetlo.png'), path.join(IMG, 'logo-white.png'));

  const count = (f) => readJson(path.join(ROOT, 'data/products', f)).length;
  console.log(
    `\nГотово: автоклави ${count('avtoklavi.json')}, мониторинг ${count('monitoring.json')}, котли и горелки ${count('kotli-i-gorelki.json')}, дърво ${count('darvo.json')}, рецепти ${recipes.length}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
