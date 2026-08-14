/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-11 19:11:22
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-14 23:11:58
 * @FilePath: /kh-plugin/components/operation-lock.js
 * @Description: 操作锁
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { randomUUID } from 'node:crypto';

const RENEW_IF_OWNER = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_IF_OWNER = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

async function evalScript(redis, script, key, args) {
  try {
    return await redis.eval(script, { keys: [key], arguments: args.map(String) });
  } catch (firstError) {
    try {
      return await redis.eval(script, 1, key, ...args.map(String));
    } catch (secondError) {
      secondError.cause ??= firstError;
      throw secondError;
    }
  }
}

// 新的锁
export async function acquireOperationLock(redis, key, ttlSeconds, type = 'operation') {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 60));
  const token = `${type}:${randomUUID()}`;
  const acquired = await redis.set(key, token, { NX: true, EX: ttl });
  if (!acquired) return null;

  let released = false;
  return {
    key,
    token,
    type,
    ttl,
    async owns() {
      return (await redis.get(key)) === token;
    },
    async renew() {
      if (released) return false;
      return Number(await evalScript(redis, RENEW_IF_OWNER, key, [token, ttl])) === 1;
    },
    async release() {
      if (released) return false;
      released = true;
      return Number(await evalScript(redis, RELEASE_IF_OWNER, key, [token])) === 1;
    }
  };
}

export function startLockRenewer(lock, intervalMs, onLost) {
  let stopped = false;
  let running = false;
  const interval = setInterval(async () => {
    if (stopped || running) return;
    running = true;
    try {
      if (!await lock.renew()) {
        stopped = true;
        clearInterval(interval);
        onLost?.();
      }
    } catch (error) {
      stopped = true;
      clearInterval(interval);
      onLost?.(error);
    } finally {
      running = false;
    }
  }, Math.max(1_000, Math.floor(intervalMs)));
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
