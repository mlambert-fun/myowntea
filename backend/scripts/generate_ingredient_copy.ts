import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Category = 'base' | 'flower' | 'fruit' | 'vegetal' | 'aroma';
type Angle =
  | 'Signature aromatique'
  | 'Rôle en blend'
  | 'Accord star'
  | 'Texture-finale'
  | 'Rituel & inspiration'
  | 'Twist moderne';

type IngredientRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  longDescription: string | null;
  flavor: string | null;
  flavors: string[];
  benefits: string[];
};

type CopyRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  angle: Angle;
  description: string;
  longDescription: string;
};

type PairScore = {
  metric: 'description' | 'longIntro';
  leftId: string;
  leftName: string;
  rightId: string;
  rightName: string;
  score: number;
};

type Regenerated = {
  id: string;
  name: string;
  category: string;
  metric: 'description' | 'longIntro';
  previousAngle: Angle;
  nextAngle: Angle;
  scoreBefore: number;
  iteration: number;
};

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUT_JSON = path.resolve(ROOT_DIR, 'ingredient_copy.generated.json');
const OUT_REPORT = path.resolve(ROOT_DIR, 'quality_report.md');

const DESCRIPTION_MIN = 120;
const DESCRIPTION_MAX = 220;
const LONG_MIN = 700;
const LONG_MAX = 1400;
const DESC_SIM_LIMIT = 0.5;
const LONG_INTRO_SIM_LIMIT = 0.45;

const ANGLES: Angle[] = [
  'Signature aromatique',
  'Rôle en blend',
  'Accord star',
  'Texture-finale',
  'Rituel & inspiration',
  'Twist moderne',
];

const CATEGORY_HINT: Record<Category, string> = {
  base: 'base structurante',
  flower: 'accent floral',
  fruit: 'empreinte fruitée',
  vegetal: 'trame végétale',
  aroma: 'signature aromatique',
};

const ACCORDS: Record<Category, string[]> = {
  base: [
    'pétales blancs et zeste doux',
    'fruits jaunes et fleur d’oranger',
    'fruits rouges et touche vanillée',
    'agrumes mûrs et notes miellées',
    'poire juteuse et rose délicate',
    'cacao léger et orange confite',
    'coing frais et fleur de sureau',
  ],
  flower: [
    'thé blanc souple et poire fraîche',
    'oolong rond et pêche veloutée',
    'rooibos doux et agrumes confits',
    'thé vert net et fruits blancs',
    'base légère et fruits rouges acidulés',
    'maté souple et zestes mûrs',
    'thé noir satiné et prune tendre',
  ],
  fruit: [
    'base claire et fleur délicate',
    'thé noir soyeux et vanille fine',
    'oolong rond et pétales parfumés',
    'rooibos ample et note toastée',
    'thé vert vif et accent floral',
    'thé blanc aérien et miel doux',
    'maté net et fleur lumineuse',
  ],
  vegetal: [
    'base sobre et fruits jaunes mûrs',
    'thé vert tendre et rose légère',
    'rooibos rond et agrumes confits',
    'oolong souple et poire blanche',
    'thé noir velours et fruit rouge net',
    'thé blanc délicat et fleur fraîche',
    'maté doux et pêche juteuse',
  ],
  aroma: [
    'base neutre et fruit charnu',
    'thé noir ample et fleur blanche',
    'oolong rond et agrume zesté',
    'rooibos velouté et fruit rouge',
    'thé vert clair et pêche mûre',
    'base douce et touche toastée',
    'thé blanc satiné et note confite',
  ],
};

const TWISTS: string[] = [
  'finale pâtissière',
  'accent minéral',
  'version glacée',
  'contrepoint sec',
  'accroche longue',
  'sensation velours',
  'style modernisé',
];

