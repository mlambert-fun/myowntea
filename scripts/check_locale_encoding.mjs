import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const filesToScan = [
  'locales/fr.json',
  'locales/en.json',
  'app/src/locales/fr.json',
  'app/src/locales/en.json',
  'admin/src/locales/fr.json',
  'admin/src/locales/en.json',
  'backend/src/locales/fr.json',
  'backend/src/locales/en.json',
  'backend/prisma/seed-catalog.mjs',
];

const suspiciousPatterns = [
  /Ã/g,
  /â€(?:[^\s]|$)/g,
  /â‚¬/g,
  /â€¦/g,
  /â‰/g,
  /â€‹/g,
  /ðŸ/g,
  /âœ/g,
  /â/g,
];

const violations = [];

for (const relativePath of filesToScan) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (suspiciousPatterns.some((pattern) => pattern.test(line))) {
      violations.push(`${relativePath}:${index + 1}`);
    }
  });
}

if (violations.length > 0) {
  console.error('Potential mojibake or malformed Unicode detected:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Locale/text encoding check passed.');
