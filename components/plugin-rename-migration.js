import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { log } from '../utils/logger.js';

const OLD_PLUGIN_NAME = 'who-are-you-plugin';
const NEW_PLUGIN_NAME = 'kh-plugin';
const ORIGIN_RENAMES = new Map([
  [
    'https://github.com/yhArcadia/who-are-you-plugin.git',
    'https://github.com/yhArcadia/kh-plugin.git'
  ],
  [
    'https://github.com/yhArcadia/who-are-you-plugin',
    'https://github.com/yhArcadia/kh-plugin.git'
  ],
  [
    'https://gitee.com/yhArcadia/who-are-you-plugin.git',
    'https://gitee.com/yhArcadia/kh-plugin.git'
  ],
  [
    'https://gitee.com/yhArcadia/who-are-you-plugin',
    'https://gitee.com/yhArcadia/kh-plugin.git'
  ]
]);

const modulePluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function defaultLogger() {
  return {
    debug: message => log.d(message),
    info: message => log.i(message),
    warn: message => log.w(message),
    error: (message, error) => log.e(message, error)
  };
}

function resolveExpectedPluginRoot(fsApi, pathApi, rootDir, pluginRoot) {
  try {
    const realRootDir = fsApi.realpathSync(rootDir);
    const realPluginRoot = fsApi.realpathSync(pluginRoot);
    const pluginsDir = pathApi.join(realRootDir, 'plugins');
    const currentName = pathApi.basename(realPluginRoot);

    if (pathApi.dirname(realPluginRoot) !== pluginsDir) return null;
    if (currentName !== OLD_PLUGIN_NAME && currentName !== NEW_PLUGIN_NAME) return null;

    return { realPluginRoot, pluginsDir, currentName };
  } catch {
    return null;
  }
}

function pathEntryExists(fsApi, targetPath) {
  try {
    fsApi.lstatSync(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    // 无法确认目标不存在时宁可拒绝迁移，避免覆盖未知路径。
    return true;
  }
}

function updateOfficialHttpsOrigin(pluginRoot, { spawnSync: runGit, logger }) {
  let result;
  try {
    result = runGit('git', ['remote', 'get-url', 'origin'], {
      cwd: pluginRoot,
      encoding: 'utf8',
      shell: false
    });
  } catch (error) {
    logger.warn('[kh-plugin] 目录迁移完成，但无法检测 Git origin；未修改远程地址。');
    return { status: 'git-origin-check-failed', error };
  }

  if (result?.error || result?.status !== 0) {
    logger.info('[kh-plugin] 目录迁移完成，未检测到可更新的 Git origin；远程地址保持不变。');
    return { status: 'git-origin-unavailable', error: result?.error };
  }

  const oldUrl = String(result.stdout || '').trim();
  const newUrl = ORIGIN_RENAMES.get(oldUrl);
  if (!newUrl) {
    logger.info('[kh-plugin] 目录迁移完成，Git origin 不是受支持的旧官方 HTTPS 地址；未修改远程地址。');
    return { status: 'git-origin-skipped' };
  }

  try {
    result = runGit('git', ['remote', 'set-url', 'origin', newUrl], {
      cwd: pluginRoot,
      encoding: 'utf8',
      shell: false
    });
  } catch (error) {
    logger.error('[kh-plugin] 目录迁移完成，但更新 Git origin 失败；请手动检查远程地址。', error);
    return { status: 'git-origin-update-failed', error };
  }

  if (result?.error || result?.status !== 0) {
    const error = result?.error || new Error(String(result?.stderr || 'git remote set-url failed'));
    logger.error('[kh-plugin] 目录迁移完成，但更新 Git origin 失败；请手动检查远程地址。', error);
    return { status: 'git-origin-update-failed', error };
  }

  logger.info('[kh-plugin] Git origin 已更新为 kh-plugin 官方 HTTPS 地址。');
  return { status: 'git-origin-updated' };
}

/**
 * 在所有 app 动态导入完成后，将旧插件目录原子迁移到 kh-plugin。
 * 只移动插件目录本身；不会读写 Redis、data 目录或插件内部文件。
 */
export function migratePluginDirectory(options = {}) {
  const fsApi = options.fsApi || fs;
  const pathApi = options.pathApi || path;
  const logger = options.logger || defaultLogger();
  const rootDir = options.rootDir || process.cwd();
  const pluginRoot = options.pluginRoot || modulePluginRoot;
  const runGit = options.spawnSync || spawnSync;
  const resolved = resolveExpectedPluginRoot(fsApi, pathApi, rootDir, pluginRoot);

  if (!resolved) {
    logger.warn('[kh-plugin] 插件目录不在预期的 <Yunzai>/plugins/<插件名> 结构中，已拒绝自动迁移。');
    return { status: 'invalid-path' };
  }

  if (resolved.currentName === NEW_PLUGIN_NAME) {
    logger.debug?.('[kh-plugin] 当前已使用 kh-plugin 目录，无需迁移。');
    return { status: 'already-renamed' };
  }

  const targetRoot = pathApi.join(resolved.pluginsDir, NEW_PLUGIN_NAME);
  if (pathEntryExists(fsApi, targetRoot)) {
    logger.error('[kh-plugin] 检测到 who-are-you-plugin 与 kh-plugin 目录同时存在；为避免覆盖或合并，未迁移。请手动仅保留一个目录后重启 Yunzai。');
    return { status: 'target-exists' };
  }

  try {
    fsApi.renameSync(resolved.realPluginRoot, targetRoot);
  } catch (error) {
    logger.error('[kh-plugin] 插件目录迁移失败，旧目录已保留；不会使用复制/删除作为兜底。', error);
    return { status: 'rename-failed', error };
  }

  const git = updateOfficialHttpsOrigin(targetRoot, { spawnSync: runGit, logger });
  logger.warn('[kh-plugin] 插件目录已从 who-are-you-plugin 迁移为 kh-plugin；请重启 Yunzai 使新目录生效。');
  return { status: 'migrated', from: resolved.realPluginRoot, to: targetRoot, git };
}

export const pluginRenameMigration = Object.freeze({ OLD_PLUGIN_NAME, NEW_PLUGIN_NAME, ORIGIN_RENAMES });