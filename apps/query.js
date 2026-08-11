import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import { isDivingGroup } from '../utils/group-policy.js';
import { WhoApp } from '../components/base-app.js';
import { config, memberUpdater } from '../components/runtime.js';
import { getHistoryDetailed } from '../components/storage.js';
import { log } from '../utils/logger.js';

export class WhoQuery extends WhoApp {
    constructor() {
        super({
            name: 'Who插件-群员历史身份（KH）',
            dsc: '查询群友身份与历史头像',
            priority: 5000,
            startScheduler: false,
            rule: [
                {
                    reg: '(你|他)(几把|寄吧)?是?谁？?啊?？?',
                    fnc: 'who_are_you'
                },
                {
                    reg: '开(合|盒)',
                    fnc: 'who_are_you'
                },
                {
                    reg: '你是？',
                    fnc: 'who_are_you'
                },
                {
                    reg: '(你是什么猫猫|nssmmm|kh|KH)',
                    fnc: 'who_are_you'
                }
            ]
        });
    }

    async who_are_you(e) {

        if (!e.at) return false;

        // 1. 匹配互通群
        let isLowerKh = e.msg.includes('kh') && !e.msg.includes('KH');
        let isUpperKH = e.msg.includes('KH');

        let targetGroupIds = [e.group_id];
        // 只有大写KH才会获取全部共同群
        if (isUpperKH && config.linkedGroups && Array.isArray(config.linkedGroups)) {
            const matchedGroups = config.linkedGroups.filter(g => g.includes(e.group_id));
            if (matchedGroups.length > 0) {
                targetGroupIds = [...new Set(matchedGroups.flat())];
            }
        }

        const isMultiGroup = targetGroupIds.length > 1;
        const isFullRender = isUpperKH;

        // 2. 获取数据
        let recordsInEachGroup = [];
        let corruptGroups = [];
        for (const groupId of targetGroupIds) {

            let member = null;
            let isHistorical = true;
            let currentHistory = [];

            // 获取群名
            let gname = groupId.toString();
            try {
                const groupInfo = e.bot.gl?.get(Number(groupId)) || e.bot.gl?.get(String(groupId));
                if (groupInfo) gname = groupInfo.group_name || groupInfo.name || gname;
                else gname = e.bot.pickGroup(groupId)?.name || gname;
            } catch (err) { }

            if (groupId !== e.group_id) {
                const inquirerKey = `${config.redisPrefix}:${groupId}:${e.user_id}`;
                const hasInquirerHistory = await redis.exists(inquirerKey);
                if (!hasInquirerHistory && !e.isMaster) {
                    continue;
                }
            }

            // 先从本地读取记录
            const historyDetail = await getHistoryDetailed(redis, config, groupId, e.at);
            if (historyDetail.corrupt) {
                corruptGroups.push(gname);
                log.w(`KH 跳过损坏历史：群 ${groupId} 用户 ${e.at}`);
                continue;
            }
            currentHistory = historyDetail.history;

            // 当前群的用户信息，去发起API请求
            if (groupId === e.group_id) {
                // 黑白名单过滤
                let isGroupAllowed = true;
                if (config.groupWhitelist && config.groupWhitelist.length > 0) {
                    isGroupAllowed = config.groupWhitelist.includes(Number(groupId));
                } else {
                    isGroupAllowed = !(config.groupBlacklist || []).includes(Number(groupId));
                }

                // 用户黑名单
                const isUserBlacklisted = (config.userBlacklist || []).includes(Number(e.at));

                // 只有群被允许，且用户不在黑名单，才拉取数据
                if (isGroupAllowed && !isUserBlacklisted) {
                    try {
                        // member = await e.bot.pickGroup(groupId).pickMember(e.at).getInfo(true);
                        member = await e.group.pickMember(e.at).getInfo(true);
                        // logger.info(`[who_are_you] 获取到当前群用户(${e.at})的实时信息: ${JSON.stringify(member)}`);
                        isHistorical = false; // 实时数据标记
                    } catch (error) {
                        log.e(`获取当前群用户(${e.at})的实时信息失败: ${error}`);
                        try {
                            const fallbackMember = e.group.pickMember(e.at);
                            if (fallbackMember) {
                                if (fallbackMember.nickname) {
                                    member = fallbackMember;
                                    isHistorical = false;
                                } else if (fallbackMember.info && fallbackMember.info.nickname) {
                                    member = fallbackMember.info;
                                    isHistorical = false;
                                }
                            }
                        } catch (fallbackErr) { }
                    }
                } else {
                    log.m(`KH目标未通过白/黑名单，仅利用历史数据生图。`);
                }
            }

            // 兜底，用历史记录最后一条
            if (!member && currentHistory.length > 0) {
                member = currentHistory[currentHistory.length - 1];
            }

            if (!member) continue;

            // 提问者的时间信息
            let inquirer = { join_time: 0 };
            if (groupId === e.group_id) {
                try {
                    inquirer = await e.bot.pickGroup(groupId).pickMember(e.user_id).getInfo(true);
                } catch (error) { }
            }

            // 拿到实时数据的，走Update流程检查有没有换头像
            if (!isHistorical) {
                const updateRes = await memberUpdater.processMemberUpdate(member, groupId, gname);
                currentHistory = updateRes.history;
                if (updateRes.updated) {
                    log.i(`已更新群【${gname}】用户(${e.at})的信息`);
                }
            }

            if (currentHistory.length < 1) continue;

            recordsInEachGroup.push({
                groupId,
                gname,
                member,
                inquirer,
                history: currentHistory
            });
        }

        //如果潜水群就不再发送消息了。
        if (isDivingGroup(e, config, logger)) return true;

        // 3. 组装与发送
        let tempMsgId = null;
        let recallTimer = null;
        if (recordsInEachGroup.length === 0) {
            if (corruptGroups.length > 0) {
                await e.reply(`该用户在 ${corruptGroups.join('、')} 的历史数据损坏，已跳过；请联系机器人主人修复。`);
            } else {
                await e.reply("null~");
            }
            return true;
        } else if (recordsInEachGroup.length > 1) {
            const res = await e.reply("让我康康...");
            if (res && res.message_id) {
                tempMsgId = res.message_id;
                recallTimer = setTimeout(async () => {
                    try {
                        if (e.group) await e.group.recallMsg(tempMsgId);
                    } catch (err) {
                        log.e(`撤回提示消息失败: ${err.message}`);
                    }
                }, 15000);
            }
        }

        let forwardMsgData = [];
        for (const record of recordsInEachGroup) {
            const { groupId, gname, member, inquirer, history } = record;
            try {
                let limit = isFullRender ? 0 : config.maxRenderLength;
                let img = await this.imgRender(e, groupId, gname, member, inquirer, history, limit, true);
                if (img) {
                    forwardMsgData.push({
                        message: img,
                        nickname: e.bot?.nickname || "历史身份",
                        user_id: e.bot?.uin || 0
                    });
                } else {
                    forwardMsgData.push({
                        message: `群【${gname}】生成图片失败，未返回图片。`,
                        nickname: "系统提示",
                        user_id: e.bot?.uin || 0
                    });
                }
            } catch (error) {
                log.e(`生成群 ${gname} 历史记录时出错: ${error}`);
                forwardMsgData.push({
                    message: `群【${gname}】生成历史图片时遇到错误，已跳过。`,
                    nickname: "系统报错",
                    user_id: e.bot?.uin || 0
                });
            }
        }

        // 4. 发送结果
        if (forwardMsgData.length == 1) {
            await e.reply(forwardMsgData[0].message);
            // return true;
        } else {
            try {
                const forwardMsg = await e.group.makeForwardMsg(forwardMsgData);
                await e.reply(forwardMsg);
            } catch (fwErr) {
                log.e(`发送详情合并转发失败: ${fwErr}`);
                await e.reply("发送多群详情失败，请查看日志。");
            }
        }
        //发送后，撤回提示消息
        if (tempMsgId && e.group) {
            clearTimeout(recallTimer);
            try {
                await e.group.recallMsg(tempMsgId);
            } catch (err) {
                log.e(`撤回提示消息失败: ${err.message}`);
            }
        }
        return true;

    }


}
