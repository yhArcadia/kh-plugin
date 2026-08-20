import { BaseApp } from '../components/base-app.js';
import { config, OPERATION_LOCK_KEY, memberUpdater } from '../components/runtime.js';
import { acquireOperationLock, startLockRenewer } from '../components/operation-lock.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { setMsgEmojiLike } from '../utils/message.js';
import { log } from '../utils/logger.js';

export class MemberInfoUpdate extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-手动更新群员信息',
            dsc: 'kh插件 手动更新群员信息',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(静默)?更新(群员)?信息$',
                    fnc: 'updateMembers'
                }
            ]
        });
    }

    async updateMembers(e) {

        if (!e.isMaster) return false;
        let isSilent = e.msg.includes("静默");
        // 潜水群一律转为静默
        if (isDivingGroup(e, config)) {
            isSilent = true;
        }

        if (await this.isOperationRunning()) {
            this.respond(isSilent, 123, "已有其他更新或清理任务正在进行中，请稍后再试。")
            return true;
        }

        const lock = await acquireOperationLock(redis, OPERATION_LOCK_KEY, config.lockTTL, 'manual-update');
        if (!lock) {
            await this.respond(isSilent, 123, "未能获取操作锁，可能刚刚有其他任务开始，请稍后再试。", e);
            return true;
        }
        let lost = false;
        const stopRenewer = startLockRenewer(
            lock,
            Math.max(1_000, Math.floor(Number(config.lockTTL || 3600) * 500)),
            error => {
                lost = true;
                log.w(`手动更新操作锁已失去所有权${error ? `：${error.message}` : ''}，将停止后续成员写入。`);
            }
        );

        log.i('开始手动更新当前群信息...');
        this.respond(isSilent, 282, "开始手动更新当前群员信息，请稍候...")

        let updatedUids = [];
        try {
            updatedUids = await memberUpdater.updateGroupMemberInfo(
                e.group_id,
                e.bot,
                async () => !lost && await lock.owns()
            );
            if (lost) {
                await this.respond(isSilent, 123, "更新操作锁已失效，已安全中止后续成员写入；请稍后重试。", e);
                return true;
            }
            const count = updatedUids.length;

            if (count <= 0) {
                this.respond(isSilent, 174, "当前群未检测到群员信息变动。")
            }
            else {
                this.respond(isSilent, 144)
                if (!isSilent) {
                    let msg = `当前群员信息更新完成，共更新 ${count} 条记录。`;
                    if (count < 10) {
                        msg += "\n变更名单：\n" + updatedUids.join("\n");
                        await e.reply(msg);
                    } else {
                        await e.reply(msg + "\n：");

                        let forwardMsgData = [];
                        const pageSize = 50;
                        for (let i = 0; i < count; i += pageSize) {
                            const chunk = updatedUids.slice(i, i + pageSize);
                            forwardMsgData.push({
                                message: `变更名单 (${i + 1}-${Math.min(i + pageSize, count)})：\n${chunk.join("\n")}`,
                                nickname: "更新记录",
                                user_id: e.bot.uin || 0
                            });
                        }

                        try {
                            const forwardMsg = await e.group.makeForwardMsg(forwardMsgData);
                            await e.reply(forwardMsg);
                        } catch (fwErr) {
                            log.w(`发送更新详情合并转发失败: ${fwErr}`);
                            await e.reply("发送详情失败，请查看日志。");
                        }
                    }
                }
            }
        } catch (error) {
            log.e(`手动更新群 ${e.group_id} 时发生错误: ${error}`);
            await this.respond(isSilent, 424, "更新过程中发生错误，请查看后台日志。")
        } finally {
            stopRenewer();
            const released = await lock.release();
            log.i(released ? '手动更新结束，已释放操作锁。' : '手动更新结束，操作锁已失效或被后续任务接管。');
        }
        return true;

    }

    async respond(isSilent, emojiId, message = "", e = this.e) {
        if (isSilent) {
            setMsgEmojiLike(e, emojiId);
        } else {
            if (message)
                await e.reply(message);
        }
        return true
    }

}