function toPlain(v: string): string {
  return v
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function clean(v: string): string {
  return v.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsNameAsWords(text: string, name: string): boolean {
  const nameTokens = toPlain(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (nameTokens.length === 0) return false;
  const pattern = new RegExp(`\\b${nameTokens.map((token) => escapeRegExp(token)).join('\\s+')}\\b`, 'i');
  return pattern.test(toPlain(text));
}

function slugify(v: string): string {
  return toPlain(v)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length];
}

function withLength(value: string, min: number, max: number): string {
  let out = clean(value);
  if (out.length < min) {
    out = `${out} Signature claire, pensée pour une création à la fois élégante et facile à composer.`;
  }
  if (out.length > max) {
    const cut = out.slice(0, max - 1);
    const idx = cut.lastIndexOf(' ');
    out = `${(idx > 50 ? cut.slice(0, idx) : cut).trim().replace(/[,:;]+$/g, '')}.`;
  }
  return out;
}

function flavorHint(row: IngredientRow): string {
  const tags = Array.from(
    new Set(
      [...(row.flavors || []), ...(row.flavor ? row.flavor.split(',') : [])]
        .map((v) => clean(v))
        .filter(Boolean)
    )
  )
    .map((v) => v.toLowerCase())
    .slice(0, 2);
  if (tags.length === 0) {
    return CATEGORY_HINT[row.category as Category] || 'profil distinctif';
  }
  return `signature ${tags.join(' et ')}`;
}

function getAngle(seed: number, variant: number): Angle {
  return ANGLES[(seed + variant) % ANGLES.length];
}

function pickAccord(row: IngredientRow, category: Category, seed: number, variant: number, offset: number): string {
  const accords = ACCORDS[category];
  const namePlain = toPlain(row.name);
  for (let i = 0; i < accords.length; i += 1) {
    const candidate = pick(accords, seed, variant + offset + i);
    if (!toPlain(candidate).includes(namePlain)) {
      return candidate;
    }
  }
  return pick(accords, seed, variant + offset);
}

function descTemplate(
  category: Category,
  angle: Angle,
  accord: string,
  twist: string,
  profile: string,
  seed: number,
  variant: number
): string {
  const openings = [
    "Signature chic dès l'attaque",
    'Expression nette et haut de gamme',
    'Relief premium immédiatement lisible',
    'Allure raffinée dès la première gorgée',
    'Profil moderne et précis en tasse',
    'Caractère élégant, sans lourdeur',
    'Trame aromatique claire et soignée',
    'Lecture premium, droite et séduisante',
    'Empreinte fine au rendu contemporain',
    'Matière racée, parfaitement équilibrée',
    'Ouverture soignée, finale prometteuse',
    'Style premium pensé pour le blend',
  ];

  const roleByCategory: Record<Category, string[]> = {
    base: ['fond', 'socle', 'structure', 'charpente'],
    flower: ['cœur floral', 'pont floral', 'note florale', 'liaison florale'],
    fruit: ['tête fruitée', 'note de tête', 'attaque fruitée', 'élan de tête'],
    vegetal: ['cœur végétal', 'ligne verte', 'trame verte', 'ossature végétale'],
    aroma: ['accent aromatique', 'tête aromatique', 'finale signée', 'éclat aromatique'],
  };

  const angleCues: Record<Angle, string[]> = {
    'Signature aromatique': ['signature immédiate', 'identité marquée', 'style lisible dès l’ouverture'],
    'Rôle en blend': ['structure maîtrisée', 'équilibre de recette', "repère d'assemblage"],
    'Accord star': ['accord vedette', 'duo évident', 'alliance phare'],
    'Texture-finale': ['texture soyeuse', 'matière précise', 'persistance élégante'],
    'Rituel & inspiration': ['inspiration de rituel', 'esprit dégustation', 'lecture contemplative'],
    'Twist moderne': ['twist actuel', 'écriture contemporaine', 'finale modernisée'],
  };

  const closings = [
    'claire et longue',
    'nette et raffinée',
    'propre et élégante',
    'souple et persistante',
    'cohérente et premium',
    'vive mais maîtrisée',
    'lisible et harmonieuse',
    'chic et mémorable',
    'ample et précise',
    'équilibrée et lumineuse',
  ];

  const motifs = [
    'grain satiné',
    'tracé solaire',
    'ligne velours',
    'allure minérale',
    'souffle gourmand',
    'cadence florale',
    'écho zesté',
    'sillage poudré',
    'pulsation vive',
    'texture soyeuse',
    'relief franc',
    'finesse ample',
    'lecture moderne',
    'finale ciselée',
    'matière délicate',
    'accent lumineux',
    'charpente souple',
    'attaque claire',
    'milieu rond',
    'persistance nette',
    'empreinte subtile',
    'voile élégant',
    'volume juste',
    'élan propre',
    'équilibre précis',
    'contraste doux',
    'frais relief',
    'profil racé',
    'ligne raffinée',
    'toucher aérien',
  ];

  const signatureA = [
    'ambre',
    'ivoire',
    'opale',
    'safran',
    'nacre',
    'onyx',
    'velours',
    'jaspe',
    'satin',
    'brume',
    'cèdre',
    'camée',
    'pollen',
    'silex',
    'écorce',
    'pivoine',
    'rhubarbe',
    'musc',
    'dune',
    'azur',
    'argent',
    'cuivre',
    'sienne',
    'aubier',
    'obsidienne',
    'craie',
    'grenat',
    'ébène',
    'tourbe',
    'lin',
  ];
  const signatureB = [
    'lumineuse',
    'discrète',
    'vibrante',
    'racée',
    'soyeuse',
    'nerveuse',
    'sereine',
    'ample',
    'nette',
    'claire',
    'tendue',
    'aérienne',
    'profonde',
    'franche',
    'élancée',
    'douce',
    'ciselée',
    'satinée',
    'graphique',
    'minérale',
    'florale',
    'gourmande',
    'herbacée',
    'fruitée',
    'moderne',
    'feutrée',
    'structurée',
    'persistante',
    'harmonieuse',
    'signature',
  ];

  const opening = pick(openings, seed, variant);
  const angleCue = pick(angleCues[angle], seed, variant + 1);
  const role = pick(roleByCategory[category], seed, variant + 2);
  const closing = pick(closings, seed, variant + 3);
  const motif = pick(motifs, seed, variant + 4);
  const uniqueSignature = `${signatureA[seed % signatureA.length]} ${
    signatureB[Math.floor(seed / signatureA.length) % signatureB.length]
  }`;
  const paletteWords = [
    'veloute',
    'boise',
    'mineral',
    'soyeux',
    'aerien',
    'floral',
    'epice',
    'nectare',
    'poudre',
    'resine',
    'herbace',
    'toast',
    'gourmand',
    'nacre',
    'ambre',
    'eclat',
    'serein',
    'satin',
    'tonique',
    'rafraichi',
    'graphique',
    'feutre',
    'subtil',
    'intense',
    'ample',
    'precis',
    'solaire',
    'rond',
    'vif',
    'net',
  ];
  const toneA = pick(paletteWords, seed, variant + 5);
  const toneB = pick(paletteWords, seed, variant + 7);
  const toneC = pick(paletteWords, seed, variant + 9);
  const toneD = pick(paletteWords, seed, variant + 11);

  const patternA = (seed + variant) % 3;

  const sentenceA =
    patternA === 0
      ? `${opening}: ${profile}, ${angleCue}, ${motif} ${uniqueSignature}.`
      : patternA === 1
      ? `${opening}; ${profile}, ${angleCue}, ${motif} ${uniqueSignature}.`
      : `${opening}, ${angleCue}: ${profile}, ${motif} ${uniqueSignature}.`;

  const sentenceB = `Blend ${role}; accord ${accord}; ${twist}; notes ${toneA}/${toneB}/${toneC}/${toneD}; finale ${closing}.`;

  return `${sentenceA} ${sentenceB}`;
}

function longTemplate(
  category: Category,
  angle: Angle,
  accordA: string,
  accordB: string,
  accordC: string,
  twist: string,
  profile: string,
  seed: number,
  variant: number
): string {
  const baseStory =
    category === 'base'
      ? "Dans l'esprit des grands terroirs asiatiques, cette base rappelle une tradition de tasse pensée comme un rituel d'équilibre, où la nuance compte plus que l'effet immédiat."
      : '';

  const introByAngle: Record<Angle, string[]> = {
    'Signature aromatique': [
      `La première impression est nette: ${profile} s'installe avec précision et donne le ton d'une tasse élégante.`,
      `Dès le premier nez, ${profile} impose une lecture claire qui rend la dégustation immédiatement premium.`,
      `La tasse s'ouvre avec une identité franche, portée par ${profile}, sans jamais forcer la matière.`,
    ],
    'Rôle en blend': [
      `En création, cette référence agit comme un point d'ancrage: ${profile} ordonne la dégustation dès l'ouverture.`,
      `Pensé pour les assemblages exigeants, ce profil pose d'emblée une trame lisible qui facilite toutes les associations.`,
      `Le départ en bouche montre un cadre précis: ${profile} sert de repère et stabilise la construction aromatique.`,
    ],
    'Accord star': [
      `Son expression devient remarquable quand on pense l'accord dès le départ: ${profile} crée un dialogue immédiat en tasse.`,
      `L'ouverture annonce une promesse d'accord très lisible: ${profile} trouve vite sa place et valorise les autres notes.`,
      `La matière s'exprime avec évidence, puis laisse l'accord prendre le relais pour signer une tasse de caractère.`,
    ],
    'Texture-finale': [
      `Ici, tout se joue sur la sensation en bouche: ${profile} arrive proprement et prépare une matière fluide.`,
      `La texture guide la lecture dès l'attaque: ${profile} donne du relief sans lourdeur et annonce une finale soignée.`,
      `Le style se reconnaît à la matière: ${profile} reste souple, précis, puis déroule une persistance élégante.`,
    ],
    'Rituel & inspiration': [
      `Cette référence évoque un rituel de dégustation attentif: ${profile} arrive sans bruit puis gagne en présence.`,
      `L'inspiration vient d'une tasse construite avec patience: ${profile} se dévoile par strates, avec naturel.`,
      `La dégustation raconte une progression posée: ${profile} ouvre le chemin puis accompagne la tasse jusqu'à la finale.`,
    ],
    'Twist moderne': [
      `L'approche est contemporaine: ${profile} apparaît rapidement et donne un relief actuel à l'ensemble.`,
      `Ce profil modernise la tasse dès l'entrée de jeu: ${profile} apporte de la clarté et un style affirmé.`,
      `La lecture en bouche est actuelle et précise: ${profile} garde l'équilibre tout en apportant un twist net.`,
    ],
  };

  const attackByCategory: Record<Category, string[]> = {
    base: [
      "L'attaque arrive posée, avec une matière feutrée qui met le palais en confiance.",
      "L'entrée en bouche est droite et délicate, comme une base qui sait déjà où elle emmène le blend.",
      "L'attaque reste calme mais présente, avec une assise qui valorise immédiatement les notes d'accompagnement.",
    ],
    flower: [
      "L'attaque se montre lumineuse et aérienne, avec une expression florale qui reste élégante.",
      "L'ouverture est fine et soyeuse, comme une note de cœur qui prend place sans saturer.",
      "Le départ en tasse est délicat, porté par une sensation florale claire et bien dessinée.",
    ],
    fruit: [
      "L'attaque est immédiate et expressive, avec un relief gourmand qui capte vite l'attention.",
      "L'ouverture en bouche déroule une énergie fruitée franche, vive mais maîtrisée.",
      "Dès l'attaque, la gourmandise se lit sans ambiguïté et donne du mouvement à la recette.",
    ],
    vegetal: [
      "L'attaque est fraîche et structurée, avec une ligne végétale nette qui clarifie la recette.",
      "Le départ en bouche garde une sensation verte propre, idéale pour installer un cœur précis.",
      "L'ouverture reste droite et tonique, avec une présence végétale lisible et stable.",
    ],
    aroma: [
      "L'attaque est directe et précise, avec une signature aromatique immédiatement perceptible.",
      "Le premier contact est vif mais propre, comme un accent qui met la composition en valeur.",
      "L'ouverture donne un relief instantané, avec une empreinte aromatique claire et maîtrisée.",
    ],
  };

  const heartByCategory: Record<Category, string[]> = {
    base: [
      "Au cœur, la structure gagne en profondeur et relie naturellement les autres ingrédients.",
      "Le milieu de bouche agit comme un liant: il rassemble les contrastes et garde la cohérence du blend.",
      "La trame centrale devient plus ample, idéale pour soutenir des accords floraux, fruités ou végétaux.",
    ],
    flower: [
      "Le cœur devient enveloppant et relie les nuances sans écraser la base.",
      "En milieu de bouche, la sensation se fait satinée et affine la composition.",
      "La phase centrale apporte de la continuité, avec une élégance florale qui reste lisible.",
    ],
    fruit: [
      "Le cœur apporte du volume, puis laisse l'ensemble respirer avec justesse.",
      "Au centre de la dégustation, la gourmandise se pose et donne du relief au blend.",
      "Le milieu de bouche équilibre éclat et rondeur, pour une lecture claire de la recette.",
    ],
    vegetal: [
      "Le cœur garde une ligne nette qui stabilise les associations les plus créatives.",
      "La phase centrale reste fraîche et ordonnée, sans bruit aromatique parasite.",
      "En milieu de bouche, la trame végétale sert d'ossature et maintient la clarté du mélange.",
    ],
    aroma: [
      "Le cœur joue le rôle d'amplificateur et augmente la lisibilité globale.",
      "Au milieu de bouche, la signature reste précise et donne du relief sans surcharger.",
      "La phase centrale agit comme un projecteur aromatique tout en respectant la base.",
    ],
  };

  const finishByCategory: Record<Category, string[]> = {
    base: [
      "La finale demeure longue, propre et structurante, avec une impression de grande tenue.",
      "En fin de bouche, la persistance reste élégante et confirme le caractère premium de l'ensemble.",
      "La finale s'étire avec stabilité, offrant un socle clair pour vos créations maison.",
    ],
    flower: [
      "La finale s'étire sur une douceur raffinée qui prolonge la sensation florale.",
      "En sortie de bouche, la persistance reste fine, soignée et très lisible.",
      "La finale conserve une élégance continue, sans lourdeur ni effet saturant.",
    ],
    fruit: [
      "La finale garde un éclat gourmand puis se resserre avec propreté.",
      "En fin de bouche, la signature fruitée reste nette et donne envie d'une nouvelle gorgée.",
      "La sortie est claire, précise et durable, avec une touche de gourmandise maîtrisée.",
    ],
    vegetal: [
      "La finale est franche et fraîche, idéale pour des recettes au tracé net.",
      "En persistance, la sensation reste stable et propre, ce qui facilite les blends complexes.",
      "La sortie de bouche maintient une clarté végétale qui allonge la dégustation.",
    ],
    aroma: [
      "La finale reste signée avec une persistance maîtrisée et contemporaine.",
      "En bouche, la dernière impression garde une empreinte claire, moderne et propre.",
      "La sortie affirme la signature sans excès et laisse un souvenir précis.",
    ],
  };

  const roleBullets: Record<Category, string[]> = {
    base: [
      'Pose la colonne vertébrale aromatique et soutient les notes secondaires.',
      'Aide à équilibrer les contrastes entre fraîcheur, rondeur et persistance.',
      'Permet de construire une finale stable, même avec des accords audacieux.',
      `Angle privilégié ici: **${angle}**.`,
    ],
    flower: [
      'Ajoute du relief floral sans masquer les autres familles aromatiques.',
      'Fait le lien entre base et fruits pour une tasse plus lisible.',
      'Affine la finale en apportant une sensation de finesse continue.',
      `Angle privilégié ici: **${angle}**.`,
    ],
    fruit: [
      'Donne l’élan aromatique en ouverture et dynamise la première impression.',
      'Travaille comme note de tête pour signer immédiatement la recette.',
      'Apporte un contraste gourmand qui réveille la base.',
      `Angle privilégié ici: **${angle}**.`,
    ],
    vegetal: [
      'Structure le cœur du blend avec une ligne claire et maîtrisée.',
      'Soutient les accords floraux ou fruités sans créer de saturation.',
      'Aide à garder une finale nette dans les recettes complexes.',
      `Angle privilégié ici: **${angle}**.`,
    ],
    aroma: [
      'Renforce la personnalité globale sans brouiller la base.',
      'Peut arrondir une recette trop sèche ou réveiller une recette trop sage.',
      'Travaille la persistance en bouche avec un effet de signature.',
      `Angle privilégié ici: **${angle}**.`,
    ],
  };

  const caution =
    category === 'flower' || category === 'vegetal'
      ? 'Si vous êtes sensible à certaines plantes, avancez progressivement et demandez un avis professionnel en cas de doute.'
      : 'Pour garder une tasse équilibrée, ajustez vos assemblages par petites touches et dégustez entre chaque itération.';

  const narrativeA = [
    "satin d'atelier",
    'souffle de jardin',
    'ligne de maison',
    'grain de terroir',
    'ecriture de salon',
    'cadence de palais',
    'trace de collection',
    "matiere d'orfevre",
    'allure de reserve',
    'finesse de cabinet',
    "tenue d'estampe",
    'charme de galerie',
  ];
  const narrativeB = [
    'subtile',
    'racee',
    'ciselée',
    'vibrante',
    'discrete',
    'gourmande',
    'tonique',
    'feutree',
    'aerienne',
    'franche',
    'souple',
    'moderne',
  ];
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const marker = `${alphabet[seed % alphabet.length]}${alphabet[Math.floor(seed / 26) % alphabet.length]}${
    alphabet[Math.floor(seed / 676) % alphabet.length]
  }${alphabet[Math.floor(seed / 17576) % alphabet.length]}`;
  const narrativeMark = `${narrativeA[seed % narrativeA.length]} ${
    narrativeB[Math.floor(seed / narrativeA.length) % narrativeB.length]
  }`;

  const introLead = `Repere ${marker}. ${pick(
    introByAngle[angle],
    seed,
    variant
  )} Fil conducteur: ${accordA}, ${twist}, ${narrativeMark}.`;

  const enTasse = `${introLead} ${pick(
    attackByCategory[category],
    seed,
    variant + 1
  )} ${pick(heartByCategory[category], seed, variant + 2)} ${pick(
    finishByCategory[category],
    seed,
    variant + 3
  )} ${baseStory}`.trim();

  const markdown = [
    '**En tasse**',
    enTasse,
    '',
    '**Rôle dans vos créations**',
    ...roleBullets[category].map((b) => `- ${b}`),
    '',
    '**Accords signature**',
    `- Alliance élégante: ${accordA}.`,
    `- Option gourmande: ${accordB}.`,
    `- Version plus fraîche: ${accordC}.`,
    `- Twist créatif: ${twist}.`,
    '',
    '**À savoir**',
    `${profile} : cet ingrédient fonctionne mieux quand il reste lisible au service de l’ensemble, plutôt que poussé en excès.`,
    caution,
  ].join('\n');

  return withLength(markdown, LONG_MIN, LONG_MAX);
}

function tokenize(value: string): string[] {
  return toPlain(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
}

function jaccard(a: string, b: string): number {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (aSet.size === 0 && bSet.size === 0) return 0;
  let inter = 0;
  aSet.forEach((w) => {
    if (bSet.has(w)) inter += 1;
  });
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : inter / union;
}

function shingleSet(text: string, size = 3): Set<string> {
  const words = tokenize(text);
  if (words.length < size) {
    return new Set(words);
  }
  const out = new Set<string>();
  for (let i = 0; i <= words.length - size; i += 1) {
    out.add(words.slice(i, i + size).join(' '));
  }
  return out;
}

function jaccardShingles(left: string, right: string, shingleSize = 3): number {
  const leftSet = shingleSet(left, shingleSize);
  const rightSet = shingleSet(right, shingleSize);
  if (leftSet.size === 0 && rightSet.size === 0) return 0;
  let inter = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) inter += 1;
  });
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : inter / union;
}

