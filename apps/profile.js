import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment';
import template from 'art-template';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import cfg from '../../../lib/config/config.js';
import { templateDir, pluginRoot } from '../components/paths.js';
import { formatDuration, getLevelIcons } from '../utils/format.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { BaseApp } from '../components/base-app.js';
import { config, memberUpdater } from '../components/runtime.js';
import { getHistoryDetailed } from '../components/storage.js';
import { log } from '../utils/logger.js';
import { getAvatarPalette } from '../utils/avatar-palette.js';

export class KhProfile extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-成员基础信息查询',
            dsc: 'kh插件 成员基础信息查询',
            priority: 499,
            startScheduler: false,
            rule: [
                {
                    reg: '^#查询?信息(\\s*\\d+)?$',
                    fnc: 'queryInfo'
                },
                {
                    reg: '^#头像(时间|时长)$',
                    fnc: 'getAvatarDuration'
                },
                {
                    reg: '^#查看头像$',
                    fnc: 'getAvatarDuration'
                }
            ]
        });
    }

    async queryInfo(e) {

        if (isDivingGroup(e, config)) return false;

        let targetUid = e.user_id;
        if (e.at) {
            targetUid = e.at;
        } else {
            const match = e.msg.match(/\d+/);
            if (match) targetUid = parseInt(match[0], 10);
        }

        try {
            const res = await e.bot.sendApi('get_stranger_info', { user_id: targetUid });

            if (!res || !res.data) {
                await e.reply(`无法获取目标 ${targetUid} 的信息，可能是账号不存在或被风控屏蔽。`);
                return true;
            }

            const data = res.data;

            logger.info(data)

            const nickname = data.nick || data.nickname || '未设置';
            const longNick = data.longNick || data.long_nick || '未设置签名';
            const qid = data.qid || '没有设置QID';
            const age = data.age ? `${data.age}岁` : '未设置';

            let sexStr = '未知';
            if (data.sex === 'male') sexStr = '男';
            else if (data.sex === 'female') sexStr = '女';

            let locArr = [];
            if (data.country && data.country !== '0') locArr.push(data.country);
            if (data.province && data.province !== '0') locArr.push(data.province);
            if (data.city && data.city !== '0') locArr.push(data.city);
            const locationStr = locArr.length > 0 ? locArr.join(' - ') : '未设置地区';

            const qqLevel = data.qqLevel || data.level || 0;
            const levelIcons = getLevelIcons(qqLevel);

            const regTime = data.regTime || data.reg_time || 0;
            let regTimeStr = '未知';
            let regDaysStr = '未知';
            if (regTime > 0) {
                const regMoment = moment(regTime * 1000);
                regTimeStr = regMoment.format('YYYY-MM-DD HH:mm');
                const days = moment().diff(regMoment, 'days');
                const years = (days / 365).toFixed(1);
                regDaysStr = `${days}天 (≈${years}年)`;
            }

            const richTime = data.richTime || 0;
            let richTimeStr = '未知';
            if (richTime > 0) {
                richTimeStr = moment(richTime * 1000).format('YYYY-MM-DD HH:mm');
            }

            const loginDays = data.login_days || 0;

            const isVip = data.is_vip || false;
            const isYearsVip = data.is_years_vip || false;
            const vipLevel = data.vip_level || 0;
            let vipStr = '未开通';
            if (isYearsVip) vipStr = `年费会员 (VIP${vipLevel})`;
            else if (isVip) vipStr = `普通会员 (VIP${vipLevel})`;

            const avatarUrl = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${targetUid}`;

            let msg = `══════════════\n`;
            msg += `查询账号： ${targetUid}\n`;
            msg += `查询昵称： ${nickname}\n`;
            msg += `查询等级： LV${qqLevel}级\n`;
            msg += `查询图标： ${levelIcons}\n`;
            msg += `查询QID： ${qid}\n`;
            msg += `查询签名： ${longNick}\n`;
            msg += `性别年龄： ${sexStr} / ${age}\n`;
            msg += `所在地区： ${locationStr}\n`;
            msg += `注册时间： ${regTimeStr}\n`;
            if (regTime > 0) msg += `注册时长： ${regDaysStr}\n`;
            if (loginDays > 0) msg += `活跃天数： ${loginDays}天\n`;
            if (richTime > 0) msg += `资料更新： ${richTimeStr}\n`;
            msg += `会员状态： ${vipStr}\n`;
            msg += `══════════════\n`;
            msg += `查询时间: ${moment().format('YYYY/MM/DD HH:mm:ss')}`;

            await e.reply([segment.image(avatarUrl), msg]);

        } catch (error) {
            log.e(`查询账号信息失败，接口调用异常:`, error);
            await e.reply("查询失败！");
        }

        return true;

    }

    async getAvatarDuration(e) {

        if (isDivingGroup(e, config)) return false;
        if (!e.isGroup) {
            await e.reply("该功能只能在群聊中使用哦！");
            return true;
        }

        const targetUid = e.at || e.user_id;

        // 拉取实时数据以刷新可能刚换的头像时间戳
        let member = null;
        try {
            member = await e.group.pickMember(targetUid).getInfo(true);
        } catch (error) {
            try {
                const fallbackMember = e.group.pickMember(targetUid);
                if (fallbackMember) {
                    if (fallbackMember.nickname) {
                        member = fallbackMember;
                    } else if (fallbackMember.info && fallbackMember.info.nickname) {
                        member = fallbackMember.info;
                    }
                }
            } catch (fallbackErr) { }
        }

        // 黑白名单
        let isGroupAllowed = true;
        if (config.groupWhitelist && config.groupWhitelist.length > 0) {
            isGroupAllowed = config.groupWhitelist.includes(Number(e.group_id));
        } else {
            isGroupAllowed = !(config.groupBlacklist || []).includes(Number(e.group_id));
        }
        const isUserBlacklisted = (config.userBlacklist || []).includes(Number(targetUid));

        // 新数据入库
        if (isGroupAllowed && !isUserBlacklisted && member) {
            await memberUpdater.processMemberUpdate(member, e.group_id, e.group_name);
        }

        // 读取历史记录
        const historyDetail = await getHistoryDetailed(redis, config, e.group_id, targetUid);
        if (historyDetail.corrupt) {
            log.w(`头像时长查询跳过损坏历史：群 ${e.group_id} 用户 ${targetUid}`);
            await e.reply("该用户历史数据损坏，已跳过；请联系机器人主人修复。");
            return true;
        }
        const history = historyDetail.history;

        if (history.length === 0) {
            await e.reply("暂无该用户的头像记录，请先kh他，或者发送 更新群员信息 后再试。");
            return true;
        }

        const latestRecord = history[history.length - 1];
        let validHeadtime = null;
        let validHeadtimeGMT = null; // 顺带提取字符串进行校准

        // 查找最近一条有效的头像时间戳
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].headtime && history[i].headtime !== 631152000000) {
                validHeadtime = history[i].headtime;
                validHeadtimeGMT = history[i].headtimeGMT;
                break;
            }
        }

        const displayName = latestRecord.card || latestRecord.nickname || targetUid.toString();

        if (!validHeadtime || validHeadtime === 631152000000) {
            await e.reply(`【${displayName}】无法获取精确的更换时间。`);
            return true;
        }

        let startTimeStr = '';
        if (validHeadtimeGMT) {
            const timeStr = validHeadtimeGMT.replace(' GMT', '');
            const correctMoment = moment.utc(timeStr, "ddd, DD MMM YYYY HH:mm:ss", "en").utcOffset(8, true);
            validHeadtime = correctMoment.valueOf();
            startTimeStr = correctMoment.format('YYYY-MM-DD HH:mm:ss');
        } else {
            startTimeStr = moment.utc(validHeadtime).utcOffset(8).format('YYYY-MM-DD HH:mm:ss');
        }

        const nowMs = Date.now();
        const durationSec = Math.max(0, Math.floor((nowMs - validHeadtime) / 1000));
        const durationStr = formatDuration(durationSec);

        const avatarUrl = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${targetUid}`;
        const avatarPalette = await getAvatarPalette(avatarUrl);

        const khPluginVersion = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version;
        const renderData = {
            avatarUrl,
            targetUid,
            displayTitle: e.msg.includes('时') ? '头像时长查询' : '查看头像',
            displayName,
            durationStr,
            startTimeStr,
            ...avatarPalette,
            footer: `Created By TRSS-Yunzai v${cfg.package.version} & kh-plugin v${khPluginVersion}`
        };
        const img = await puppeteer.screenshot('who_are_you_profile', {
            tplFile: path.join(templateDir, 'profile-avatar.html'),
            saveId: `avatar_${e.group_id}_${targetUid}`,
            ...renderData
        });

        await e.reply(img);

        return true;

    }
}
