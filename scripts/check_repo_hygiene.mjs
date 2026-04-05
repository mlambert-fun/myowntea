import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
function walk(directoryPath, bucket) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, bucket);
      continue;
    }

    if (entry.isFile()) {
      bucket.push(path.relative(projectRoot, fullPath).replace(/\\/g, '/'));
    }
  }
}

function listCandidateFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((filePath) => fs.existsSync(path.join(projectRoot, filePath)));
  } catch {
    const files = [];
    walk(projectRoot, files);
    return files;
  }
}

const trackedFiles = listCandidateFiles();

const forbiddenMatchers = [
  { pattern: /\.bak$/i, label: '*.bak backup file' },
  { pattern: /^backend\/tmp\//, label: 'backend/tmp generated artifact' },
];

const violations = trackedFiles
  .map((filePath) => {
    const match = forbiddenMatchers.find(({ pattern }) => pattern.test(filePath));
    return match ? `${filePath} (${match.label})` : null;
  })
  .filter(Boolean);

if (violations.length > 0) {
  console.error('Tracked legacy or generated artifacts must stay out of the repo:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Repo hygiene check passed.');
