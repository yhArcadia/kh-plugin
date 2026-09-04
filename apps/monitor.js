import { BaseApp } from '../components/base-app.js';
import {
    config,
    memberUpdater,
    checkAndSetMonitorCD,
    isOperationRunning
} from '../components/runtime.js';
import { log } from '../utils/logger.js';
import { isGroupAllowed } from '../utils/group-policy.js';

const MONITOR_LISTENER_KEY = Symbol.for('kh-plugin.monitor.message-group-listener');

const CHANGE_TYPE_MAP = {
    '昵称': 'nickname',
    '头像': 'avatar',
    '头衔': 'title',
    '群名片': 'card',
    '群权限': 'role'
};

function shouldNotifyForChanges(config, gid, changes) {
    if (!changes || changes.length === 0) return false;
    const rules = config.notifyRules;
    const groupRules = rules.groups[gid] || rules.default;
    return changes.some(change => {
        const key = CHANGE_TYPE_MAP[change];
        return key && groupRules[key] !== false;
    });
}

export class Monitor extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-群员身份实时监听',
            dsc: 'kh插件 实时身份监听',
            priority: 6000,
            rule: []
        });

        this.registerMessageListener();
    }

    registerMessageListener() {
        const bot = this.Bot || globalThis.Bot;
        if (!bot || typeof bot.on !== 'function') {
            log.w?.('实时监听注册失败：Bot.on 不可用。');
            return;
        }
        if (globalThis[MONITOR_LISTENER_KEY]) return;

        const handler = event => {
            if (event?.message_type !== 'group' || !event?.group_id || !event?.user_id) return;
            this.monitorMessage(event).catch(err => {
                log.i(`静默检测发生异常: ${err.message}`);
            });
        };

        bot.on('message.group', handler);
        globalThis[MONITOR_LISTENER_KEY] = handler;
        log.i('已注册message.group监听全部目标群消息。');
    }

    async monitorMessage(e) {

        if (e?.message_type !== 'group' || !e.group_id || !e.user_id) return false;

        const gid = Number(e.group_id);
        const uid = Number(e.user_id);

        // 黑白名单过滤
        const isGroupAllowedNow = isGroupAllowed(gid, config);

        // 结合用户黑名单
        if (!isGroupAllowedNow || (config.userBlacklist || []).includes(uid)) {
            return false;
        }

        // 维护/批量操作期间不启动实时写任务；下次消息会再次触发检查。
        if (await isOperationRunning()) {
            return false;
        }

        // 触发后随即进入 CD
        if (checkAndSetMonitorCD(gid, uid)) {
            return false;
        }

        this.asyncCheckAndUpdate(e).catch(err => {
            log.e(`静默检测发生异常: ${err.message}`);
        });

        return false;

    }

    async asyncCheckAndUpdate(e) {

        const gid = e.group_id;
        const uid = e.user_id;

        let member;
        try {
            member = await e.group.pickMember(uid).getInfo(true);
        } catch (err) {
            return; // 拿不到就算了
        }
        if (!member) return;

        // 修正最后发言时间：使用当前消息时间更新，避免getInfo返回的是旧数据
        const eventTime = Number(e.time || Math.floor(Date.now() / 1000));
        if (Number.isFinite(eventTime) && eventTime > 0) {
            member.last_sent_time = Math.max(Number(member.last_sent_time || 0), eventTime);
        }

        let gname = e.group_name || gid.toString();

        // 在真正读取/写入历史前复查一次，缩小“检查后才获得维护锁”的窗口。
        if (await isOperationRunning()) return;

        // 执行检查
        const { updated, history, changes } = await memberUpdater.processMemberUpdate(member, gid, gname);

        if (updated && changes && changes.length > 0) {
            const prevRecord = history.length >= 2 ? history[history.length - 2] : null;
            const displayName = prevRecord
                ? (prevRecord.card || prevRecord.nickname || uid.toString())
                : (member.card || member.nickname || uid.toString());
            const changeStr = changes.join('、');
            log.i(`检测到群【${gname}】用户 ${displayName} (${uid}) 变更: ${changeStr}`);

            // 潜水群不推送通报。
            const isDiving = (config.divingGroups || []).includes(Number(gid));
            if (config.notifyGroups.includes(gid) && !isDiving && shouldNotifyForChanges(config, gid, changes)) { //防止误把潜水群配进了通知群
                // 用户自己作为inquirer
                const inquirer = member
                try {
                    let isShowTimeline = config.maxNotifyRenderLength > 2;
                    if (history.length == 2) isShowTimeline = false
                    const img = await this.imgRender(e, gid, gname, member, inquirer, history, config.maxNotifyRenderLength, isShowTimeline);
                    if (img) {
                        const msg = `检测到 ${displayName} 的${changeStr}已更新：`;
                        await e.reply([msg, img]);
                    }
                } catch (renderErr) {
                    log.e(`实时通报生成图片失败: ${renderErr}`);
                }
            }
        }

    }
}