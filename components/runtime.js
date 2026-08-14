/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:15:20
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-14 23:13:38
 * @FilePath: /kh-plugin/components/runtime.js
 * @Description: 运行时状态
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { ensureRuntimePaths, headsDir } from './paths.js';
import { loadConfig } from './config.js';
import { scanKeys } from './storage.js';
import { createMemberUpdater } from '../services/member-updater.js';

ensureRuntimePaths();

export const config = loadConfig();
export const headDir = headsDir;
export const OPERATION_LOCK_KEY = `${config.redisPrefix}${config.lockKeyOperation}`;
export const memberUpdater = createMemberUpdater({ redis, config, logger, headsDir: headDir });
export const scanLegacyKeys = pattern => scanKeys(redis, pattern, { count: 500, maxKeys: 100000 });

const state = globalThis.__whoAreYouRuntime ||= { monitorCdMap: new Map(), bot: null, scheduler: null };

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
  return Boolean(await redis.exists(OPERATION_LOCK_KEY));
}

export function schedulerState() {
  return state;
}
