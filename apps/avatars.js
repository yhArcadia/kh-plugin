import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import { BaseApp } from '../components/base-app.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { headDir, config } from '../components/runtime.js';
import { getHistoryDetailed } from '../components/storage.js';
import { log } from '../utils/logger.js';

export class Avatars extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-历史头像',
            dsc: 'kh插件 历史头像',
            priority: 5000,
            rule: [
                {
                    reg: '^#历史头像',
                    fnc: 'showAllAvatars'
                }
            ]
        });
    }

    async showAllAvatars(e) {

        if (isDivingGroup(e, config)) return false;
        if (!e.at) {
            await e.reply("请@你要获取头像的用户。");
            return true;
        }

        const gid = e.group_id;
        const targetUid = e.at;

        // 获取在当前群的历史记录
        const historyDetail = await getHistoryDetailed(redis, config, gid, targetUid);
        if (historyDetail.corrupt) {
            log.w(`历史头像查询跳过损坏历史：群 ${gid} 用户 ${targetUid}`);
            await e.reply("该用户历史数据损坏，已跳过；请联系机器人主人修复。");
            return true;
        }
        const history = historyDetail.history;

        if (history.length === 0) {
            await e.reply("该用户暂无历史记录。");
            return true;
        }

        // 头像时间戳去重
        const uniqueHeadtimes = new Set();
        for (const record of history) {
            if (record.headtime) {
                uniqueHeadtimes.add(record.headtime);
            }
        }

        if (uniqueHeadtimes.size === 0) {
            await e.reply("未能找到该用户的历史头像存档。");
            return true;
        }

        // await e.reply(`正在上传 ${uniqueHeadtimes.size} 张历史头像...`);
        let tempMsgId = null;
        if (uniqueHeadtimes.size > 2) {
            const res = await e.reply(`正在上传 ${uniqueHeadtimes.size} 张历史头像...`);
            if (res && res.message_id) {
                tempMsgId = res.message_id;
            }
        }

        let forwardMsgData = [];
        let missingCount = 0;

        // 排列
        const sortedHeadtimes = Array.from(uniqueHeadtimes).sort((a, b) => a - b);

        for (const headtime of sortedHeadtimes) {
            // 组装图片路径
            const headPicPath = path.join(headDir, `${gid}_${targetUid}_${headtime}.jpg`);

            // 校验文件存在
            if (fs.existsSync(headPicPath)) {
                // 转换时间戳为可读时间
                const timeStr = moment(parseInt(headtime)).format('YYYY-MM-DD HH:mm:ss');

                forwardMsgData.push({
                    message: [
                        // `首次存档于：${timeStr}\n`,
                        segment.image(headPicPath)
                    ],
                    nickname: e.bot?.nickname || "历史头像",
                    user_id: e.bot?.uin || 0
                });
            } else {
                missingCount++;
            }
        }

        if (forwardMsgData.length === 0) {
            await e.reply("抱歉，所有历史头像文件均已丢失或被清理。");
            return true;
        }

        // 在顶部追加一条系统消息
        let summaryMsg = `该用户 ${forwardMsgData.length} 张历史头像。`;
        if (missingCount > 0) {
            summaryMsg += `\n（另有 ${missingCount} 张远古图片文件已在本地缓存中丢失）`;
        }
        forwardMsgData.unshift({
            message: summaryMsg,
            nickname: "系统提示",
            user_id: e.bot?.uin || 0
        });

        // 发送
        try {
            const forwardMsg = await e.group.makeForwardMsg(forwardMsgData);
            await e.reply(forwardMsg);

            // 发送合并转发成功后，立刻撤回提示消息
            if (tempMsgId && e.group) {
                try {
                    await e.group.recallMsg(tempMsgId);
                } catch (recallErr) {
                    log.e(`撤回头像打包提示消息失败: ${recallErr.message}`);
                }
            }
        } catch (fwErr) {
            log.e(`发送头像合并转发失败: ${fwErr}`);
            await e.reply("发送合并转发消息失败，可能是图片过多导致超时或遇到了风控。");
        }

        return true;

    }
}
