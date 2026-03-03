import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Category = 'base' | 'flower' | 'fruit' | 'vegetal' | 'aroma';

type IngredientRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  longDescription: string | null;
  flavor: string | null;
  flavors: string[];
  benefits: string[];
  dayMoments: unknown;
  infusionTime: string | null;
  dosage: string | null;
  temperature: string | null;
  preparation: string | null;
  origin: string | null;
};

type GeneratedRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  longDescription: string;
};

const prisma = new PrismaClient();

const MIN_DESC = 90;
const MAX_DESC = 180;
const MIN_LONG = 700;
const MAX_LONG = 1600;

const FORBIDDEN = [
  /\bgu[ée]ri[t|s]?\b/i,
  /\bsoigne[rs]?\b/i,
  /\btraitement\b/i,
  /\bm[ée]dicament(s)?\b/i,
  /\banti[-\s]?cancer\b/i,
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_FILE = path.resolve(__dirname, '..', '..', 'ingredient_descriptions.generated.json');

const toPlain = (v: string) =>
  v
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const FEMININE_HEADWORDS = new Set([
  'amande',
  'baie',
  'banane',
  'bergamote',
  'camomille',
  'cannelle',
  'cardamome',
  'cerise',
  'citronnelle',
  'creme',
  'datte',
  'echinacee',
  'feuille',
  'fleur',
  'figue',
  'framboise',
  'graine',
  'grenade',
  'lavande',
  'mangue',
  'melisse',
  'menthe',
  'noisette',
  'myrtille',
  'noix',
  'ortie',
  'papaye',
  'passiflore',
  'peche',
  'poire',
  'racine',
  'reglisse',
  'rose',
  'sauge',
  'pistache',
  'valeriane',
  'vanille',
  'verveine',
  'violette',
]);

function withDefiniteArticle(name: string): string {
  const trimmed = clean(name);
  if (!trimmed) return '';

  const normalized = toPlain(trimmed);
  if (/^(le|la|les|l')\s/.test(normalized) || normalized.startsWith("l'")) {
    return trimmed;
  }

  const firstWord = normalized.split(/\s+/)[0] || '';
  if (/^(baies|feuilles|fleurs|graines|racines)\b/.test(firstWord)) {
    return `Les ${trimmed}`;
  }

  if (/^[aeiouyh]/.test(firstWord)) {
    return `L'${trimmed}`;
  }

  if (FEMININE_HEADWORDS.has(firstWord)) {
    return `La ${trimmed}`;
  }

  return `Le ${trimmed}`;
}

function getFlavorTags(row: IngredientRow): string[] {
  const fromArray = (row.flavors || []).map((v) => clean(v)).filter(Boolean);
  const fromLegacy = (row.flavor || '')
    .split(',')
    .map((v) => clean(v))
    .filter(Boolean);
  return Array.from(new Set([...fromArray, ...fromLegacy]));
}

function getTastePhrase(row: IngredientRow): string {
  const tags = getFlavorTags(row).slice(0, 3);
  if (tags.length === 0) {
    switch (row.category) {
      case 'base':
        return 'au profil équilibré';
      case 'flower':
        return 'aux notes florales nettes';
      case 'fruit':
        return 'à la trame fruitée et gourmande';
      case 'vegetal':
        return 'au caractère végétal franc';
      case 'aroma':
        return 'à l’expression aromatique précise';
      default:
        return 'au profil aromatique clair';
    }
  }
  if (tags.length === 1) return `aux notes ${tags[0].toLowerCase()}`;
  const last = tags[tags.length - 1].toLowerCase();
  const start = tags.slice(0, -1).map((v) => v.toLowerCase()).join(', ');
  return `aux notes ${start} et ${last}`;
}

function getMomentPhrase(row: IngredientRow): string {
  const moments = asArray(row.dayMoments).filter(Boolean);
  if (moments.length === 0) return 'selon votre rythme';
  if (moments.length === 1) return `plutôt en ${moments[0].toLowerCase()}`;
  if (moments.length === 2) return `${moments[0].toLowerCase()} et ${moments[1].toLowerCase()}`;
  return `${moments[0].toLowerCase()} puis ${moments[1].toLowerCase()}`;
}

function getCaffeinePhrase(row: IngredientRow): string {
  const name = toPlain(row.name);
  if (name.includes('rooibos')) return 'Sans théine, il se boit à tout moment.';
  if (name.includes('mate')) return 'Caféine soutenue, idéale quand on cherche de l’élan.';
  if (name.includes('the noir') || name.includes('pu erh') || name.includes('puerh')) {
    return 'Caféine plutôt soutenue, modulable via l’infusion.';
  }
  if (name.includes('the vert') || name.includes('oolong')) {
    return 'Caféine modérée, facile à ajuster avec l’infusion.';
  }
  if (name.includes('the blanc')) return 'Caféine douce et progressive.';
  return 'Énergie perçue liée au dosage et au temps d’infusion.';
}

function benefitsLine(row: IngredientRow): string {
  const benefits = (row.benefits || []).map((b) => clean(b)).filter(Boolean).slice(0, 3);
  if (benefits.length === 0) {
    return "Souvent apprécié pour enrichir une routine d'infusion variée, sans recherche d'effet spectaculaire.";
  }
  return `Souvent apprécié pour ${benefits.map((b) => b.toLowerCase()).join(', ')}.`;
}

function shortByCategory(row: IngredientRow): string {
  const taste = getTastePhrase(row);
  const ingredientWithArticle = withDefiniteArticle(row.name);
  switch (row.category as Category) {
    case 'base':
      return `${ingredientWithArticle} ${taste}, base fiable pour vos assemblages. ${getCaffeinePhrase(row)} À déguster ${getMomentPhrase(row)}.`;
    case 'flower':
      return `${ingredientWithArticle} ${taste}, pour une touche florale lisible et élégante. Il adoucit le mélange et affine la finale sans l’alourdir.`;
    case 'fruit':
      return `${ingredientWithArticle} ${taste}, entre gourmandise et relief acidulé. Très utile pour signer la tête aromatique d’un blend personnalisé.`;
    case 'vegetal':
      return `${ingredientWithArticle} ${taste}, apprécié pour structurer un mélange du quotidien. Traditionnellement utilisé en infusion, avec un rendu net et frais.`;
    case 'aroma':
      return `${ingredientWithArticle} ${taste}, en appui aromatique précis. Quelques touches suffisent pour renforcer ou arrondir un blend sans masquer sa base.`;
    default:
      return `${ingredientWithArticle} ${taste}, pensé pour équilibrer un assemblage et guider le profil final en tasse.`;
  }
}

function capTo(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const idx = cut.lastIndexOf(' ');
  return `${(idx > 40 ? cut.slice(0, idx) : cut).trim()}.`;
}

function fitShort(raw: string): string {
  let out = clean(raw);
  if (out.length < MIN_DESC) out = `${out} Idéal en création sur mesure.`;
  if (out.length < MIN_DESC) out = `${out} Profil clair en dégustation.`;
  if (out.length > MAX_DESC && out.includes(' À déguster ')) {
    out = out.replace(/\s+À déguster\s+[^.]+\./, '.');
  }
  out = capTo(out, MAX_DESC);
  return out;
}

function infusionBlock(row: IngredientRow): string {
  const dosage = row.dosage || '2 à 3 g par tasse (25 cl), à ajuster selon l’intensité recherchée';
  const temperature = row.temperature || '80 à 90°C pour préserver la netteté aromatique';
  const time = row.infusionTime || '2 à 4 minutes, puis ajustement selon votre goût';
  return `### Conseils d’infusion

- **Dosage** : ${dosage}
- **Température** : ${temperature}
- **Temps** : ${time}
- **Astuce** : commencez léger, puis augmentez par paliers pour garder un profil lisible.`;
}

function originLine(row: IngredientRow): string {
  if (row.origin && clean(row.origin)) {
    return `L’ingrédient est ici relié à l’origine **${clean(row.origin)}**, ce qui aide à situer son style sans figer une seule méthode d’usage.`;
  }
  return "L’origine précise n’est pas systématiquement détaillée ici : l’approche reste centrée sur le rendu en tasse et la cohérence en assemblage.";
}

function cautionLine(row: IngredientRow): string {
  if (row.category === 'flower' || row.category === 'vegetal') {
    return "En cas de grossesse, d’allaitement ou de suivi médical en cours, demandez l’avis d’un professionnel de santé avant une consommation régulière.";
  }
  return "Si vous avez une sensibilité particulière à certains végétaux, commencez par de petites quantités et ajustez progressivement.";
}

function longByCategory(row: IngredientRow): string {
  const taste = getTastePhrase(row);
  const blends = {
    base: 'fleurs délicates, fruits nets, et touches aromatiques dosées',
    flower: 'bases douces, fruits blancs, et notes végétales souples',
    fruit: 'bases rondes, fleurs légères, et accents végétaux frais',
    vegetal: 'bases sobres, fleurs discrètes, et fruits à acidité modérée',
    aroma: 'bases neutres, fruits mûrs et fleurs à faible intensité',
  } as Record<Category, string>;

  const intro =
    row.category === 'base'
      ? `${withDefiniteArticle(row.name)} sert de socle ${taste}. ${getCaffeinePhrase(row)}`
      : `${withDefiniteArticle(row.name)} propose un profil ${taste}, utile pour orienter clairement la personnalité d’un mélange.`;

  const usage =
    row.category === 'aroma'
      ? "Son rôle est d’ajouter une signature immédiate : il renforce la perception globale, arrondit les angles et facilite la régularité d’un lot à l’autre."
      : row.category === 'fruit'
      ? "Dans un blend, il agit souvent en note de tête : il apporte l’attaque aromatique, puis laisse la base prendre le relais en finale."
      : row.category === 'flower'
      ? "Dans un assemblage, il ajoute du relief floral et affine la finale. Il se marie bien avec les bases souples et les fruits peu agressifs."
      : row.category === 'vegetal'
      ? "Traditionnellement utilisé en infusion, il est souvent choisi pour son équilibre. Il peut contribuer à une routine de dégustation régulière sans lourdeur."
      : "En assemblage, il apporte de la structure et facilite l’équilibre entre intensité, netteté et persistance aromatique.";

  const benefit = benefitsLine(row);

  const sections = [
    '### Profil et usage',
    `${intro} ${usage}`,
    '### Repères d’origine',
    originLine(row),
    infusionBlock(row),
    '### Idées d’assemblage',
    `Associations recommandées : ${blends[row.category as Category] || 'profils complémentaires à faible intensité'}. Travaillez par petites touches, goûtez, puis ajustez pour conserver une lecture claire en bouche.`,
    '### Bien-être et précautions',
    `${benefit} ${cautionLine(row)}`,
  ];

  return sections.join('\n\n');
}

function ensureLongLength(text: string): string {
  let out = text.trim();
  if (out.length < MIN_LONG) {
    out +=
      '\n\n### Conseils pratiques\n\nPour une recette stable, pesez les ingrédients, notez vos essais et modifiez un seul paramètre à la fois. Cette méthode facilite les ajustements fins sans perdre votre profil de référence.';
  }
  if (out.length < MIN_LONG) {
    out +=
      "\n\nL’objectif est d’obtenir une tasse équilibrée et reproductible : attaque nette, cœur lisible, finale propre.";
  }
  if (out.length > MAX_LONG) {
    const cut = out.slice(0, MAX_LONG - 1);
    const idx = cut.lastIndexOf(' ');
    out = `${(idx > 200 ? cut.slice(0, idx) : cut).trim()}…`;
  }
  return out;
}

function assertSafe(row: GeneratedRow) {
  for (const re of FORBIDDEN) {
    if (re.test(row.description) || re.test(row.longDescription)) {
      throw new Error(`Forbidden wording detected for ${row.name}`);
    }
  }
}

function dedupeShort(rows: GeneratedRow[]): GeneratedRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = row.description;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    if (count === 0) return row;
    const desc = fitShort(`${row.description} Variante ${count + 1} orientée ${row.category}.`);
    return { ...row, description: desc };
  });
}

async function main() {
  const ingredients = (await prisma.ingredient.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      longDescription: true,
      flavor: true,
      flavors: true,
      benefits: true,
      dayMoments: true,
      infusionTime: true,
      dosage: true,
      temperature: true,
      preparation: true,
      origin: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })) as IngredientRow[];

  const generated = ingredients.map((row): GeneratedRow => {
    const description = fitShort(shortByCategory(row));
    const longDescription = ensureLongLength(longByCategory(row));
    const out: GeneratedRow = {
      id: row.id,
      name: row.name,
      category: row.category,
      description,
      longDescription,
    };
    assertSafe(out);
    return out;
  });

  const deduped = dedupeShort(generated);
  deduped.forEach(assertSafe);

  await fs.writeFile(OUT_FILE, `${JSON.stringify(deduped, null, 2)}\n`, 'utf8');

  const byCat = deduped.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1;
    return acc;
  }, {});

  console.log(`Generated file: ${OUT_FILE}`);
  console.log(`Total ingredients: ${deduped.length}`);
  Object.keys(byCat)
    .sort()
    .forEach((cat) => console.log(`- ${cat}: ${byCat[cat]}`));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
