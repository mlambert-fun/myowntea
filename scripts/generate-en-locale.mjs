import fs from 'node:fs';
import path from 'node:path';
import { readUtf8Json, writeUtf8Json } from './i18n-utf8.mjs';

const ROOT = process.cwd();
const FR_PATH = path.join(ROOT, 'locales', 'fr.json');
const EN_PATH = path.join(ROOT, 'locales', 'en.json');
const CACHE_PATH = path.join(ROOT, 'scripts', '.translation_cache_fr_en.json');

const SOURCE_LANG = 'fr';
const TARGET_LANG = 'en';
const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const MAX_RETRIES = 4;
const REQUEST_DELAY_MS = 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTechnicalString = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  if (normalized.length <= 1) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(normalized)) return true;
  if (/^\/[a-z0-9/_-]*$/i.test(normalized)) return true;
  if (/^[A-Z0-9_:-]{2,}$/.test(normalized)) return true;
  if (/^[\d\s.,:;!?%€$£()+\-/*=°~|\\[\]{}'"`]+$/.test(normalized)) return true;
  return false;
};

const normalizeOutput = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+([:;!?])/g, '$1')
    .replace(/([({[])\s+/g, '$1')
    .replace(/\s+([)}\]])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

const loadCache = () => {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return readUtf8Json(CACHE_PATH) || {};
  } catch {
    return {};
  }
};

const saveCache = (cache) => {
  writeUtf8Json(CACHE_PATH, cache);
};

const parseTranslation = (payload) => {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return '';
  return payload[0]
    .map((part) => (Array.isArray(part) ? String(part[0] || '') : ''))
    .join('');
};

const translateText = async (text) => {
  const query = new URLSearchParams({
    client: 'gtx',
    sl: SOURCE_LANG,
    tl: TARGET_LANG,
    dt: 't',
    q: text,
  });
  const url = `${TRANSLATE_URL}?${query.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText} ${body}`.trim());
  }

  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid translation payload: ${String(error)}`);
  }
  return normalizeOutput(parseTranslation(parsed));
};

const translateWithRetry = async (text) => {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      if (attempt > 0) {
        await sleep(150 * (attempt + 1));
      }
      return await translateText(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Unknown translation error');
};

const collectEntries = (sections) => {
  const entries = [];
  for (const [sectionKey, sectionValue] of Object.entries(sections || {})) {
    for (const [valueKey, value] of Object.entries(sectionValue || {})) {
      if (valueKey === '_source' || typeof value !== 'string') continue;
      entries.push({ sectionKey, valueKey, value });
    }
  }
  return entries;
};

async function run() {
  const frPayload = readUtf8Json(FR_PATH);
  const frSections = frPayload.sections || {};
  const entries = collectEntries(frSections);

  const cache = loadCache();
  const toTranslate = Array.from(new Set(
    entries
      .map((entry) => entry.value)
      .filter((value) => !isTechnicalString(value))
      .filter((value) => typeof cache[value] !== 'string'),
  ));

  console.log(`fr strings: ${entries.length}`);
  console.log(`unique to translate: ${toTranslate.length}`);

  for (let i = 0; i < toTranslate.length; i += 1) {
    const source = toTranslate[i];
    try {
      const translated = await translateWithRetry(source);
      cache[source] = translated || source;
    } catch (error) {
      console.error(`translation failed (${i + 1}/${toTranslate.length}): ${source}`);
      console.error(error instanceof Error ? error.message : String(error));
      cache[source] = source;
    }
    if ((i + 1) % 25 === 0 || i === toTranslate.length - 1) {
      console.log(`translated ${i + 1}/${toTranslate.length}`);
      saveCache(cache);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const enSections = {};
  for (const [sectionKey, sectionValue] of Object.entries(frSections)) {
    const nextSection = {};
    for (const [valueKey, value] of Object.entries(sectionValue || {})) {
      if (valueKey === '_source' || typeof value !== 'string') {
        nextSection[valueKey] = value;
        continue;
      }
      if (isTechnicalString(value)) {
        nextSection[valueKey] = value;
        continue;
      }
      nextSection[valueKey] = normalizeOutput(cache[value] || value);
    }
    enSections[sectionKey] = nextSection;
  }

  const payload = {
    ...frPayload,
    _meta: {
      ...(frPayload._meta || {}),
      language: TARGET_LANG,
      generatedAt: new Date().toISOString(),
      sourceLocale: SOURCE_LANG,
      note: 'Generated from locales/fr.json with machine translation (Google Translate endpoint).',
    },
    sections: enSections,
  };

  writeUtf8Json(EN_PATH, payload);
  saveCache(cache);
  console.log(`wrote ${path.relative(ROOT, EN_PATH)} (${Object.keys(enSections).length} sections)`);
}

run();
