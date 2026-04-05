import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const target = process.argv[2] || 'backend';
const allowlistPath = path.join(projectRoot, 'scripts', 'ts_nocheck_allowlist.json');
const allowlistPayload = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
const allowedFiles = new Set(
  (Array.isArray(allowlistPayload[target]) ? allowlistPayload[target] : [])
    .map((filePath) => String(filePath).replace(/\\/g, '/'))
);

if (allowedFiles.size === 0) {
  console.error(`No @ts-nocheck allowlist found for target "${target}".`);
  process.exit(1);
}

const targetRoot = path.join(projectRoot, target, 'src');
const discoveredFiles = [];

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

    if (!entry.isFile() || !fullPath.endsWith('.ts')) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    if (/^\/\/ @ts-nocheck/m.test(content)) {
      discoveredFiles.push(path.relative(projectRoot, fullPath).replace(/\\/g, '/'));
    }
  }
}

walk(targetRoot);
discoveredFiles.sort();

const unexpectedFiles = discoveredFiles.filter((filePath) => !allowedFiles.has(filePath));
const staleAllowlistEntries = Array.from(allowedFiles).filter(
  (filePath) => !discoveredFiles.includes(filePath)
);

if (unexpectedFiles.length > 0 || staleAllowlistEntries.length > 0) {
  console.error(`@ts-nocheck allowlist drift detected for "${target}".`);
  if (unexpectedFiles.length > 0) {
    console.error('Unexpected files:');
    for (const filePath of unexpectedFiles) {
      console.error(`- ${filePath}`);
    }
  }
  if (staleAllowlistEntries.length > 0) {
    console.error('Stale allowlist entries:');
    for (const filePath of staleAllowlistEntries) {
      console.error(`- ${filePath}`);
    }
  }
  process.exit(1);
}

console.log(`@ts-nocheck allowlist check passed for ${target}.`);