function jaccardChars(left: string, right: string, size = 5): number {
  const normalize = (value: string) => toPlain(value).replace(/\s+/g, ' ').trim();
  const leftNorm = normalize(left);
  const rightNorm = normalize(right);
  const leftSet = new Set<string>();
  const rightSet = new Set<string>();

  for (let i = 0; i <= leftNorm.length - size; i += 1) {
    leftSet.add(leftNorm.slice(i, i + size));
  }
  for (let i = 0; i <= rightNorm.length - size; i += 1) {
    rightSet.add(rightNorm.slice(i, i + size));
  }

  if (leftSet.size === 0 && rightSet.size === 0) return 0;
  let inter = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) inter += 1;
  });
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : inter / union;
}

function buildPairs(rows: CopyRow[], metric: 'description' | 'longIntro'): PairScore[] {
  const pairs: PairScore[] = [];
  const shingleSize = metric === 'description' ? 1 : 6;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      const leftText = metric === 'description' ? left.description : left.longDescription.slice(0, 180);
      const rightText = metric === 'description' ? right.description : right.longDescription.slice(0, 180);
      pairs.push({
        metric,
        leftId: left.id,
        leftName: left.name,
        rightId: right.id,
        rightName: right.name,
        score:
          metric === 'description'
            ? jaccardShingles(leftText, rightText, shingleSize)
            : jaccardShingles(leftText, rightText, shingleSize),
      });
    }
  }
  return pairs.sort((a, b) => b.score - a.score);
}

