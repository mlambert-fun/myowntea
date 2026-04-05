import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const adminSrcRoot = path.join(projectRoot, 'admin', 'src');
const violations = [];

const bannedPatterns = [
  { pattern: /Authorization:\s*`Bearer\s*\$\{/g, label: 'Bearer authorization header' },
  { pattern: /Authorization:\s*['"]Bearer /g, label: 'Bearer authorization header' },
  { pattern: /\badminToken\b/g, label: 'legacy admin token usage' },
  { pattern: /\blocalStorage\b/g, label: 'localStorage usage in admin app' },
];

function walk(directoryPath) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }

    const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
    const content = fs.readFileSync(fullPath, 'utf8');

    for (const { pattern, label } of bannedPatterns) {
      const matcher = new RegExp(pattern);
      if (matcher.test(content)) {
        violations.push(`${relativePath} (${label})`);
      }
    }

    if (/from ['"][.]{1,2}\/utils\/api['"]/.test(content)) {
      violations.push(`${relativePath} (legacy admin utils/api import)`);
    }
  }
}

walk(adminSrcRoot);

const legacyApiPath = path.join(projectRoot, 'admin', 'src', 'utils', 'api.ts');
if (fs.existsSync(legacyApiPath)) {
  violations.push('admin/src/utils/api.ts (legacy admin API helper still present)');
}

if (violations.length > 0) {
  console.error('Admin session-auth guard failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Admin session-auth guard passed.');
