/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-12 00:39:08
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-12 00:44:26
 * @FilePath: /kh-plugin/guoba/actions/search.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadConfig } from '../../components/config.js';
import { scanHistoryKeys, getHistory } from '../../components/storage.js';
import { redisClient, parseKey, normalizeActionArgs } from './helpers.js';

export async function search(input = {}) {
  let { query, limit = 20 } = await normalizeActionArgs(input, ['query', 'limit']);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { items: [], total: 0, query: q };

  limit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const isNumeric = /^\d+$/.test(q);

  const config = loadConfig();
  const keys = await scanHistoryKeys(redisClient(), config, null, {
    count: 250,
    maxKeys: 20000
  });

  const bot = globalThis.Bot;
  const results = [];

  for (const key of keys) {
    const parsed = parseKey(key, config.redisPrefix);
    if (!parsed) continue;

    const uidStr = String(parsed.userId);

    if (isNumeric) {
      if (!uidStr.includes(q)) continue;
    }

    const history = await getHistory(redisClient(), config, parsed.groupId, parsed.userId);
    if (history.length === 0 && !isNumeric) continue;

    if (!isNumeric) {
      const latest = history.at(-1) || {};
      const nickname = String(latest.nickname || '').toLowerCase();
      const card = String(latest.card || '').toLowerCase();
      if (!nickname.includes(q) && !card.includes(q)) continue;
    }

    const latest = history.at(-1) || {};
    let groupName = String(parsed.groupId);
    if (bot) {
      try {
        const gl = bot.gl?.get(Number(parsed.groupId)) || bot.gl?.get(String(parsed.groupId));
        if (gl) groupName = gl.group_name || gl.name || groupName;
      } catch {}
    }

    results.push({
      userId: parsed.userId,
      groupId: parsed.groupId,
      groupName,
      nickname: latest.nickname || '',
      card: latest.card || '',
      records: history.length,
      latestRecordTime: latest.recordTime || ''
    });

    if (results.length >= limit) break;
  }

  return {
    items: results,
    total: results.length,
    capped: results.length >= limit,
    query: q
  };
}