/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-12 15:55:45
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-12 16:33:02
 * @FilePath: /kh-plugin/components/rank-scores.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
export function computeVestScore(history) {
    return history.length;
}

export function computeAvatarScore(history) {
    const uniqueHeads = new Set();
    for (const r of history) {
        if (r.headtime && r.headtime !== 631152000000) {
            uniqueHeads.add(r.headtime);
        }
    }
    return uniqueHeads.size;
}

export function computeLoyalScore(history, nowMs) {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].headtime && history[i].headtime !== 631152000000) {
            return Math.max(0, Math.floor((nowMs - history[i].headtime) / 1000));
        }
    }
    return null;
}

export function computeVeteranScore(latestRecord, nowSec) {
    return latestRecord.join_time ? Math.max(0, nowSec - latestRecord.join_time) : null;
}

export function computeSilenceScore(latestRecord, nowSec) {
    return latestRecord.last_sent_time ? Math.max(0, nowSec - latestRecord.last_sent_time) : null;
}

export function computeQqScore(userId) {
    return Number(userId);
}