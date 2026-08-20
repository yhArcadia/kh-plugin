/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:58
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-20 19:57:26
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
  // 载入 apps 目录下的所有文件
  const appsDir = fileURLToPath(new URL('./apps/', import.meta.url));
  const files = fs.readdirSync(appsDir)
    .filter(file => file.endsWith('.js'))
    .sort();
  const results = await Promise.allSettled(
    files.map(file => import(pathToFileURL(path.join(appsDir, file)).href))
  );

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
      log.e(`apps/${file} 未导出有效的 plugin 类，已跳过。`);
      continue;
    }
    apps[name] = App;
  }
}

export { apps };

log.i("载入完成")
log.i("欢迎加群交流＆反馈：134086404")