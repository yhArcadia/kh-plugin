/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:55:33
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 19:57:45
 * @FilePath: /kh-plugin/guoba/actions/blacklist.js
 * @Description: 黑名单预览
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadConfig } from '../../components/config.js';
import { scanHistoryKeys, getHistory } from '../../components/storage.js';
import { redisClient, parseKey } from './helpers.js';

export async function blacklistPreview() {
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