import fs from 'node:fs';
import path from 'node:path';
import { readUtf8Json, writeUtf8Json } from './i18n-utf8.mjs';

const ROOT = process.cwd();
const MASTER_LOCALES_DIR = path.join(ROOT, 'locales');

const TARGETS = [
  { prefix: 'app.', outputDir: path.join(ROOT, 'app', 'src', 'locales') },
  { prefix: 'admin.', outputDir: path.join(ROOT, 'admin', 'src', 'locales') },
  { prefix: 'backend.', outputDir: path.join(ROOT, 'backend', 'src', 'locales') },
];

function filterSectionsByPrefix(sections, prefix) {
  const filtered = {};
  for (const [sectionKey, sectionValue] of Object.entries(sections || {})) {
    if (sectionKey.startsWith(prefix)) {
      filtered[sectionKey] = sectionValue;
    }
  }
  return filtered;
}

function run() {
  const localeFiles = fs.readdirSync(MASTER_LOCALES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  for (const localeFileName of localeFiles) {
    const masterPath = path.join(MASTER_LOCALES_DIR, localeFileName);
    const master = readUtf8Json(masterPath);
    const masterSections = master.sections || {};

    for (const target of TARGETS) {
      const sections = filterSectionsByPrefix(masterSections, target.prefix);
      const payload = {
        ...master,
        _meta: {
          ...(master._meta || {}),
          runtimeScope: target.prefix.replace(/\.$/, ''),
          totalGroups: Object.keys(sections).length,
          totalStrings: Object.values(sections).reduce((sum, section) => {
            const keys = Object.keys(section || {}).filter((key) => key !== '_source');
            return sum + keys.length;
          }, 0),
        },
        sections,
      };

      const output = path.join(target.outputDir, localeFileName);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      writeUtf8Json(output, payload);
      console.log(`wrote ${path.relative(ROOT, output)} (${Object.keys(sections).length} sections)`);
    }
  }
}

run();
