import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import { formatDuration } from '../utils/format.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { WhoApp } from '../components/base-app.js';
import {
    config,
    headDir,
    scanLegacyKeys
} from '../components/runtime.js';
import { log } from '../utils/logger.js';

export class WhoRanking extends WhoApp {
    constructor() {
        super({
            name: 'Who插件-排行榜',
            dsc: 'WhoAreYou 排行榜',
            priority: 5000, startScheduler: false,
            rule: [
                {
                    reg: '^#(换头|马甲|专一|潜水|活跃|冒泡)大王$|^#(老|小)资历$',
                    fnc: 'showRank'
                },
                {
                    reg: '^#(最老|最短|最新|最小|最年轻|最长)(QQ|qq)$',
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
        }

        let tempMsgId = null;
        const res = await e.reply(`正在统计本群的${rankTitle}，请稍候...`);
        if (res && res.message_id) {
            tempMsgId = res.message_id;
        }

        // 如果潜水大王，先拉取名单来过滤退群的人
        let currentMemberMap = null;
        if (rankType === 'diver' || rankType === 'active' || isQQRank) {
            try {
                currentMemberMap = await e.group.getMemberMap();
            } catch (err) {
                log.w(`获取群成员列表失败，排行榜无法过滤已退群成员: ${err}`);
            }
        }

        const keys = await scanLegacyKeys(`${config.redisPrefix}:${e.group_id}:*`);
        const prefix = `${config.redisPrefix}:${e.group_id}:`;
        const userKeys = keys.filter(k => /^\d+$/.test(k.slice(prefix.length)));

        if (userKeys.length === 0) {
            await e.reply("本群暂无任何身份记录。");
            return true;
        }

        let rankList = [];
        const nowMs = Date.now();
        const nowSec = Math.floor(nowMs / 1000);

        // 2. 遍历并计算每个人的分数
        for (const key of userKeys) {
            const uid = parseInt(key.split(':').pop());
            const historyJson = await redis.get(key);
            if (!historyJson) continue;

            let history = [];
            try {
                history = JSON.parse(historyJson);
            } catch (err) { continue; }

            if (history.length === 0) continue;
            if ((rankType === 'avatar' || rankType === 'vest') && history.length <= 1) continue;

            let score = 0;
            let displayScore = ""; // 专门用于显示的格式化文字
            const latestRecord = history[history.length - 1];

            if (rankType === 'avatar') {
                const uniqueHeads = new Set();
                for (const r of history) {
                    if (r.headtime && r.headtime !== 631152000000) {
                        uniqueHeads.add(r.headtime);
                    }
                }
                score = uniqueHeads.size;
                displayScore = `${score} 次`;
            } else if (rankType === 'vest') {
                score = history.length;
                displayScore = `${score} 次`;
            } else if (rankType === 'loyal') {
                let validHeadtime = null;
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].headtime && history[i].headtime !== 631152000000) {
                        validHeadtime = history[i].headtime;
                        break;
                    }
                }
                if (validHeadtime) {
                    // 秒数
                    score = Math.max(0, Math.floor((nowMs - validHeadtime) / 1000));
                    displayScore = formatDuration(score);
                }
            } else if (rankType === 'veteran' || rankType === 'newbie') {
                if (isQQRank) {
                    score = uid;
                    displayScore = uid.toString();
                }
                else if (latestRecord.join_time) {
                    score = Math.max(0, nowSec - latestRecord.join_time);
                    displayScore = formatDuration(score);
                }
            } else if (rankType === 'diver' || rankType === 'active' || isQQRank) {
                if (currentMemberMap && !currentMemberMap.has(uid)) continue; // 人已经不在群里，跳过
                if (latestRecord.last_sent_time) {
                    score = Math.max(0, nowSec - latestRecord.last_sent_time);
                    displayScore = formatDuration(score);
                    if (rankType === 'active') {
                        displayScore = score <= 10 ? "刚刚" : displayScore + "前";
                    }
                }
            }

            // 此处允许 active 的得分为 0
            if (score <= 0 && rankType !== 'newbie' && rankType !== 'active') continue;
            if ((rankType === 'veteran' || rankType === 'newbie') && latestRecord.join_time === 0) continue;
            if ((rankType === 'diver' || rankType === 'active') && (!latestRecord.last_sent_time || latestRecord.last_sent_time === 0)) continue;

            const displayName = latestRecord.card || latestRecord.nickname || uid.toString();
            let avatarBase64 = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uid}`;

            if (latestRecord.headtime) {
                const headPicPath = path.join(headDir, `${e.group_id}_${uid}_${latestRecord.headtime}.jpg`);
                if (fs.existsSync(headPicPath)) {
                    try {
                        const avatarBuf = fs.readFileSync(headPicPath);
                        avatarBase64 = `data:image/jpeg;base64,${avatarBuf.toString('base64')}`;
                    } catch (err) { }
                }
            }

            rankList.push({ uid, displayName, score, displayScore, avatar: avatarBase64 });
        }

        // 3. 动态排序
        if (isAscending) {
            rankList.sort((a, b) => a.score - b.score);
        } else {
            rankList.sort((a, b) => b.score - a.score);
        }

        const topN = rankList.slice(0, config.rankLimit);

        if (topN.length === 0) {
            await e.reply(`数据不足，暂无${rankTitle}诞生。`);
            return true;
        }

        // 4. 渲染
        try {
            let gname = e.group_name || e.group_id.toString();
            const img = await this.rankRender(e.group_id, gname, topN, rankType, rankTitle);
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
