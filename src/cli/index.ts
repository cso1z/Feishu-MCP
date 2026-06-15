#!/usr/bin/env node

import { printVersionIfRequested } from '../utils/packageVersion.js';

if (printVersionIfRequested(process.argv.slice(2))) {
  process.exit(0);
}

await import('./main.js');
