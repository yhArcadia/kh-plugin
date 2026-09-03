/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:15:20
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-03 18:59:27
 * @FilePath: /kh-plugin/components/runtime.js
 * @Description: 运行时状态
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import { ensureRuntimePaths, headsDir } from './paths.js';
import { loadConfig, reloadConfig, configPaths } from './config.js';
import { scanKeys } from './storage.js';
import { createMemberUpdater } from '../services/member-updater.js';

ensureRuntimePaths();

let _config = loadConfig();
let _memberUpdater = createMemberUpdater({ redis, config: _config, logger, headsDir });

export const config = new Proxy({}, {
  get(_, prop) { return _config[prop]; },
  set(_, prop, value) { _config[prop] = value; return true; },
  ownKeys() { return Reflect.ownKeys(_config); },
  getOwnPropertyDescriptor(_, prop) { return Reflect.getOwnPropertyDescriptor(_config, prop); },
  has(_, prop) { return prop in _config; }
});

export function getRawConfig() { return _config; }

export function refreshConfig() {
  _config = reloadConfig();
  _memberUpdater = createMemberUpdater({ redis, config: _config, logger, headsDir });
  const state = globalThis.__whoAreYouRuntime;
  if (state?.scheduler) {
    state.scheduler.config = _config;
    state.scheduler.reschedule();
  }
  return _config;
}

export const headDir = headsDir;
export const memberUpdater = new Proxy({}, {
  get(_, prop) { return _memberUpdater[prop]; },
  set(_, prop, value) { _memberUpdater[prop] = value; return true; }
});
export const scanLegacyKeys = pattern => scanKeys(redis, pattern, { count: 500, maxKeys: 100000 });

const state = globalThis.__whoAreYouRuntime ||= { monitorCdMap: new Map(), bot: null, scheduler: null };

if (!state._configWatcherSetup) {
  state._configWatcherSetup = true;
  fs.watchFile(configPaths.userConfigPath, { interval: 2000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      try {
        refreshConfig();
        logger?.mark?.('[kh-plugin] 检测到 config.yaml 变更，配置已重载。');
      } catch (err) {
        logger?.warn?.(`[kh-plugin] 配置重载失败: ${err.message}`);
      }
    }
  });
}

export function checkAndSetMonitorCD(gid, uid) {
  const now = Date.now();
  const key = `${gid}:${uid}`;
  const expireAt = state.monitorCdMap.get(key);
  if (expireAt && expireAt > now) return true;
  state.monitorCdMap.set(key, now + Number(config.monitorCD || 600) * 1000);
  if (state.monitorCdMap.size > 50000) {
    for (const [candidate, expires] of state.monitorCdMap) if (expires <= now) state.monitorCdMap.delete(candidate);
  }
  return false;
}

export function getBot() {
  return state.bot || globalThis.Bot;
}

export function setBot(bot) {
  state.bot = bot || globalThis.Bot || null;
  return state.bot;
}

export async function isOperationRunning() {
  return Boolean(await redis.exists(`${_config.redisPrefix}${_config.lockKeyOperation}`));
}

export function schedulerState() {
  return state;
}