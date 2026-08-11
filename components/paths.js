/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:55
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-11 18:10:32
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/components/paths.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pluginRoot = path.resolve(__dirname, '..');
export const dataRoot = path.join(process.cwd(), 'data', 'who_are_you_plugin');
const legacyHeadsDir = path.join(dataRoot, 'heads');
const pluginHeadsDir = path.join(pluginRoot, 'data', 'heads');
export const headsDir = hasFiles(legacyHeadsDir) ? legacyHeadsDir : pluginHeadsDir;
export const templateDir = path.join(pluginRoot, 'resources', 'template');
export const versionTemplate = path.join(templateDir, 'version.html');

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

export function headPath(gid, uid, headtime) {
  return path.join(headsDir, `${gid}_${uid}_${headtime}.jpg`);
}
