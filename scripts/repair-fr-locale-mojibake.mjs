import path from 'node:path';

import { readUtf8Json, writeUtf8Json } from './i18n-utf8.mjs';

const ROOT = process.cwd();
const FR_PATH = path.join(ROOT, 'locales', 'fr.json');
const SPLIT_FR_PATHS = [
  path.join(ROOT, 'app', 'src', 'locales', 'fr.json'),
  path.join(ROOT, 'admin', 'src', 'locales', 'fr.json'),
  path.join(ROOT, 'backend', 'src', 'locales', 'fr.json'),
];

const ACCENT_RE = /[àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]/g;
const FRENCH_HINT_RE = /\b(le|la|les|de|des|du|et|ou|pour|avec|sans|vous|votre|vos|mon|ma|mes|commande|panier|compte|livraison|adresse|email|mot|passe|inscription|connexion|déconnexion|retour|ajouter|modifier|supprimer|création|ingrédient|thé|mélange|français|belgique|france|gratuit|sécurisé|paiement)\b/gi;
const MOJIBAKE_RE = /[ÃÂâ]/g;
const CP1252_EXTENDED_MAP = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
  ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
  ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

const scoreFrenchQuality = (text) => {
  const accents = (text.match(ACCENT_RE) || []).length;
  const frenchHints = (text.match(FRENCH_HINT_RE) || []).length;
  const mojibake = (text.match(MOJIBAKE_RE) || []).length;
  return accents * 3 + frenchHints * 2 - mojibake * 4;
};

const toCp1252Buffer = (text) => {
  const bytes = [];

  for (const char of text) {
    const codePoint = char.codePointAt(0);

    if (typeof codePoint !== 'number') {
      return null;
    }

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = CP1252_EXTENDED_MAP.get(char);
    if (typeof mapped === 'number') {
      bytes.push(mapped);
      continue;
    }

    return null;
  }

  return Buffer.from(bytes);
};

const repairString = (value) => {
  const input = String(value ?? '');

  if (!/[ÃÂâ]/.test(input)) {
    return input;
  }

  let candidate = input;

  for (let idx = 0; idx < 2; idx += 1) {
    try {
      const cp1252Buffer = toCp1252Buffer(candidate);
      if (!cp1252Buffer) {
        break;
      }
      const decoded = cp1252Buffer.toString('utf8');
      if (scoreFrenchQuality(decoded) > scoreFrenchQuality(candidate)) {
        candidate = decoded;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return candidate;
};

const walk = (value, stats) => {
  if (typeof value === 'string') {
    const repaired = repairString(value);
    if (repaired !== value) {
      stats.fixed += 1;
    }
    return repaired;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => walk(entry, stats));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, walk(entry, stats)])
    );
  }

  return value;
};

const rootFr = readUtf8Json(FR_PATH);
const mergedSections = Object.assign(
  {},
  ...SPLIT_FR_PATHS.map((filePath) => {
    try {
      return readUtf8Json(filePath).sections || {};
    } catch {
      return {};
    }
  })
);

const fr = {
  ...rootFr,
  sections: Object.keys(mergedSections).length > 0 ? mergedSections : (rootFr.sections || {}),
};
const stats = { fixed: 0 };
const repaired = walk(fr, stats);

if (repaired?._meta) {
  repaired._meta.totalGroups = Object.keys(repaired.sections || {}).length;
  repaired._meta.totalStrings = Object.values(repaired.sections || {}).reduce((sum, section) => {
    const keys = Object.keys(section || {}).filter((key) => key !== '_source');
    return sum + keys.length;
  }, 0);
}

writeUtf8Json(FR_PATH, repaired);

console.log(`repaired ${stats.fixed} string(s) in ${path.relative(ROOT, FR_PATH)}`);
