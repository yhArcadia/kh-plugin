/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:55
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-08 16:59:35
 * @FilePath: /kh-plugin/components/paths.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeSafeUid } from '../utils/uid-encoder.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pluginRoot = path.resolve(__dirname, '..');
export const dataRoot = path.join(process.cwd(), 'data', 'who_are_you_plugin'); //兼容旧版数据目录，对应Yunzai/data/who_are_you_plugin，该处没有头像时才采用插件内data目录。
const legacyHeadsDir = path.join(dataRoot, 'heads');
const pluginHeadsDir = path.join(pluginRoot, 'data', 'heads');
export const headsDir = hasFiles(legacyHeadsDir) ? legacyHeadsDir : pluginHeadsDir;
export const templateDir = path.join(pluginRoot, 'resources', 'template');
export const versionTemplate = path.join(templateDir, 'version.html');
export const helpMarkdown = path.join(pluginRoot, 'resources', 'help', 'help.md');
export const helpTemplate = path.join(templateDir, 'help.html');
export const orphansDir = path.join(headsDir, 'orphans');

function hasFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some(entry => entry.isFile());
  } catch (err) {
    return false;
  }
}

export function ensureRuntimePaths() {
  fs.mkdirSync(headsDir, { recursive: true });
}

export function orphanDateDir(dateStr) {
  return path.join(orphansDir, dateStr);
}

export function ensureOrphanDirs(dateStr) {
  const dir = orphanDateDir(dateStr);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveHeadPath(uid, headtime, gid) {
  const safeUid = encodeSafeUid(uid);
  const newPath = path.join(headsDir, `${safeUid}_${headtime}.jpg`);
  if (fs.existsSync(newPath)) return newPath;

  if (gid != null) {
    const oldPath = path.join(headsDir, `${gid}_${uid}_${headtime}.jpg`);
    if (fs.existsSync(oldPath)) {
      try {
        fs.linkSync(oldPath, newPath);
        log.i(`硬链接创建: ${path.basename(oldPath)} -> ${path.basename(newPath)}`);
      } catch (err) {
        log.d(`硬链接创建失败: ${path.basename(oldPath)} -> ${path.basename(newPath)}: ${err.message}`);
      }
      return oldPath;
    }
  }
  return null;
}