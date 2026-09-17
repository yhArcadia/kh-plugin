/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-03 22:39:10
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-17 17:12:24
 * @FilePath: /kh-plugin/apps/ranking.js
 * @Description: 群员排行
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

//排行渲染精度动态限制: [记录数阈值, 最高渲染精度]从上到下依次匹配
const RANK_SCALE_LIMITS = [
    [50, 300], //50以内
    [100, 200], //50-100
    [150, 150], //100-150
    [200, 100], //150-200
    [250, 90],
    [300, 80],
    [350, 70], 
    [400, 60], //350-400
    [450, 50], //表示超过400条的
];
const RANK_SCALE_FALLBACK = RANK_SCALE_LIMITS[RANK_SCALE_LIMITS.length - 1][1];

function capRankScale(recordCount, userScale) {
    for (const [threshold, maxScale] of RANK_SCALE_LIMITS) {
        if (recordCount <= threshold) return Math.min(userScale, maxScale);
    }
    return Math.min(userScale, RANK_SCALE_FALLBACK);
}

import fs from 'node:fs';
import { formatDuration } from '../utils/format.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { BaseApp } from '../components/base-app.js';
import { resolveHeadPath } from '../components/paths.js';
import { encodeRedisUid } from '../utils/uid-encoder.js';
import {
    config,
    scanLegacyKeys
} from '../components/runtime.js';
import { log } from '../utils/logger.js';
import { batchGetHistory } from '../components/storage.js';
import {
    computeVestScore,
    computeAvatarScore,
    computeLoyalScore,
    computeVeteranScore,
    computeSilenceScore,
    computeQqScore
} from '../components/rank-scores.js';

const rankCdMap = new Map();
const RANK_CD_MS = 10_000;

function checkAndSetRankCD(gid) {
    const now = Date.now();
    const expireAt = rankCdMap.get(gid);
    if (expireAt && expireAt > now) return true;
    rankCdMap.set(gid, now + RANK_CD_MS);
    return false;
}

function extractPromotedUids(e) {
    const segments = Array.isArray(e?.message) ? e.message : [];
    const uids = [];
    const seen = new Set();
    for (const segment of segments) {
        if (segment?.type !== 'at') continue;
        const rawUid = segment.qq ?? segment.data?.qq ?? segment.user_id ?? segment.data?.user_id;
        const uid = String(rawUid ?? '').trim();
        if (!/^\d+$/.test(uid) || uid === 'all' || seen.has(uid)) continue;
        seen.add(uid);
        uids.push(Number(uid));
    }
    if (uids.length > 0) return uids;
    const senderUid = Number(e?.user_id);
    return Number.isSafeInteger(senderUid) && senderUid > 0 ? [senderUid] : [];
}

function buildDisplayRankList(rankList, promotedUids, limit) {
    const rankedList = rankList.map((item, index) => ({ ...item, originalRank: index + 1 }));
    const byUid = new Map(rankedList.map(item => [Number(item.uid), item]));
    const promoted = [];
    const promotedSet = new Set();
    for (const uid of promotedUids) {
        const item = byUid.get(Number(uid));
        if (!item || promotedSet.has(item.uid)) continue;
        promotedSet.add(item.uid);
        promoted.push(item);
    }
    const ordinary = rankedList
        .slice(0, limit)
        .filter(item => !promotedSet.has(item.uid));
    return [...promoted, ...ordinary];
}

