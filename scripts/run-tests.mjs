import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(path);
    }
  }

  return files;
}

const testFiles = (await findTestFiles(sourceRoot)).sort();
if (testFiles.length === 0) {
  throw new Error(`No test files found under ${sourceRoot}`);
}

let spawnFailed = false;
const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--test', ...testFiles],
  { stdio: 'inherit' },
);

child.on('error', (error) => {
  spawnFailed = true;
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = spawnFailed ? 1 : (code ?? (signal ? 1 : 0));
});
