import fs from 'node:fs';
import path from 'node:path';
import ts from '../app/node_modules/typescript/lib/typescript.js';
import { readUtf8Json, readUtf8Text, writeUtf8Json } from './i18n-utf8.mjs';

const ROOT = process.cwd();
const LOCALES = ['fr.json', 'en.json'];
const TARGET_ROOTS = ['app/src', 'admin/src', 'backend/src'];
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.vite']);
const MANUAL_KEEP_KEYS = new Set([
  'app.lib.api_errors.email_password_required',
  'app.lib.api_errors.login_failed',
  'app.lib.api_errors.missing_required_fields',
  'app.lib.api_errors.password_too_short',
  'app.lib.api_errors.invalid_salutation',
  'app.lib.api_errors.invalid_birth_date',
  'app.lib.api_errors.invalid_phone_format',
  'app.lib.api_errors.registration_failed',
  'app.lib.api_errors.failed_process_forgot_password_request',
  'app.lib.api_errors.token_required',
  'app.lib.api_errors.failed_validate_reset_token',
  'app.lib.api_errors.token_new_password_required',
  'app.lib.api_errors.password_min_length',
  'app.lib.api_errors.invalid_or_expired_reset_token',
  'app.lib.api_errors.failed_reset_password',
  'app.lib.api_errors.current_password_required',
  'app.lib.api_errors.invalid_password',
  'app.lib.api_errors.password_update_not_available',
  'app.lib.api_errors.customer_not_found',
  'app.lib.api_errors.failed_update_email',
  'app.lib.api_errors.failed_update_password',
  'app.lib.api_errors.failed_fetch_profile',
  'app.components.subscriptions.blend_subscription_card.interval_one_month',
  'app.components.subscriptions.blend_subscription_card.interval_two_months',
  'app.components.subscriptions.blend_subscription_card.interval_three_months',
  'app.sections.account.account_subscriptions.status_active',
  'app.sections.account.account_subscriptions.status_trialing',
  'app.sections.account.account_subscriptions.status_canceled',
  'app.sections.account.account_subscriptions.status_past_due',
  'app.sections.account.account_subscriptions.status_incomplete',
  'app.sections.account.account_subscriptions.status_incomplete_expired',
  'app.sections.account.account_subscriptions.status_unpaid',
  'app.sections.account.account_subscriptions.invoice_status_paid',
  'app.sections.account.account_subscriptions.invoice_status_open',
  'app.sections.account.account_subscriptions.invoice_status_draft',
  'app.sections.account.account_subscriptions.invoice_status_void',
  'app.sections.account.account_subscriptions.invoice_status_uncollectible',
]);

function posixPath(value) {
  return value.replace(/\\/g, '/');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...walk(full));
      continue;
    }

    if (!CODE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    files.push(full);
  }

  return files;
}

function getScriptKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function isI18nImportSpecifier(specifier) {
  return (
    specifier === '@/lib/i18n' ||
    specifier.endsWith('/lib/i18n') ||
    specifier.endsWith('/lib/i18n.ts') ||
    specifier.endsWith('/lib/i18n.js') ||
    specifier === './lib/i18n' ||
    specifier === './lib/i18n.js'
  );
}

function collectImportedTIdentifiers(sourceFile) {
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const moduleSpecifier =
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : '';

    if (!isI18nImportSpecifier(moduleSpecifier)) {
      continue;
    }

    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      continue;
    }

    for (const element of clause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 't') {
        names.add(element.name.text);
      }
    }
  }

  return names;
}

function collectUsedTranslationKeys() {
  const usedKeys = new Set();
  const dynamicUsages = [];

  for (const rootRel of TARGET_ROOTS) {
    const root = path.join(ROOT, rootRel);
    if (!fs.existsSync(root)) {
      continue;
    }

    for (const file of walk(root)) {
      const rel = posixPath(path.relative(ROOT, file));
      if (rel.includes('/locales/')) {
        continue;
      }

      const sourceText = readUtf8Text(file);
      const sourceFile = ts.createSourceFile(
        rel,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        getScriptKind(file),
      );

      const importedTNames = collectImportedTIdentifiers(sourceFile);
      if (importedTNames.size === 0) {
        continue;
      }

      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          importedTNames.has(node.expression.text)
        ) {
          const [firstArg] = node.arguments;
          if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
            usedKeys.add(firstArg.text);
          } else if (firstArg) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(firstArg.getStart(sourceFile));
            dynamicUsages.push({
              file: rel,
              line: line + 1,
              col: character + 1,
              expression: firstArg.getText(sourceFile),
            });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }
  }

  return { usedKeys, dynamicUsages };
}

