#!/usr/bin/env node

// 标记 CLI 模式，确保 Logger 不会向 stdout 输出日志（避免污染 JSON 结果）
process.env.NODE_ENV = 'cli';

import { printVersionIfRequested } from '../utils/packageVersion.js';

if (printVersionIfRequested(process.argv.slice(2))) {
  process.exit(0);
}

await import('./main.js');
