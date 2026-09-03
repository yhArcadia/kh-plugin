/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:58
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-03 19:40:23
 * @FilePath: /kh-plugin/index.js
 * @Description: 插件入口
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { ensureLegacyPluginFilesBackedUp } from './components/legacy-cleanup.js';
import { migratePluginDirectory } from './components/plugin-rename-migration.js';
import { log } from './utils/logger.js';
import { boxLine, printBox, wrapModuleNames } from './utils/boxization.js';

log.i("开始载入")
const apps = {};

// 处理 plugins/example 下的 1.x 单文件旧入口。
ensureLegacyPluginFilesBackedUp();

// 旧目录迁移成功后，本轮不再载入任何插件业务模块。
const migration = migratePluginDirectory();
if (migration.status === 'migrated') {
  logger.warn('[kh-plugin] 本轮已停止载入本插件功能，请重启 Yunzai。');
  setTimeout(() => {
    const message = '【kh-plugin】插件目录已从 who-are-you-plugin 迁移为 kh-plugin。\n本次启动已安全跳过插件功能加载，请再重启一次 Yunzai 使新目录生效。';
    const bot = globalThis.Bot;
    if (!bot || typeof bot.sendMasterMsg !== 'function') {
      logger.warn('[kh-plugin] 无法通知主人：Bot.sendMasterMsg 不可用。');
      return;
    }

    try {
      Promise.resolve(bot.sendMasterMsg(message, undefined, 0))
        .catch(() => logger.warn('[kh-plugin] 发送目录迁移重启提醒失败。'));
    } catch {
      log.w("发送目录迁移重启提醒失败。");
    }
  }, 3000);
} else {
  const startTime = Date.now();
  // 载入 apps 目录下的所有文件
  const appsDir = fileURLToPath(new URL('./apps/', import.meta.url));
  const files = fs.readdirSync(appsDir)
    .filter(file => file.endsWith('.js'))
    .sort();
  const results = await Promise.allSettled(
    files.map(file => import(pathToFileURL(path.join(appsDir, file)).href))
  );

  const successModules = [];
  const failedModules = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const name = path.basename(file, '.js');
    const result = results[index];
    if (result.status !== 'fulfilled') {
      failedModules.push(file);
      logger.error(`[kh-plugin] 载入 app 失败：${logger.red?.(name) || name}`);
      logger.error(result.reason);
      continue;
    }
    const exported = Object.values(result.value);
    const App = exported.find(value => typeof value === 'function' && value.prototype instanceof plugin);
    if (!App) {
      failedModules.push(file);
      log.e(`apps/${file} 未导出有效的 plugin 类，已跳过。`);
      continue;
    }
    apps[name] = App;
    successModules.push(name);
  }

  const elapsed = Date.now() - startTime;
  const boxLines = [];

  boxLines.push(boxLine(`载入完成！`));

  if (successModules.length > 0) {
    boxLines.push(boxLine(`成功载入 ${successModules.length} 个模块：`));
    boxLines.push(...wrapModuleNames(successModules));
  } else {
    boxLines.push(boxLine('成功载入 0 个模块'));
  }

  if (failedModules.length > 0) {
    boxLines.push({ line: boxLine('以下模块载入失败：'), level: 'w' });
    for (const line of wrapModuleNames(failedModules)) {
      boxLines.push({ line, level: 'w' });
    }
  }

  boxLines.push(boxLine('欢迎加群交流＆反馈：134086404'));
  printBox(boxLines);
}

export { apps };