function loadFallbackLocaleValues(localeFileName) {
  const fallbackPaths = [
    path.join(ROOT, 'app', 'src', 'locales', localeFileName),
    path.join(ROOT, 'admin', 'src', 'locales', localeFileName),
    path.join(ROOT, 'backend', 'src', 'locales', localeFileName),
  ];

  const values = new Map();

  for (const fallbackPath of fallbackPaths) {
    if (!fs.existsSync(fallbackPath)) {
      continue;
    }

    const payload = readUtf8Json(fallbackPath);
    for (const [sectionKey, sectionValue] of Object.entries(payload.sections || {})) {
      for (const [valueKey, value] of Object.entries(sectionValue || {})) {
        if (valueKey === '_source' || typeof value !== 'string') {
          continue;
        }
        const fullKey = `${sectionKey}.${valueKey}`;
        if (!values.has(fullKey)) {
          values.set(fullKey, {
            value,
            source: typeof sectionValue?._source === 'string' ? sectionValue._source : null,
          });
        }
      }
    }
  }

  return values;
}

function pruneLocaleFile(localeFileName, usedKeys) {
  const localePath = path.join(ROOT, 'locales', localeFileName);
  const payload = readUtf8Json(localePath);
  const nextSections = {};
  const removedKeys = [];
  let removedSections = 0;
  const fallbackValues = loadFallbackLocaleValues(localeFileName);

  for (const [sectionKey, sectionValue] of Object.entries(payload.sections || {})) {
    const nextSection = {};
    let source = null;

    for (const [valueKey, value] of Object.entries(sectionValue || {})) {
      if (valueKey === '_source') {
        source = value;
        continue;
      }

      const fullKey = `${sectionKey}.${valueKey}`;
      if (usedKeys.has(fullKey) || MANUAL_KEEP_KEYS.has(fullKey)) {
        nextSection[valueKey] = value;
      } else {
        removedKeys.push(fullKey);
      }
    }

    if (Object.keys(nextSection).length > 0) {
      if (typeof source === 'string' && source) {
        nextSection._source = source;
      }
      nextSections[sectionKey] = nextSection;
    } else {
      removedSections += 1;
    }
  }

  for (const fullKey of MANUAL_KEEP_KEYS) {
    const separatorIndex = fullKey.lastIndexOf('.');
    if (separatorIndex < 0) {
      continue;
    }
    const sectionKey = fullKey.slice(0, separatorIndex);
    const valueKey = fullKey.slice(separatorIndex + 1);
    if (nextSections[sectionKey]?.[valueKey] !== undefined) {
      continue;
    }
    const fallback = fallbackValues.get(fullKey);
    if (!fallback) {
      continue;
    }
    nextSections[sectionKey] = {
      ...(nextSections[sectionKey] || {}),
      [valueKey]: fallback.value,
    };
    if (fallback.source && !nextSections[sectionKey]._source) {
      nextSections[sectionKey]._source = fallback.source;
    }
  }

  const nextPayload = {
    ...payload,
    _meta: {
      ...(payload._meta || {}),
      totalGroups: Object.keys(nextSections).length,
      totalStrings: Object.values(nextSections).reduce((sum, section) => {
        return sum + Object.keys(section || {}).filter((key) => key !== '_source').length;
      }, 0),
    },
    sections: nextSections,
  };

  writeUtf8Json(localePath, nextPayload);

  return {
    localePath,
    removedKeys,
    removedSections,
    remainingSections: Object.keys(nextSections).length,
  };
}

function run() {
  const { usedKeys, dynamicUsages } = collectUsedTranslationKeys();
  console.log(`used translation keys: ${usedKeys.size}`);

  if (dynamicUsages.length > 0) {
    console.warn(`dynamic t(...) usages detected: ${dynamicUsages.length}`);
    for (const item of dynamicUsages.slice(0, 20)) {
      console.warn(`- ${item.file}:${item.line}:${item.col} ${item.expression}`);
    }
    if (dynamicUsages.length > 20) {
      console.warn(`... ${dynamicUsages.length - 20} more`);
    }
  }

  for (const localeFileName of LOCALES) {
    const result = pruneLocaleFile(localeFileName, usedKeys);
    console.log(
      `${localeFileName}: removed ${result.removedKeys.length} keys, removed ${result.removedSections} sections, remaining ${result.remainingSections} sections`,
    );
  }
}

run();
