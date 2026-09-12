/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:55:19
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-12 15:58:16
 * @FilePath: /kh-plugin/guoba/actions/members.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadConfig } from '../../components/config.js';
import { scanHistoryKeys, getHistory, batchGetHistory } from '../../components/storage.js';
import { redisClient, parseKey, normalizeActionArgs } from './helpers.js';
import {
    computeVestScore,
    computeAvatarScore,
    computeLoyalScore,
    computeVeteranScore,
    computeSilenceScore
} from '../../components/rank-scores.js';

export async function members(input = {}) {
  let { groupId, page = 1, pageSize = 30, sortBy } = await normalizeActionArgs(
    input, ['groupId', 'page', 'pageSize', 'sortBy']
  );
  const config = loadConfig();
  const gid = Number(groupId);
  if (!Number.isFinite(gid) || gid <= 0) throw new Error('groupId 必须是有效群号。');
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 30)));

  if (sortBy) {
    return membersRanked(config, gid, page, pageSize, sortBy);
  }

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

const SORT_SCORE_MAP = {
    vest: 'vestScore',
    avatar: 'avatarScore',
    loyal: 'loyalScore',
    veteran: 'veteranScore',
    newbie: 'veteranScore',
    diver: 'diverScore',
    active: 'diverScore',
    join: 'joinScore'
};

const ASC_SORT_BY = new Set(['newbie', 'active']);

async function membersRanked(config, gid, page, pageSize, sortBy) {
    const redis = redisClient();
    const keys = await scanHistoryKeys(redis, config, gid, { count: 250, maxKeys: 10000 });
    const prefix = `${config.redisPrefix}:${gid}:`;

    const historyMap = await batchGetHistory(redis, keys);
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    let joinedSets = null;
    if (sortBy === 'join') {
        const linkedGroups = (Array.isArray(config.linkedGroups)
            ? config.linkedGroups.filter(ids => ids.includes(gid))
            : []).flat().map(Number).filter(id => Number.isSafeInteger(id) && id !== gid);
        joinedSets = new Map();
        for (const lgid of linkedGroups) {
            const lgKeys = await scanHistoryKeys(redis, config, lgid, { count: 250, maxKeys: 5000 });
            const lgPrefix = `${config.redisPrefix}:${lgid}:`;
            joinedSets.set(lgid, new Set(
                lgKeys.map(k => k.slice(lgPrefix.length)).filter(uid => /^[^:]+$/.test(uid)).map(Number)
            ));
        }
    }

    const items = [];
    for (const key of keys) {
        const historyJson = historyMap.get(key);
        if (!historyJson) continue;

        const encodedUid = key.slice(prefix.length);
        const userId = Number(encodedUid);
        if (!Number.isFinite(userId) || userId <= 0) continue;

        let history = [];
        try { history = JSON.parse(historyJson); } catch { continue; }
        const latest = history[history.length - 1] || {};

        const vestScore = computeVestScore(history);
        const avatarScore = history.length > 1 ? computeAvatarScore(history) : null;
        const loyalScore = computeLoyalScore(history, nowMs);
        const veteranScore = computeVeteranScore(latest, nowSec);
        const diverScore = computeSilenceScore(latest, nowSec);

        let joinScore = null;
        if (joinedSets) {
            let count = 0;
            for (const set of joinedSets.values()) {
                if (set.has(userId)) count++;
            }
            joinScore = count;
        }

        if (sortBy === 'avatar' && (avatarScore == null || avatarScore <= 0)) continue;
        if (sortBy === 'loyal' && (loyalScore == null || loyalScore <= 0)) continue;
        if ((sortBy === 'veteran' || sortBy === 'newbie') && (veteranScore == null || veteranScore <= 0)) continue;
        if ((sortBy === 'diver' || sortBy === 'active') && (diverScore == null || diverScore <= 0)) continue;
        if (sortBy === 'join' && (joinScore == null || joinScore <= 0)) continue;

        items.push({
            userId,
            records: vestScore,
            nickname: latest.nickname || '',
            card: latest.card || '',
            title: latest.title || '',
            recordTime: latest.recordTime || '',
            avatarChangedAt: latest.headtime || null,
            vestScore,
            avatarScore,
            loyalScore,
            veteranScore,
            diverScore,
            joinScore
        });
    }

    if (sortBy === 'recordTime') {
        items.sort((a, b) => {
            const ta = a.recordTime ? new Date(a.recordTime.replace(/-/g, '/')).getTime() : 0;
            const tb = b.recordTime ? new Date(b.recordTime.replace(/-/g, '/')).getTime() : 0;
            return tb - ta;
        });
    } else if (sortBy === 'qq') {
        items.sort((a, b) => b.userId - a.userId);
    } else {
        const scoreField = SORT_SCORE_MAP[sortBy] || 'vestScore';
        const asc = ASC_SORT_BY.has(sortBy);
        items.sort((a, b) => {
            const va = a[scoreField] ?? 0;
            const vb = b[scoreField] ?? 0;
            return asc ? va - vb : vb - va;
        });
    }

    const totalMembers = items.length;
    const slice = items.slice((page - 1) * pageSize, page * pageSize);

    return {
        groupId: gid,
        page,
        pageSize,
        totalMembers,
        capped: keys.length >= 10000,
        sortBy,
        items: slice
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
    records: history.slice(-limit).map(r => ({
      ...r,
      localAvatarUrl: r.headtime ? `/kh-plugin/dashboard/avatar?uid=${r.user_id || uid}&headtime=${r.headtime}&gid=${gid}` : null
    }))
  };
}