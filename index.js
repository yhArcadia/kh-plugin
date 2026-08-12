/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:58
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-12 16:09:34
 * @FilePath: /kh-plugin/index.js
 * @Description: 插件入口
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { ensureLegacyPluginFilesBackedUp } from './components/legacy-cleanup.js';

logger.info("[kh-plugin] 开始载入")
ensureLegacyPluginFilesBackedUp();

// 载入 apps 目录下的所有文件
const appsDir = fileURLToPath(new URL('./apps/', import.meta.url));
const files = fs.readdirSync(appsDir)
  .filter(file => file.endsWith('.js'))
  .sort();
const results = await Promise.allSettled(
  files.map(file => import(pathToFileURL(path.join(appsDir, file)).href))
);

const apps = {};
for (let index = 0; index < files.length; index++) {
  const file = files[index];
  const name = path.basename(file, '.js');
  const result = results[index];
  if (result.status !== 'fulfilled') {
    logger.error(`[kh-plugin] 载入 app 失败：${logger.red?.(name) || name}`);
    logger.error(result.reason);
    continue;
  }
  const exported = Object.values(result.value);
  const App = exported.find(value => typeof value === 'function' && value.prototype instanceof plugin);
  if (!App) {
    logger.error(`[kh-plugin] apps/${file} 未导出有效的 plugin 类，已跳过。`);
    continue;
  }
  apps[name] = App;
}

export { apps };

logger.info("[kh-plugin] 载入完成")