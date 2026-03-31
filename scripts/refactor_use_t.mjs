import fs from 'node:fs';
import path from 'node:path';
import ts from '../app/node_modules/typescript/lib/typescript.js';
import { readUtf8Json, readUtf8Text, writeUtf8Text } from './i18n-utf8.mjs';

const ROOT = process.cwd();
const LOCALE_FILE = path.join(ROOT, 'locales', 'fr.json');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

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

function shouldSkipStringNode(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (ts.isEnumMember(parent) && parent.name === node) return true;
  if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 't') return true;
  return false;
}

function posixPath(value) {
  return value.replace(/\\/g, '/');
}

function makeRelativeImport(fromFile, toFile) {
  const fromDir = path.posix.dirname(fromFile);
  let relative = path.posix.relative(fromDir, toFile);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function getImportSpecifier(filePath) {
  const rel = posixPath(filePath);
  if (rel.startsWith('app/src/')) return '@/lib/i18n';
  if (rel.startsWith('admin/src/')) {
    return makeRelativeImport(rel, 'admin/src/lib/i18n');
  }
  if (rel.startsWith('backend/src/')) {
    return makeRelativeImport(rel, 'backend/src/lib/i18n.js');
  }
  return null;
}

function ensureTImport(sourceFile, importSpecifier) {
  if (!importSpecifier) return sourceFile;

  const statements = [...sourceFile.statements];
  let hasTImport = false;
  let updated = false;

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : '';
    const isI18nImport = specifier === importSpecifier
      || specifier.endsWith('/lib/i18n')
      || specifier.endsWith('/lib/i18n.js')
      || specifier === '@/lib/i18n';
    if (!isI18nImport) continue;

    const clause = statement.importClause;
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      continue;
    }

    const hasT = clause.namedBindings.elements.some((element) => {
      const importedName = element.propertyName?.text ?? element.name.text;
      return importedName === 't';
    });

    if (hasT) {
      hasTImport = true;
      break;
    }

    const nextElements = [
      ...clause.namedBindings.elements,
      ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('t')),
    ];
    const nextNamedImports = ts.factory.updateNamedImports(clause.namedBindings, nextElements);
    const nextClause = ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, nextNamedImports);
    statements[i] = ts.factory.updateImportDeclaration(
      statement,
      statement.modifiers,
      nextClause,
      statement.moduleSpecifier,
      statement.attributes,
    );
    hasTImport = true;
    updated = true;
    break;
  }

  if (!hasTImport) {
    const importDecl = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('t')),
        ]),
      ),
      ts.factory.createStringLiteral(importSpecifier),
      undefined,
    );

    let insertIndex = 0;
    while (insertIndex < statements.length && ts.isImportDeclaration(statements[insertIndex])) {
      insertIndex += 1;
    }
    statements.splice(insertIndex, 0, importDecl);
    updated = true;
  }

  if (!updated) return sourceFile;
  return ts.factory.updateSourceFile(sourceFile, statements);
}

function loadLocaleEntries() {
  const payload = readUtf8Json(LOCALE_FILE);
  const byFile = new Map();

  for (const [sectionKey, sectionData] of Object.entries(payload.sections || {})) {
    const source = sectionData?._source;
    if (!source || typeof source !== 'string') continue;

    const rel = posixPath(source);
    if (!CODE_EXTS.has(path.extname(rel).toLowerCase())) continue;

    let fileEntry = byFile.get(rel);
    if (!fileEntry) {
      fileEntry = {
        exact: new Map(),
        normalized: new Map(),
      };
      byFile.set(rel, fileEntry);
    }

    for (const [valueKey, value] of Object.entries(sectionData)) {
      if (valueKey === '_source') continue;
      if (typeof value !== 'string') continue;
      const fullKey = `${sectionKey}.${valueKey}`;

      if (!fileEntry.exact.has(value)) {
        fileEntry.exact.set(value, fullKey);
      }

      const normalized = normalizeCandidate(value);
      if (normalized && !fileEntry.normalized.has(normalized)) {
        fileEntry.normalized.set(normalized, fullKey);
      }
    }
  }

  return byFile;
}

function createTCall(key) {
  return ts.factory.createCallExpression(
    ts.factory.createIdentifier('t'),
    undefined,
    [ts.factory.createStringLiteral(key)],
  );
}

function run() {
  const byFile = loadLocaleEntries();
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });

  let changedFiles = 0;
  let replacedNodes = 0;

  for (const [relFile, dictionary] of byFile.entries()) {
    const absFile = path.join(ROOT, relFile);
    if (!fs.existsSync(absFile)) continue;

    const sourceCode = readUtf8Text(absFile);
    const sourceFile = ts.createSourceFile(
      relFile,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(absFile),
    );

    let fileReplacements = 0;

    const transformer = (context) => {
      const visit = (node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          if (!shouldSkipStringNode(node)) {
            const exactKey = dictionary.exact.get(node.text);
            const normalizedKey = exactKey ? null : dictionary.normalized.get(normalizeCandidate(node.text));
            const key = exactKey || normalizedKey;
            if (key) {
              fileReplacements += 1;
              return createTCall(key);
            }
          }
        }

        if (ts.isJsxText(node)) {
          const normalized = normalizeCandidate(node.getText(sourceFile));
          if (normalized) {
            const key = dictionary.normalized.get(normalized) || dictionary.exact.get(normalized);
            if (key) {
              fileReplacements += 1;
              return ts.factory.createJsxExpression(undefined, createTCall(key));
            }
          }
        }

        return ts.visitEachChild(node, visit, context);
      };

      return (rootNode) => ts.visitNode(rootNode, visit);
    };

    const transformed = ts.transform(sourceFile, [transformer]);
    let nextSourceFile = transformed.transformed[0];
    transformed.dispose();

    if (fileReplacements === 0) {
      continue;
    }

    const importSpecifier = getImportSpecifier(relFile);
    nextSourceFile = ensureTImport(nextSourceFile, importSpecifier);

    const nextCode = printer.printFile(nextSourceFile);
    if (nextCode !== sourceCode) {
      writeUtf8Text(absFile, `${nextCode}\n`);
      changedFiles += 1;
      replacedNodes += fileReplacements;
      // eslint-disable-next-line no-console
      console.log(`updated ${relFile} (${fileReplacements} replacements)`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`done: ${changedFiles} files, ${replacedNodes} replacements`);
}

run();