export class KhRanking extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-排行榜',
            dsc: 'kh插件 排行榜',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(换头|马甲|专一|潜水|活跃|冒泡|加群)大王$|^#(老|小)资历$',
                    fnc: 'showRank'
                },
                {
                    reg: '^#?(最老|最短|最新|最小|最年轻|最长)(QQ|qq)$',
                    fnc: 'showRank'
                },
                {
                    reg: '^#最亲群友$',
                    fnc: 'showRank'
                }
            ]
        });
    }

    async showRank(e) {

        if (isDivingGroup(e, config)) return false;
        if (!e.isGroup) {
            await e.reply("大王排行榜只能在群聊中使用哦！");
            return true;
        }

        if (checkAndSetRankCD(e.group_id)) {
            await e.reply("请10秒后再试~", true, { recallMsg: 10 });
            return true;
        }

        // 1. 判定排行榜类型与参数
        let rankType = 'vest';
        let rankTitle = '马甲大王';
        let isAscending = false;
        let isQQRank = false;

        if (e.msg.includes("换头")) {
            rankType = 'avatar';
            rankTitle = '换头大王';
        } else if (e.msg.includes("专一") || e.msg.includes("钉子户")) {
            rankType = 'loyal';
            rankTitle = '头像钉子户';
        } else if (e.msg.includes("潜水")) {
            rankType = 'diver';
            rankTitle = '潜水大王';
        } else if (e.msg.includes("活跃") || e.msg.includes("冒泡")) {
            rankType = 'active';
            rankTitle = '近期发言';
            isAscending = true;
        } else if (e.msg.includes("加群")) {
            rankType = 'join';
            rankTitle = '加群大王';
        } else if (e.msg.includes("老资历")) {
            rankType = 'veteran';
            rankTitle = '老资历';
        } else if (e.msg.includes("小资历")) {
            rankType = 'newbie';
            rankTitle = '小资历';
            isAscending = true;
        } else if (e.msg.match(/最老|最短|最小/)) {
            rankType = 'veteran';
            rankTitle = '最老号码';
            isAscending = true;
            isQQRank = true;
        } else if (e.msg.match(/最新|最长|最年轻/)) {
            rankType = 'newbie';
            rankTitle = '最新号码';
            isAscending = false;
            isQQRank = true;
        } else if (e.msg.includes("最亲群友")) {
            rankType = 'intimate';
            rankTitle = '最亲群友';
        }

        // 检查互通组
        const currentGroupId = Number(e.group_id);
        const matchedLinkedGroups = Array.isArray(config.linkedGroups)
            ? config.linkedGroups.filter(groupIds => groupIds.includes(currentGroupId))
            : [];
        const joinedGroupIds = (rankType === 'join' || rankType === 'intimate')
            ? [...new Set(matchedLinkedGroups.flat().map(Number).filter(Number.isSafeInteger))]
            : [currentGroupId];
        if ((rankType === 'join' || rankType === 'intimate') && joinedGroupIds.length === 0) {
            await e.reply(`本群尚未配置互通群组，无法统计${rankTitle}。`);
            return true;
        }

        // 受理反馈
        let tempMsgId = null;
        const res = await e.reply(`正在统计本群的${rankTitle}，请稍候...`);
        if (res && res.message_id) {
            tempMsgId = res.message_id;
        }

        // 过滤已退群成员
        let currentMemberMap = null;
        if (rankType === 'diver' || rankType === 'active' || isQQRank || rankType === 'join' || rankType === 'intimate') {
            try {
                currentMemberMap = await e.group.getMemberMap();
            } catch (err) {
                log.w(`获取群成员列表失败，排行榜无法过滤已退群成员: ${err}`);
            }
        }

        // 加群大王/最亲群友 只判断qq,降低内存占用
        const joinedMemberSets = new Map();
        if (rankType === 'join' || rankType === 'intimate') {
            for (const groupId of joinedGroupIds) {
                if (groupId === currentGroupId) {
                    joinedMemberSets.set(groupId, currentMemberMap instanceof Map ? new Set(currentMemberMap.keys()) : null);
                    continue;
                }
                try {
                    const group = e.bot?.pickGroup?.(groupId);
                    const memberMap = group?.getMemberMap ? await group.getMemberMap() : null;
                    joinedMemberSets.set(groupId, memberMap instanceof Map ? new Set(memberMap.keys()) : null);
                } catch (err) {
                    joinedMemberSets.set(groupId, null);
                    log.w(`获取互通群 ${groupId} 成员列表失败，将使用 KH 历史记录补充。`);
                }
            }
        }

        const keys = await scanLegacyKeys(`${config.redisPrefix}:${e.group_id}:*`);
        const joinedHistoryUserSets = new Map();
        if (rankType === 'join' || rankType === 'intimate') {
            for (const groupId of joinedGroupIds) {
                const groupKeys = groupId === currentGroupId
                    ? keys
                    : await scanLegacyKeys(`${config.redisPrefix}:${groupId}:*`);
                const groupPrefix = `${config.redisPrefix}:${groupId}:`;
                joinedHistoryUserSets.set(groupId, new Set(
                    groupKeys
                        .map(key => key.slice(groupPrefix.length))
                        .filter(uid => /^[^:]+$/.test(uid))
                        .map(Number)
                ));
            }
        }
        const prefix = `${config.redisPrefix}:${e.group_id}:`;
        const userKeys = (rankType === 'join' || rankType === 'intimate') && currentMemberMap instanceof Map
            ? [...currentMemberMap.keys()].map(uid => `${prefix}${encodeRedisUid(uid)}`)
            : keys.filter(k => /^[^:]+$/.test(k.slice(prefix.length)));

        if (userKeys.length === 0) {
            await e.reply("本群暂无任何身份记录。");
            return true;
        }

        let rankList = [];
        const nowMs = Date.now();
        const nowSec = Math.floor(nowMs / 1000);

        // 2. 预取所有用户的 Redis 数据
        const historyMap = await batchGetHistory(redis, userKeys);

        // 最亲群友：先确定触发者在哪些互通组中，再构建每个群友的共同群计数
        let commonGroupCount = null;
        if (rankType === 'intimate') {
            const triggerUid = Number(e.user_id);
            const triggerGroups = new Set();
            for (const groupId of joinedGroupIds) {
                const memberSet = joinedMemberSets.get(groupId);
                if (memberSet instanceof Set && memberSet.has(triggerUid)) {
                    triggerGroups.add(groupId);
                    continue;
                }
                if (joinedHistoryUserSets.get(groupId)?.has(triggerUid)) {
                    triggerGroups.add(groupId);
                }
            }

            commonGroupCount = new Map();
            for (const groupId of triggerGroups) {
                const memberSet = joinedMemberSets.get(groupId);
                if (memberSet instanceof Set) {
                    for (const uid of memberSet) {
                        if (uid === triggerUid) continue;
                        commonGroupCount.set(uid, (commonGroupCount.get(uid) || 0) + 1);
                    }
                }
                const historySet = joinedHistoryUserSets.get(groupId);
                if (historySet) {
                    for (const uid of historySet) {
                        if (uid === triggerUid) continue;
                        // 只计入未被实时名单覆盖的用户，避免重复计数
                        const ms = joinedMemberSets.get(groupId);
                        if (!(ms instanceof Set && ms.has(uid))) {
                            commonGroupCount.set(uid, (commonGroupCount.get(uid) || 0) + 1);
                        }
                    }
                }
            }
        }

        // 3. 遍历并计算每个人的分数
        for (const key of userKeys) {
            const uid = parseInt(key.split(':').pop());
            const historyJson = historyMap.get(key);
            if (!historyJson) continue;

            let history = [];
            try {
                history = historyJson ? JSON.parse(historyJson) : [];
            } catch (err) { continue; }

            if (rankType !== 'join' && rankType !== 'intimate' && history.length === 0) continue;
            if ((rankType === 'avatar' || rankType === 'vest') && history.length <= 1) continue;

            let score = 0;
            let displayScore = ""; // 专门用于显示的格式化文字
            let silenceDuration = null;
            let silenceDisplay = "";
            let silenceRatio = null;
            const latestRecord = history[history.length - 1] || {};

            if (rankType === 'join') {
                for (const groupId of joinedGroupIds) {
                    const memberSet = joinedMemberSets.get(groupId);
                    if (memberSet instanceof Set && memberSet.has(uid)) {
                        score++;
                        continue;
                    }
                    // 实时名单中没有时，仍保留 KH 历史记录：历史上加入过也计入。
                    if (joinedHistoryUserSets.get(groupId)?.has(uid)) score++;
                }
                displayScore = `${score} 个群`;
            } else if (rankType === 'intimate') {
                if (currentMemberMap && !currentMemberMap.has(uid)) continue;
                if (uid === Number(e.user_id)) continue;
                score = commonGroupCount?.get(uid) || 0;
                if (score <= 0) continue;
                displayScore = `你们有${score}个共同群`;
            } else if (rankType === 'avatar') {
                score = computeAvatarScore(history);
                displayScore = `${score} 次`;
            } else if (rankType === 'vest') {
                score = computeVestScore(history);
                displayScore = `${score} 次`;
            } else if (rankType === 'loyal') {
                score = computeLoyalScore(history, nowMs);
                if (score != null) displayScore = formatDuration(score);
            } else if (rankType === 'veteran' || rankType === 'newbie') {
                if (isQQRank) {
                    score = computeQqScore(uid);
                    displayScore = uid.toString();
                } else {
                    score = computeVeteranScore(latestRecord, nowSec);
                    if (score != null) {
                        displayScore = formatDuration(score);
                        if (latestRecord.last_sent_time) {
                            const totalDuration = Math.max(1, nowSec - latestRecord.join_time);
                            silenceDuration = computeSilenceScore(latestRecord, nowSec);
                            if (silenceDuration != null) {
                                silenceDisplay = formatDuration(silenceDuration);
                                silenceRatio = Math.max(0, Math.min(1, silenceDuration / totalDuration));
                            }
                        }
                    }
                }
            } else if (rankType === 'diver' || rankType === 'active' || isQQRank) {
                if (currentMemberMap && !currentMemberMap.has(uid)) continue; // 人已经不在群里，跳过
                score = computeSilenceScore(latestRecord, nowSec);
                if (score != null) {
                    displayScore = formatDuration(score);
                    if (rankType === 'active') {
                        displayScore = score <= 10 ? "刚刚" : displayScore + "前";
                    }
                }
            }

            if (rankType === 'join' && score <= 0) continue;
            // 此处允许 active 的得分为 0
            if (score <= 0 && rankType !== 'newbie' && rankType !== 'active') continue;
            if ((rankType === 'veteran' || rankType === 'newbie') && latestRecord.join_time === 0) continue;
            if ((rankType === 'diver' || rankType === 'active') && (!latestRecord.last_sent_time || latestRecord.last_sent_time === 0)) continue;

            const displayName = latestRecord.card || latestRecord.nickname || uid.toString();
            let avatarBase64 = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uid}`;

            if (latestRecord.headtime) {
                const headPicPath = resolveHeadPath(uid, latestRecord.headtime, e.group_id);
                if (headPicPath) {
                    try {
                        const avatarBuf = fs.readFileSync(headPicPath);
                        avatarBase64 = `data:image/jpeg;base64,${avatarBuf.toString('base64')}`;
                    } catch (err) { }
                }
            }

            rankList.push({
                uid, displayName, score, displayScore, avatar: avatarBase64,
                silenceDuration,
                silenceDisplay,
                silenceRatio,
                showSilenceMarker: (rankType === 'veteran' || rankType === 'newbie') && silenceRatio !== null
            });
        }

        // 4. 动态排序
        if (isAscending) {
            rankList.sort((a, b) => a.score - b.score);
        } else {
            rankList.sort((a, b) => b.score - a.score);
        }

        const promotedUids = extractPromotedUids(e);
        const topN = buildDisplayRankList(rankList, promotedUids, config.rankLimit);

        if (topN.length === 0) {
            await e.reply(`数据不足，暂无${rankTitle}诞生。`);
            return true;
        }

        // 5. 渲染
        try {
            let gname = e.group_name || e.group_id.toString();
            const effectiveScale = capRankScale(topN.length, config.renderScale);
            const img = await this.rankRender(e.group_id, gname, topN, rankType, rankTitle, effectiveScale);
            if (img) {
                await e.reply(img);
                if (tempMsgId && e.group) {
                    try {
                        await e.group.recallMsg(tempMsgId);
                    } catch (recallErr) {
                        log.e(`撤回排行榜提示消息失败: ${recallErr.message}`);
                    }
                }
            }
        } catch (err) {
            log.e(`生成排行榜失败: ${err}`);
            await e.reply("生成排行榜时发生错误。");
        }
        return true;

    }
}