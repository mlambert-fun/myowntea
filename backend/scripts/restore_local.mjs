import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, '..');
const DEFAULT_TARGET_DB = 'myowntea_restore';

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

function hasCommand(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const options = {
    file: '',
    target: DEFAULT_TARGET_DB,
    force: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
      continue;
    }

    if (arg.startsWith('--target=')) {
      options.target = arg.slice('--target='.length);
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log('Usage: npm run db:restore:local -- [--file=path/to/dump] [--target=db_name] [--force]');
  console.log('');
  console.log(`Default target database: ${DEFAULT_TARGET_DB}`);
  console.log('Default dump file: latest non-empty local_backup_*.dump in backend/backups');
  console.log('');
  console.log('Safety rule: restoring to "myowntea" requires --force.');
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
    return url;
  } catch {
    console.error('Invalid database URL in backend/.env.');
    process.exit(1);
  }
}

function getLatestBackupFile() {
  const backupDir = path.join(BACKEND_DIR, 'backups');
  const candidates = readdirSync(backupDir)
    .filter((name) => /^local_backup_.*\.dump$/i.test(name))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      const stats = statSync(fullPath);
      return { fullPath, size: stats.size, mtimeMs: stats.mtimeMs };
    })
    .filter((entry) => entry.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidates.length === 0) {
    console.error('No non-empty local backup file found in backend/backups.');
    process.exit(1);
  }

  return candidates[0].fullPath;
}

function maskUrl(url) {
  const clone = new URL(url.toString());
  if (clone.username) clone.username = '***';
  if (clone.password) clone.password = '***';
  return `${clone.protocol}//${clone.username ? `${clone.username}:${clone.password}@` : ''}${clone.host}${clone.pathname}`;
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.target === 'myowntea' && !options.force) {
  console.error('Refusing to restore into "myowntea" without --force.');
  console.error(`Use the default target "${DEFAULT_TARGET_DB}" or rerun with --target=myowntea --force.`);
  process.exit(1);
}

for (const command of ['createdb', 'dropdb', 'pg_restore']) {
  if (!hasCommand(command)) {
    console.error(`Missing required command: ${command}`);
    process.exit(1);
  }
}

const sourceUrl = getDatabaseUrl();
const targetDbName = options.target;
const dumpFile = options.file ? path.resolve(process.cwd(), options.file) : getLatestBackupFile();

const env = { ...process.env };
if (sourceUrl.password) {
  env.PGPASSWORD = sourceUrl.password;
}

const commonArgs = [];
if (sourceUrl.hostname) commonArgs.push('-h', sourceUrl.hostname);
if (sourceUrl.port) commonArgs.push('-p', sourceUrl.port);
if (sourceUrl.username) commonArgs.push('-U', sourceUrl.username);

console.log(`Source server: ${maskUrl(sourceUrl)}`);
console.log(`Dump file: ${dumpFile}`);
console.log(`Target database: ${targetDbName}`);

run('dropdb', [...commonArgs, '--if-exists', targetDbName], env);
run('createdb', [...commonArgs, targetDbName], env);
run(
  'pg_restore',
  [
    ...commonArgs,
    '-d',
    targetDbName,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    dumpFile,
  ],
  env,
);

console.log(`Restore completed into database "${targetDbName}".`);
