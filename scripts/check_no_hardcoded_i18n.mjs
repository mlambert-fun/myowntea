import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '../app/node_modules/typescript/lib/typescript.js';
import { readUtf8Json, readUtf8Text, writeUtf8Text } from './i18n-utf8.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const LOCALE_FILE = path.join(ROOT, 'locales', 'fr.json');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'i18n_hardcoded_baseline.json');
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.vite']);

const TARGETS = {
  app: ['app/src'],
  admin: ['admin/src'],
  backend: ['backend/src'],
};

const args = process.argv.slice(2).map((arg) => arg.trim());
const shouldUpdateBaseline = args.includes('--update-baseline');
const argvTargets = args
  .filter((arg) => arg && !arg.startsWith('--'))
  .map((arg) => arg.toLowerCase());
const selectedTargets = argvTargets.length ? argvTargets : ['app', 'admin', 'backend'];

const ACCENT_RE = /[àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]/;
const FRENCH_WORD_RE = /\b(commande|panier|compte|livraison|adresse|réduction|création|ingrédient|retour|paiement|mot de passe|inscription|connexion|déconnexion|préférences|suivi|édition|sauvegarde|supprimer|modifier|ajouter|échec|impossible)\b/i;
const UI_ATTR_NAMES = new Set(['title', 'placeholder', 'aria-label', 'aria-description', 'alt', 'label']);

const ALLOWED_TECHNICAL_PATTERNS = [
  /^\w+([.-]\w+)*$/, // keys/tokens
  /^https?:\/\//i,
  /^mailto:/i,
  /^tel:/i,
  /^\/[a-z0-9/_-]+$/i, // routes
  /^[A-Z0-9_:-]+$/,
  /^ORD-[A-Z0-9-]+$/i,
  /^\d+$/,
];

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeCandidate(value) {
  return normalizeWhitespace(value);
}

function getScriptKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...walk(full));
      continue;
    }
    if (!CODE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(full);
  }
  return files;
}

function loadLocaleValues() {
  const payload = readUtf8Json(LOCALE_FILE);
  const values = new Set();
  for (const section of Object.values(payload.sections || {})) {
    for (const [key, value] of Object.entries(section)) {
      if (key === '_source' || typeof value !== 'string') continue;
      values.add(normalizeCandidate(value));
    }
  }
  return values;
}

function isInsideTCall(node) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  const expression = parent.expression;
  if (!ts.isIdentifier(expression)) return false;
  if (expression.text !== 't') return false;
  return parent.arguments.includes(node);
}

function shouldSkipStringNode(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  if (ts.isExternalModuleReference(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isShorthandPropertyAssignment(p)) return true;
  if (ts.isEnumMember(p) && p.name === node) return true;
  if (isInsideTCall(node)) return true;
  return false;
}

function isFieldKeyContext(node) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;

  const callee = parent.expression;
  const callName = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;

  if (!callName) return false;

  return ['register', 'watch', 'setValue', 'getValues', 'clearErrors', 'trigger'].includes(callName);
}

function looksFrenchUserText(text) {
  if (!text || text.length < 2) return false;
  if (ACCENT_RE.test(text)) return true;
  if (FRENCH_WORD_RE.test(text)) return true;
  return false;
}

function isAllowedTechnicalText(text) {
  const normalized = normalizeCandidate(text);
  if (!normalized) return true;
  if (normalized.length <= 1) return true;
  if (/^[-–—/:|()[\]{}*+.,!?'"`~%$#@\\]+$/.test(normalized)) return true;
  return ALLOWED_TECHNICAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isUiAttributeString(node) {
  const parent = node.parent;
  return Boolean(
    parent
    && ts.isJsxAttribute(parent)
    && parent.initializer === node
    && ts.isIdentifier(parent.name)
    && UI_ATTR_NAMES.has(parent.name.text),
  );
}

function createViolation(filePath, sourceFile, node, text, reason) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    line: line + 1,
    col: character + 1,
    text: normalizeCandidate(text),
    reason,
  };
}

function run() {
  const localeValues = loadLocaleValues();
  const baselineEntries = fs.existsSync(BASELINE_FILE)
    ? new Set(readUtf8Json(BASELINE_FILE))
    : new Set();
  const violations = [];
  const files = [];

  for (const target of selectedTargets) {
    const roots = TARGETS[target];
    if (!roots) {
      console.error(`Unknown target "${target}". Allowed: app, admin, backend`);
      process.exitCode = 2;
      return;
    }
    for (const rootRel of roots) {
      const abs = path.join(ROOT, rootRel);
      if (!fs.existsSync(abs)) continue;
      files.push(...walk(abs));
    }
  }

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (rel.includes('/locales/')) continue;

    const source = readUtf8Text(file);
    const sourceFile = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, getScriptKind(file));

    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (!shouldSkipStringNode(node)) {
          const text = normalizeCandidate(node.text);
          if (text && !isAllowedTechnicalText(text)) {
          const inLocale = localeValues.has(text);
          const frenchLike = looksFrenchUserText(text);
          const uiAttr = isUiAttributeString(node);
          const fieldKey = isFieldKeyContext(node);
          const htmlLike = /<!doctype html>|<html|<head>|<body>|<\/\w+>/i.test(text);
          if (htmlLike) {
            return;
          }

          if ((uiAttr && (inLocale || frenchLike)) || (!fieldKey && frenchLike && text.length >= 4)) {
            violations.push(createViolation(file, sourceFile, node, text, inLocale ? 'use_t_key' : 'french_hardcoded'));
            }
          }
        }
      } else if (ts.isJsxText(node)) {
        const text = normalizeCandidate(node.getText(sourceFile));
        if (text && !isAllowedTechnicalText(text)) {
          const inLocale = localeValues.has(text);
          const frenchLike = looksFrenchUserText(text);
          if (inLocale || frenchLike) {
            violations.push(createViolation(file, sourceFile, node, text, inLocale ? 'use_t_key' : 'french_hardcoded_jsx'));
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (violations.length === 0) {
    console.log(`i18n check OK (${files.length} files scanned).`);
    return;
  }

  const signature = (item) => `${item.file}|${item.reason}|${item.text}`;
  const allSignatures = [...new Set(violations.map(signature))].sort((a, b) => a.localeCompare(b));

  if (shouldUpdateBaseline) {
    writeUtf8Text(BASELINE_FILE, `${JSON.stringify(allSignatures, null, 2)}\n`);
    console.log(`i18n baseline updated (${allSignatures.length} entries): ${path.relative(ROOT, BASELINE_FILE)}`);
    return;
  }

  const newViolations = violations.filter((item) => !baselineEntries.has(signature(item)));
  if (newViolations.length === 0) {
    console.log(`i18n check OK with baseline (${files.length} files scanned, ${violations.length} known exceptions).`);
    return;
  }

  console.error(`i18n check failed: ${newViolations.length} new hardcoded text candidate(s).`);
  for (const item of newViolations.slice(0, 200)) {
    console.error(`- ${item.file}:${item.line}:${item.col} [${item.reason}] ${item.text}`);
  }
  if (newViolations.length > 200) {
    console.error(`... ${newViolations.length - 200} more`);
  }
  if (!baselineEntries.size) {
    console.error(`Tip: initialize baseline with "node scripts/check_no_hardcoded_i18n.mjs --update-baseline"`);
  }
  process.exitCode = 1;
}

run();
