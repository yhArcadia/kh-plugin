/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:55:01
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-11 23:56:07
 * @FilePath: /kh-plugin/guoba/actions/statistics.js
 * @Description: 统计群成员数量、记录数量、最新记录时间等信息
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadConfig, configPaths } from '../../components/config.js';
import { scanHistoryKeys, getHistory } from '../../components/storage.js';
import { statsCache } from '../config-handler.js';
import { redisClient, parseKey, normalizeActionArgs } from './helpers.js';
import { getGroupName } from '../../utils/group-name.js';

const STATS_CACHE_TTL_MS = 30_000;

export async function statistics(input = {}) {
  const { maxKeys = 2000, refresh = false } = await normalizeActionArgs(input, ['maxKeys', 'refresh']);
  if (!refresh && statsCache.value && statsCache.expiresAt > Date.now()) return { ...statsCache.value, cached: true };
  const config = loadConfig();
  const keys = await scanHistoryKeys(
    redisClient(),
    config,
    null,
    {
      count: 250,
      maxKeys: Math.min(200000, Math.max(1, Number(maxKeys) || 50000))
    });
  const groups = new Map();
  let recordCount = 0;
  for (const key of keys) {
    const parsed = parseKey(key, config.redisPrefix);
    if (!parsed) continue;
    const history = await getHistory(redisClient(), config, parsed.groupId, parsed.userId);
    recordCount += history.length;
    const item = groups.get(parsed.groupId) || { groupId: parsed.groupId, members: 0, records: 0, latestRecordTime: '' };
    item.members++;
    item.records += history.length;
    const latest = history.at(-1)?.recordTime || '';
    if (latest > item.latestRecordTime) item.latestRecordTime = latest;
    groups.set(parsed.groupId, item);
  }
  // 从 Bot 缓存获取群名和实际人数
  const bot = globalThis.Bot;
  for (const [gid, group] of groups) {
    group.groupName = String(gid);
    group.avatar = '';
    group.actualMemberCount = 0;
    if (bot) {
      try {
        const gl = bot.gl?.get(Number(gid)) || bot.gl?.get(String(gid));
        if (gl) {
          group.groupName = gl.group_name || gl.name || String(gid);
          group.actualMemberCount = gl.member_count || gl.member_num || 0;
        }
      } catch {}
      try {
        group.avatar = `https://p.qlogo.cn/gh/${gid}/${gid}/100`;
      } catch {}
    }
  }
  const result = {
    capped: keys.length >= maxKeys,
    scannedMemberKeys: keys.length,
    scannedRecords: recordCount,
    groups: [...groups.values()].sort((a, b) => b.records - a.records),
    dataPath: configPaths.legacyDataRoot,
    cached: false
  };
  statsCache.value = result;
  statsCache.expiresAt = Date.now() + STATS_CACHE_TTL_MS;
  return result;
}