/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-12 18:26:02
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 19:41:58
 * @FilePath: /kh-plugin/guoba.support.js
 * @Description: 锅巴支持模块
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadConfig, configPaths } from './components/config.js';
import { scanHistoryKeys, getHistory } from './components/storage.js';
import { pluginRoot } from './components/paths.js';
import { getConfigData, setConfigData, statsCache } from './guoba/config-handler.js';
import path from "path";
import  configuration_schemas  from './guoba/schemas/schema.js';
const schemas = [...configuration_schemas];

const STATS_CACHE_TTL_MS = 30_000;
const GROUPS_PAGE_SIZE = 50;
const MEMBERS_PAGE_SIZE = 30;

function resultOk(Result, data, message = '操作成功') {
  return Result?.ok ? Result.ok(data, message) : { ok: true, data, message };
}

function resultError(Result, message) {
  return Result?.error ? Result.error(message) : { ok: false, message };
}

function redisClient() {
  if (!global.redis) throw new Error('Redis 尚未连接，无法读取 kh-plugin 数据。');
  return global.redis;
}

function parseKey(key, prefix) {
  const rest = key.slice(`${prefix}:`.length).split(':');
  if (rest.length !== 2 || !/^\d+$/.test(rest[0]) || !/^\d+$/.test(rest[1])) return null;
  return { groupId: Number(rest[0]), userId: Number(rest[1]) };
}
async function normalizeActionArgs(args, keys) {
  if (Array.isArray(args)) return Object.fromEntries(keys.map((key, index) => [key, args[index]]));
  return args && typeof args === 'object' ? args : {};
}

async function statistics(input = {}) {
  const { maxKeys = 2000, refresh = false } = await normalizeActionArgs(input, ['maxKeys', 'refresh']);
  if (!refresh && statsCache.value && statsCache.expiresAt > Date.now()) return { ...statsCache.value, cached: true };
  const config = loadConfig();
  const keys = await scanHistoryKeys(redisClient(), config, null, { count: 250, maxKeys: Math.min(20000, Math.max(1, Number(maxKeys) || 5000)) });
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
  const result = { capped: keys.length >= maxKeys, scannedMemberKeys: keys.length, scannedRecords: recordCount, groups: [...groups.values()].sort((a, b) => b.records - a.records), dataPath: configPaths.legacyDataRoot, cached: false };
  statsCache = { value: result, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
  return result;
}

async function members(input = {}) {
  let { groupId, page = 1, pageSize = 30 } = await normalizeActionArgs(input, ['groupId', 'page', 'pageSize']);
  const config = loadConfig();
  const gid = Number(groupId);
  if (!Number.isFinite(gid) || gid <= 0) throw new Error('groupId 必须是有效群号。');
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 30)));
  const keys = await scanHistoryKeys(redisClient(), config, gid, { count: 250, maxKeys: 10000 });
  const slice = keys.sort().slice((page - 1) * pageSize, page * pageSize);
  const items = await Promise.all(slice.map(async key => {
    const parsed = parseKey(key, config.redisPrefix);
    const history = await getHistory(redisClient(), config, gid, parsed.userId);
    const latest = history.at(-1) || {};
    return { userId: parsed.userId, records: history.length, nickname: latest.nickname || '', card: latest.card || '', title: latest.title || '', recordTime: latest.recordTime || '', avatarChangedAt: latest.headtime || null };
  }));
  return { groupId: gid, page, pageSize, totalMembers: keys.length, capped: keys.length >= 10000, items };
}

async function memberHistory(input = {}) {
  let { groupId, userId, limit = 50 } = await normalizeActionArgs(input, ['groupId', 'userId', 'limit']);
  const config = loadConfig();
  const gid = Number(groupId), uid = Number(userId);
  if (!Number.isFinite(gid) || !Number.isFinite(uid) || gid <= 0 || uid <= 0) throw new Error('groupId 和 userId 必须为有效数字。');
  limit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const history = await getHistory(redisClient(), config, gid, uid);
  return { groupId: gid, userId: uid, totalRecords: history.length, truncated: history.length > limit, records: history.slice(-limit) };
}

async function blacklistPreview() {
  const config = loadConfig();
  const wanted = new Set((config.userBlacklist || []).slice(0, 100).map(Number));
  const latestByUser = new Map();
  if (wanted.size) {
    const client = redisClient();
    const keys = await scanHistoryKeys(client, config, null, { count: 250, maxKeys: 20000 });
    for (const key of keys) {
      const parsed = parseKey(key, config.redisPrefix);
      if (!parsed || !wanted.has(parsed.userId)) continue;
      const candidate = (await getHistory(client, config, parsed.groupId, parsed.userId)).at(-1);
      const previous = latestByUser.get(parsed.userId);
      if (candidate && (!previous || String(candidate.recordTime || '') > String(previous.recordTime || ''))) latestByUser.set(parsed.userId, candidate);
    }
  }
  return [...wanted].map(userId => {
    const latest = latestByUser.get(userId);
    return { userId, name: latest?.card || latest?.nickname || '', avatar: `https://q1.qlogo.cn/g?b=qq&s=100&nk=${userId}` };
  });
}

function briefActionResult(action, data) {
  if (action === 'statistics') return `已统计 ${data.scannedMemberKeys} 个成员索引、${data.scannedRecords} 条身份记录，涉及 ${data.groups.length} 个群${data.capped ? '（达到扫描上限）' : ''}。`;
  if (action === 'members') return `群 ${data.groupId}：第 ${data.page} 页返回 ${data.items.length} 人，共扫描到 ${data.totalMembers} 名成员${data.capped ? '（达到扫描上限）' : ''}。`;
  if (action === 'memberHistory') return `群 ${data.groupId} 的 QQ ${data.userId}：共 ${data.totalRecords} 条记录，返回最近 ${data.records.length} 条${data.truncated ? '。' : '。'}`;
  if (action === 'blacklistPreview') return `已整理 ${data.length} 名黑名单成员的最新昵称/头像预览。`;
  return '操作成功。';
}

async function runAction(action, input, context = {}) {
  const Result = context?.Result;
  try {
    const data = await action(input);
    return resultOk(Result, data, briefActionResult(action.name, data));
  } catch (error) {
    return resultError(Result, error?.message || '操作失败。');
  }
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'kh-plugin',
      title: 'Kh-Plugin',
      author: '渔火Arcadia',
      authorLink: 'https://github.com/yhArcadia',
      link: 'https://github.com/yhArcadia/kh-plugin',
      isV2: false,
      isV3: true,
      showInMenu: 'auto',
      iconPath: path.join(pluginRoot, 'resources/img/icon.png'),
      description: '群成员头像昵称记录留档工具，有效制裁群友“改头换面”、秽土转生。(如链接打不开请把github换成gitee)'
    },
    configInfo: {
      schemas,
      getConfigData,
      setConfigData,
      actions: {
        statistics: (args, context) => runAction(statistics, args, context),
        members: (args, context) => runAction(members, args, context),
        memberHistory: (args, context) => runAction(memberHistory, args, context),
        blacklistPreview: (args, context) => runAction(blacklistPreview, args, context)
      }
    }
  };
}