import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import { isDivingGroup } from '../utils/group-policy.js';
import { WhoApp } from '../components/base-app.js';
import {
    config,
    headDir,
    memberUpdater,
    scanLegacyKeys,
    checkAndSetMonitorCD
} from '../components/runtime.js';
import { log } from '../utils/logger.js';

export class WhoDebug extends WhoApp {
    constructor() {
        super({
            name: 'Who插件-调试工具',
            dsc: 'WhoAreYou 调试工具',
            priority: 5000,
            startScheduler: false,
            rule: [
                {
                    reg: '^#records?$',
                    fnc: 'showRawRecords'
                }
            ]
        });
    }

    async showRawRecords(e) {

        if (isDivingGroup(e, config) || !e.isMaster) return false;
        if (!e.isGroup) {
            await e.reply("该功能只能在群聊中使用哦！");
            return true;
        }

        let targetUid = e.user_id; // 默认自己
        if (e.at) {
            targetUid = e.at;
        } else {
            const match = e.msg.match(/\d+/);
            if (match) targetUid = parseInt(match[0], 10);
        }

        const redisKey = `${config.redisPrefix}:${e.group_id}:${targetUid}`;
        const historyJson = await redis.get(redisKey);

        if (!historyJson) {
            await e.reply(`未找到用户 ${targetUid} 在本群的任何原始记录。`);
            return true;
        }

        let history = [];
        try {
            history = JSON.parse(historyJson);
        } catch (err) {
            await e.reply(`解析用户 ${targetUid} 记录失败，JSON格式损坏: ${err.message}`);
            return true;
        }

        if (history.length === 0) {
            await e.reply(`用户 ${targetUid} 在本群的原始记录数组为空 []。`);
            return true;
        }

        // await e.reply(`正在打包用户 ${targetUid} 的 ${history.length} 条原始记录...`);

        let forwardMsgData = [];
        const uniqueHeadtimes = new Set();

        forwardMsgData.push({
            message: `${redisKey}\n用户：${targetUid}\n所在群聊：${e.group_name || e.group_id}\n记录总数：${history.length} 条`,
            nickname: e.bot?.nickname || " ",
            user_id: e.bot?.uin || 0
        });

        for (let i = 0; i < history.length; i++) {
            const record = history[i];

            if (record.headtime && record.headtime !== 631152000000) {
                uniqueHeadtimes.add(record.headtime);
            }
            const recordStr = JSON.stringify(history[i], null, 4);

            forwardMsgData.push({
                message: `【第 ${i + 1} 条】\n${recordStr}`,
                nickname: e.bot?.nickname || " ",
                user_id: e.bot?.uin || 0
            });
        }

        // 头像文件
        if (uniqueHeadtimes.size > 0) {
            // forwardMsgData.push({
            //     message: `========== 头像文件 (共 ${uniqueHeadtimes.size} 张) ==========`,
            //     nickname: e.bot?.nickname || " ",
            //     user_id: e.bot?.uin || 0
            // });

            for (const headtime of uniqueHeadtimes) {
                const fileName = `${e.group_id}_${targetUid}_${headtime}.jpg`;
                const headPicPath = path.join(headDir, fileName);
                const relativePath = path.relative(process.cwd(), headPicPath).replace(/\\/g, '/');

                if (fs.existsSync(headPicPath)) {
                    const timeStr = moment(parseInt(headtime)).format('YYYY-MM-DD HH:mm:ss');

                    forwardMsgData.push({
                        message: [
                            `头像文件：${relativePath}\n对应时间：${timeStr}`,
                            segment.image(headPicPath)
                        ],
                        nickname: e.bot?.nickname || " ",
                        user_id: e.bot?.uin || 0
                    });
                } else {
                    // 缓存丢失
                    forwardMsgData.push({
                        message: `头像文件：${relativePath}\n该图片文件在磁盘本地缓存中未找到或已被清理。`,
                        nickname: e.bot?.nickname || " ",
                        user_id: e.bot?.uin || 0
                    });
                }
            }
        } else {
            forwardMsgData.push({
                message: `未在本地找到该用户的头像。`,
                nickname: e.bot?.nickname || " ",
                user_id: e.bot?.uin || 0
            });
        }

        // 4. 发送合并转发
        try {
            const forwardMsg = await e.group.makeForwardMsg(forwardMsgData);
            await e.reply(forwardMsg);
        } catch (err) {
            log.e(`发送原始记录合并转发失败: ${err}`);
            await e.reply("发送合并转发失败，可能是单条文本过长或遭到了风控拦截。");
        }

        return true;

    }
}
