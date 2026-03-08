import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../logger.js';

/** 旧版缓存文件名（de29caca 之前位于 process.cwd()） */
const LEGACY_FILES = [
  'user_token_cache.json',
  'tenant_token_cache.json',
  'scope_version_cache.json',
] as const;

const MIGRATION_MARKER = '.legacy_cache_migrated';

/**
 * 将旧路径（process.cwd()）下的 token 缓存迁移到新目录：复制内容到新文件后删除原文件。
 * 通过标记文件保证只执行一次；若新目录与 cwd 相同则跳过。
 */
export function migrateLegacyTokenCacheIfNeeded(
  newCacheDir: string,
  newPaths: readonly [string, string, string]
): void {
  const markerPath = path.join(newCacheDir, MIGRATION_MARKER);
  if (fs.existsSync(markerPath)) {
    Logger.debug('Token 缓存已迁移过，跳过本次迁移');
    return;
  }

  const legacyDir = process.cwd();
  if (path.resolve(legacyDir) === path.resolve(newCacheDir)) {
    Logger.debug('缓存目录与工作目录相同，无需迁移');
    return;
  }

  Logger.info(`检查旧路径缓存并迁移: ${legacyDir} -> ${newCacheDir}`);
  let migratedCount = 0;

  for (let i = 0; i < LEGACY_FILES.length; i++) {
    const oldPath = path.join(legacyDir, LEGACY_FILES[i]);
    const newPath = newPaths[i];
    if (!fs.existsSync(oldPath)) {
      Logger.debug(`旧缓存不存在，跳过: ${LEGACY_FILES[i]}`);
      continue;
    }
    try {
      const content = fs.readFileSync(oldPath, 'utf-8');
      fs.writeFileSync(newPath, content, 'utf-8');
      fs.unlinkSync(oldPath);
      migratedCount++;
      Logger.info(`已迁移旧缓存并删除原文件: ${LEGACY_FILES[i]} -> ${newPath}`);
    } catch (error) {
      Logger.warn(`迁移旧缓存失败，跳过 ${LEGACY_FILES[i]}`, error);
    }
  }

  if (migratedCount > 0) {
    Logger.info(`Token 缓存迁移完成，共 ${migratedCount} 个文件`);
  }

  try {
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
    Logger.debug(`迁移标记已写入: ${markerPath}`);
  } catch (error) {
    Logger.warn('写入迁移标记失败', error);
  }
}