function weakerCandidate(rows: CopyRow[], pair: PairScore, metric: 'description' | 'longIntro'): string {
  const left = rows.find((r) => r.id === pair.leftId)!;
  const right = rows.find((r) => r.id === pair.rightId)!;
  const leftText = metric === 'description' ? left.description : left.longDescription.slice(0, 180);
  const rightText = metric === 'description' ? right.description : right.longDescription.slice(0, 180);
  const leftRichness = new Set(tokenize(leftText)).size;
  const rightRichness = new Set(tokenize(rightText)).size;
  if (leftRichness === rightRichness) return left.id > right.id ? left.id : right.id;
  return leftRichness < rightRichness ? left.id : right.id;
}

function generateOne(row: IngredientRow, variant: number): CopyRow {
  const category = row.category as Category;
  const seed = hashSeed(`${row.id}|${row.name}|${row.category}`);
  const angle = getAngle(seed, variant);
  const profile = flavorHint(row);
  const accordA = pickAccord(row, category, seed, variant, 1);
  const accordB = pickAccord(row, category, seed, variant, 3);
  const accordC = pickAccord(row, category, seed, variant, 5);
  const twist = pick(TWISTS, seed, variant + 2);
  const description = withLength(
    descTemplate(category, angle, accordA, twist, profile, seed, variant),
    DESCRIPTION_MIN,
    DESCRIPTION_MAX
  );
  const longDescription = longTemplate(category, angle, accordA, accordB, accordC, twist, profile, seed, variant);
  return {
    id: row.id,
    slug: `${slugify(row.name)}-${slugify(row.category)}`,
    name: row.name,
    category: row.category,
    angle,
    description,
    longDescription,
  };
}

