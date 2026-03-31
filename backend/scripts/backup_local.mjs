import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

function hasCommand(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function maskDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return `${url.protocol}//${url.username ? `${url.username}:${url.password}@` : ''}${url.host}${url.pathname}`;
  } catch {
    return '<invalid DATABASE_URL>';
  }
}

function getDatabaseUrl() {
  const databaseUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Missing database URL. Set LOCAL_DATABASE_URL or DATABASE_URL in backend/.env.');
    process.exit(1);
  }

  try {
    const url = new URL(databaseUrl);
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const databaseUrl = getDatabaseUrl();
const backupDir = path.join(BACKEND_DIR, 'backups');
mkdirSync(backupDir, { recursive: true });

const fileName = `local_backup_${formatTimestamp(new Date())}.dump`;
const localOutputPath = path.join(backupDir, fileName);

const baseDumpArgs = ['--no-owner', '--no-privileges', '--format=custom', '--compress=9'];

console.log(`Source DB: ${maskDatabaseUrl(databaseUrl)}`);
console.log(`Output file: ${localOutputPath}`);

if (hasCommand('pg_dump')) {
  run('pg_dump', [...baseDumpArgs, `--file=${localOutputPath}`, databaseUrl]);
  console.log('Local backup created with pg_dump.');
  process.exit(0);
}

if (hasCommand('docker')) {
  const dockerOutputPath = `/backup/${fileName}`;
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${backupDir}:/backup`,
    'postgres:18',
    'pg_dump',
    ...baseDumpArgs,
    `--file=${dockerOutputPath}`,
    databaseUrl,
  ]);
  console.log('Local backup created with docker postgres:18 image.');
  process.exit(0);
}

console.error('Neither pg_dump nor docker is available on this machine.');
console.error('Install PostgreSQL client tools or Docker Desktop, then run the script again.');
process.exit(1);
