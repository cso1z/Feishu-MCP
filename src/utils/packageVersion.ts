import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

export const packageVersion = packageJson.version;

export function printVersionIfRequested(args: readonly string[]): boolean {
  if (!args.some(arg => arg === '--version' || arg === '-v')) {
    return false;
  }

  process.stdout.write(`${packageVersion}\n`);
  return true;
}
