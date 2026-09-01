/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:55:19
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 20:00:30
 * @FilePath: /kh-plugin/guoba/actions/members.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadConfig } from '../../components/config.js';
import { scanHistoryKeys, getHistory } from '../../components/storage.js';
import { redisClient, parseKey, normalizeActionArgs } from './helpers.js';

export async function members(input = {}) {
  let { groupId, page = 1, pageSize = 30 } = await normalizeActionArgs(input, ['groupId', 'page', 'pageSize']);
  const config = loadConfig();
  const gid = Number(groupId);
  if (!Number.isFinite(gid) || gid <= 0) throw new Error('groupId 必须是有效群号。');
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 30)));
  const keys = await scanHistoryKeys(
    redisClient(),
    config,
    gid,
    { count: 250, maxKeys: 10000 }
  );
  const slice = keys.sort().slice((page - 1) * pageSize, page * pageSize);
  const items = await Promise.all(slice.map(async key => {
    const parsed = parseKey(key, config.redisPrefix);
    const history = await getHistory(redisClient(), config, gid, parsed.userId);
    const latest = history.at(-1) || {};
    return {
      userId: parsed.userId,
      records: history.length,
      nickname: latest.nickname || '',
      card: latest.card || '',
      title: latest.title || '',
      recordTime: latest.recordTime || '',
      avatarChangedAt: latest.headtime || null
    };
  }));
  return {
    groupId: gid,
    page,
    pageSize,
    totalMembers: keys.length,
    capped: keys.length >= 10000,
    items
  };
}

export async function memberHistory(input = {}) {
  let { groupId, userId, limit = 50 } = await normalizeActionArgs(input, ['groupId', 'userId', 'limit']);
  const config = loadConfig();
  const gid = Number(groupId), uid = Number(userId);
  if (!Number.isFinite(gid) || !Number.isFinite(uid) || gid <= 0 || uid <= 0) throw new Error('groupId 和 userId 必须为有效数字。');
  limit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const history = await getHistory(redisClient(), config, gid, uid);
  return {
    groupId: gid,
    userId: uid,
    totalRecords: history.length,
    truncated: history.length > limit,
    records: history.slice(-limit)
  };
}