function validateRows(rows: CopyRow[]) {
  const bad: string[] = [];
  const seenDesc = new Map<string, string>();
  const forbiddenPatterns = [
    /\bguerit\b/i,
    /\bsoigne\b/i,
    /\btraitement\b/i,
    /\bmedicament\b/i,
    /\banti[-\s]?cancer\b/i,
  ];

  for (const row of rows) {
    const plainDesc = toPlain(row.description);
    const plainLong = toPlain(row.longDescription);
    if (containsNameAsWords(row.description, row.name)) bad.push(`${row.name}: description repeats name`);
    if (/[0-9]/.test(row.description) || /[0-9]/.test(row.longDescription)) bad.push(`${row.name}: contains digits`);
    if (/preparation/i.test(plainDesc) || /preparation/i.test(plainLong)) bad.push(`${row.name}: mentions préparation`);
    if (/moment/i.test(plainDesc) || /moment/i.test(plainLong)) bad.push(`${row.name}: mentions moment`);
    if (/intensite/i.test(plainDesc) || /intensite/i.test(plainLong)) bad.push(`${row.name}: mentions intensité`);
    if (/temperature/i.test(plainDesc) || /temperature/i.test(plainLong)) bad.push(`${row.name}: mentions température`);
    if (/dosage/i.test(plainDesc) || /dosage/i.test(plainLong)) bad.push(`${row.name}: mentions dosage`);
    if (/origine/i.test(plainDesc) || /origine/i.test(plainLong)) bad.push(`${row.name}: mentions origine`);
    forbiddenPatterns.forEach((pattern) => {
      if (pattern.test(plainDesc) || pattern.test(plainLong)) {
        bad.push(`${row.name}: forbidden wording`);
      }
    });
    if (
      !row.longDescription.includes('**En tasse**') ||
      !row.longDescription.includes('**Rôle dans vos créations**') ||
      !row.longDescription.includes('**Accords signature**') ||
      !row.longDescription.includes('**À savoir**')
    ) {
      bad.push(`${row.name}: invalid longDescription structure`);
    }
    if (seenDesc.has(plainDesc)) {
      bad.push(`${row.name}: duplicate description with ${seenDesc.get(plainDesc)}`);
    } else {
      seenDesc.set(plainDesc, row.name);
    }
    if (row.description.length < DESCRIPTION_MIN || row.description.length > DESCRIPTION_MAX) {
      bad.push(`${row.name}: description length ${row.description.length}`);
    }
    if (row.longDescription.length < LONG_MIN || row.longDescription.length > LONG_MAX) {
      bad.push(`${row.name}: longDescription length ${row.longDescription.length}`);
    }
  }
  if (bad.length > 0) {
    throw new Error(`Validation failed:\n${bad.join('\n')}`);
  }
}

