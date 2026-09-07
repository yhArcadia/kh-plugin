/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-12 18:18:58
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-08 00:50:10
 * @FilePath: /kh-plugin/components/storage.js
 * @Description: 存取
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */


import { encodeRedisUid } from '../utils/uid-encoder.js';

export function historyKey(config, gid, uid) { return `${config.redisPrefix}:${gid}:${encodeRedisUid(uid)}`; }
export function remarkKey(config, gid, uid) { return `${config.redisPrefix}:remark:${gid}:${encodeRedisUid(uid)}`; }
const historySuffix = /^\d+:[^:]+$/;

export function parseHistoryKey(key, prefix) {
    const suffix = key.slice(prefix.length);
    const colonIdx = suffix.indexOf(':');
    if (colonIdx === -1) return null;
    return {
        gid: suffix.slice(0, colonIdx),
        encodedUid: suffix.slice(colonIdx + 1)
    };
}


export async function scanKeys(redis, pattern, { count = 250, maxKeys = 10000, callback } = {}) {
  const out = [];
  let cursor = '0';
  do {
    let reply;
    try {
      reply = await redis.scan(cursor, { MATCH: pattern, COUNT: count });
    } catch {
      reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    }
    const next = Array.isArray(reply) ? reply[0] : reply?.cursor;
    const keys = Array.isArray(reply) ? reply[1] : reply?.keys;
    cursor = String(next ?? '0');
    for (const key of keys || []) {
      if (callback) {
        await callback(key);
      } else {
        out.push(key);
        if (out.length >= maxKeys) return out;
      }
    }
  } while (cursor !== '0');
  return out;
}


export async function scanHistoryKeys(redis, config, gid, options = {}) {
  const prefix = gid == null ? `${config.redisPrefix}:` : `${config.redisPrefix}:${gid}:`;
  const keys = await scanKeys(redis, `${prefix}*`, options);
  return keys.filter(key => historySuffix.test(key.slice(config.redisPrefix.length + 1)));
}

export function parseHistory(raw) {
  if (raw == null) return { exists: false, corrupt: false, history: [] };
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return { exists: true, corrupt: false, history: value };
    return { exists: true, corrupt: true, history: [] };
  } catch {
    return { exists: true, corrupt: true, history: [] };
  }
}

export async function getHistoryDetailed(redis, config, gid, uid) {
  const key = historyKey(config, gid, uid);
  const parsed = parseHistory(await redis.get(key));
  return { key, ...parsed };
}

export async function getHistory(redis, config, gid, uid) {
  return (await getHistoryDetailed(redis, config, gid, uid)).history;
}

export async function setHistory(redis, config, gid, uid, history) {
  return redis.set(historyKey(config, gid, uid), JSON.stringify(history));
}

export async function getRemarks(redis, config, gid, uid) {
  const raw = await redis.get(remarkKey(config, gid, uid));
  try {
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}