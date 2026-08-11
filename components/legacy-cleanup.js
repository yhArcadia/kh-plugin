/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-10 21:36:06
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-11 18:11:20
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/components/legacy-cleanup.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../utils/logger.js';

const legacyFilePattern = /^who_are_you.*\.js$/;

/**
 * 处理/example下的旧版插件。
 *
 * @param {string} rootDir Yunzai 工作目录
 * @returns {string[]} 已备份的文件名
 */
export function backupLegacyPluginFiles(rootDir = process.cwd()) {
  const backedUp = [];
  const exampleDir = path.join(rootDir, 'plugins', 'example');
  const legacyFiles = findLegacyPluginFiles(rootDir);

  for (const fileName of legacyFiles) {
    const sourcePath = path.join(exampleDir, fileName);
    const backupPath = nextBackupPath(sourcePath);

    try {
      fs.renameSync(sourcePath, backupPath);
      backedUp.push(fileName);
      log.i(`[who_are_you] 已备份旧版文件：${fileName} -> ${path.basename(backupPath)}`);
    } catch (error) {
      log.w(`[who_are_you] 备份旧版文件 ${fileName} 失败：${error.message}`);
    }
  }

  return backedUp;
}

export function ensureLegacyPluginFilesBackedUp(rootDir = process.cwd()) {
  backupLegacyPluginFiles(rootDir);
  const remainingFiles = findLegacyPluginFiles(rootDir);
  if (!remainingFiles.length) return;

  const exampleDir = path.join(rootDir, 'plugins', 'example');
  const message = `[who_are_you] 检测到旧版插件文件仍存在，当前插件拒绝载入。请手动删除以下文件后重启：${remainingFiles.map(file => path.join(exampleDir, file)).join('、')}`;
  log.e(message);
  throw new Error(message);
}

export function findLegacyPluginFiles(rootDir = process.cwd()) {
  const exampleDir = path.join(rootDir, 'plugins', 'example');

  try {
    return fs.readdirSync(exampleDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && legacyFilePattern.test(entry.name))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    if (error.code !== 'ENOENT') log.w(`[who_are_you] 检查旧版文件失败：${error.message}`);
    return [];
  }
}

function nextBackupPath(sourcePath) {
  let index = 1;
  let backupPath = `${sourcePath}.bak`;

  while (fs.existsSync(backupPath)) {
    index += 1;
    backupPath = `${sourcePath}.bak${index}`;
  }

  return backupPath;
}