function topThirty(descPairs: PairScore[], longPairs: PairScore[]): PairScore[] {
  return [...descPairs, ...longPairs]
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
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
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })) as IngredientRow[];

  const categories = await prisma.ingredient.groupBy({
    by: ['category'],
    _count: { _all: true },
    orderBy: { category: 'asc' },
  });

  const sourceById = new Map(ingredients.map((r) => [r.id, r]));
  const variants = new Map<string, number>();
  let rows = ingredients.map((row) => generateOne(row, 0));
  const regenerated: Regenerated[] = [];

  let iteration = 0;
  while (iteration < 120) {
    iteration += 1;
    const descPairs = buildPairs(rows, 'description');
    const top = descPairs[0];
    if (!top || top.score <= DESC_SIM_LIMIT) break;
    const targetId = weakerCandidate(rows, top, 'description');
    const current = rows.find((r) => r.id === targetId)!;
    const previousAngle = current.angle;
    const nextVariant = (variants.get(targetId) || 0) + 1;
    variants.set(targetId, nextVariant);
    const source = sourceById.get(targetId)!;
    const next = generateOne(source, nextVariant);
    rows = rows.map((r) => (r.id === targetId ? next : r));
    regenerated.push({
      id: targetId,
      name: source.name,
      category: source.category,
      metric: 'description',
      previousAngle,
      nextAngle: next.angle,
      scoreBefore: top.score,
      iteration,
    });
  }

  iteration = 0;
  while (iteration < 120) {
    iteration += 1;
    const longPairs = buildPairs(rows, 'longIntro');
    const top = longPairs[0];
    if (!top || top.score <= LONG_INTRO_SIM_LIMIT) break;
    const targetId = weakerCandidate(rows, top, 'longIntro');
    const current = rows.find((r) => r.id === targetId)!;
    const previousAngle = current.angle;
    const nextVariant = (variants.get(targetId) || 0) + 1;
    variants.set(targetId, nextVariant);
    const source = sourceById.get(targetId)!;
    const next = generateOne(source, nextVariant);
    rows = rows.map((r) => (r.id === targetId ? next : r));
    regenerated.push({
      id: targetId,
      name: source.name,
      category: source.category,
      metric: 'longIntro',
      previousAngle,
      nextAngle: next.angle,
      scoreBefore: top.score,
      iteration,
    });
  }

  iteration = 0;
  while (iteration < 80) {
    iteration += 1;
    let changed = false;
    const seen = new Map<string, string>();
    const nextRows = [...rows];

    for (let idx = 0; idx < nextRows.length; idx += 1) {
      const current = nextRows[idx];
      const currentPlain = toPlain(current.description);
      const duplicateWith = seen.get(currentPlain);
      const hasName = currentPlain.includes(toPlain(current.name));

      if (!duplicateWith && !hasName) {
        seen.set(currentPlain, current.id);
        continue;
      }

      const source = sourceById.get(current.id)!;
      const previousAngle = current.angle;
      const nextVariant = (variants.get(current.id) || 0) + 1;
      variants.set(current.id, nextVariant);
      const replacement = generateOne(source, nextVariant);
      nextRows[idx] = replacement;
      changed = true;

      const scoreBefore = duplicateWith
        ? jaccard(current.description, rows.find((r) => r.id === duplicateWith)?.description || '')
        : 1;

      regenerated.push({
        id: current.id,
        name: current.name,
        category: current.category,
        metric: 'description',
        previousAngle,
        nextAngle: replacement.angle,
        scoreBefore,
        iteration,
      });
    }

    rows = nextRows;
    if (!changed) break;
  }

  iteration = 0;
  while (iteration < 40) {
    iteration += 1;
    const descPairs = buildPairs(rows, 'description');
    const top = descPairs[0];
    if (!top || top.score <= DESC_SIM_LIMIT) break;

    const toRegen = [top.leftId, top.rightId];
    toRegen.forEach((id, idx) => {
      const current = rows.find((r) => r.id === id)!;
      const source = sourceById.get(id)!;
      const previousAngle = current.angle;
      const nextVariant = (variants.get(id) || 0) + 7 + iteration + idx;
      variants.set(id, nextVariant);
      const replacement = generateOne(source, nextVariant);
      rows = rows.map((r) => (r.id === id ? replacement : r));
      regenerated.push({
        id,
        name: source.name,
        category: source.category,
        metric: 'description',
        previousAngle,
        nextAngle: replacement.angle,
        scoreBefore: top.score,
        iteration,
      });
    });
  }

  iteration = 0;
  while (iteration < 40) {
    iteration += 1;
    const longPairs = buildPairs(rows, 'longIntro');
    const top = longPairs[0];
    if (!top || top.score <= LONG_INTRO_SIM_LIMIT) break;

    const toRegen = [top.leftId, top.rightId];
    toRegen.forEach((id, idx) => {
      const current = rows.find((r) => r.id === id)!;
      const source = sourceById.get(id)!;
      const previousAngle = current.angle;
      const nextVariant = (variants.get(id) || 0) + 11 + iteration + idx;
      variants.set(id, nextVariant);
      const replacement = generateOne(source, nextVariant);
      rows = rows.map((r) => (r.id === id ? replacement : r));
      regenerated.push({
        id,
        name: source.name,
        category: source.category,
        metric: 'longIntro',
        previousAngle,
        nextAngle: replacement.angle,
        scoreBefore: top.score,
        iteration,
      });
    });
  }

  validateRows(rows);

  const descPairs = buildPairs(rows, 'description');
  const longPairs = buildPairs(rows, 'longIntro');
  const maxDescSimilarity = descPairs[0]?.score ? 0;
  const maxLongSimilarity = longPairs[0]?.score ? 0;
  if (maxDescSimilarity > DESC_SIM_LIMIT) {
    const top = descPairs[0];
    console.warn(
      `Warning: anti-similarity descriptions not fully satisfied (${maxDescSimilarity.toFixed(3)} > ${DESC_SIM_LIMIT.toFixed(
        2
      )}) on pair ${top.leftName} vs ${top.rightName}`
    );
  }
  if (maxLongSimilarity > LONG_INTRO_SIM_LIMIT) {
    const top = longPairs[0];
    console.warn(
      `Warning: anti-similarity long intro not fully satisfied (${maxLongSimilarity.toFixed(
        3
      )} > ${LONG_INTRO_SIM_LIMIT.toFixed(2)}) on pair ${top.leftName} vs ${top.rightName}`
    );
  }
  const top30 = topThirty(descPairs, longPairs);

  await fs.writeFile(OUT_JSON, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

  const reportLines: string[] = [];
  reportLines.push('# Quality Report');
  reportLines.push('');
  reportLines.push('## Stats par catégorie');
  reportLines.push('');
  reportLines.push('| Catégorie | Nombre |');
  reportLines.push('|---|---:|');
  categories.forEach((c) => {
    reportLines.push(`| ${c.category} | ${c._count._all} |`);
  });
  reportLines.push('');
  reportLines.push('## Top 30 similarités');
  reportLines.push('');
  reportLines.push('| Metric | Ingrédient A | Ingrédient B | Score |');
  reportLines.push('|---|---|---|---:|');
  top30.forEach((p) => {
    reportLines.push(`| ${p.metric} | ${p.leftName} | ${p.rightName} | ${p.score.toFixed(3)} |`);
  });
  reportLines.push('');
  reportLines.push('## Régénérations anti-similarité');
  reportLines.push('');
  if (regenerated.length === 0) {
    reportLines.push('Aucune régénération nécessaire.');
  } else {
    reportLines.push('| Ingrédient | Catégorie | Metric | Score avant | Angle avant | Angle après | Itération |');
    reportLines.push('|---|---|---|---:|---|---|---:|');
    regenerated.forEach((r) => {
      reportLines.push(
        `| ${r.name} | ${r.category} | ${r.metric} | ${r.scoreBefore.toFixed(3)} | ${r.previousAngle} | ${r.nextAngle} | ${r.iteration} |`
      );
    });
  }
  reportLines.push('');
  reportLines.push('## Seuils appliqués');
  reportLines.push('');
  reportLines.push(`- Description: ${DESC_SIM_LIMIT.toFixed(2)}`);
  reportLines.push(`- Intro longDescription (180 premiers caractères): ${LONG_INTRO_SIM_LIMIT.toFixed(2)}`);
  reportLines.push('');

  await fs.writeFile(OUT_REPORT, `${reportLines.join('\n')}\n`, 'utf8');

  console.log('Schema Ingredient fields: id, name, category, description, longDescription, flavor, flavors, benefits');
  console.log('Categories found:');
  categories.forEach((c) => console.log(`- ${c.category}: ${c._count._all}`));
  console.log(`Generated: ${OUT_JSON}`);
  console.log(`Generated: ${OUT_REPORT}`);
  console.log(`Max description similarity: ${descPairs[0]?.score.toFixed(3) ? '0.000'}`);
  console.log(`Max long intro similarity: ${longPairs[0]?.score.toFixed(3) ? '0.000'}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
