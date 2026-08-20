import { isDivingGroup } from '../utils/group-policy.js';
import { BaseApp } from '../components/base-app.js';
import { config, scanLegacyKeys, OPERATION_LOCK_KEY } from '../components/runtime.js';
import { acquireOperationLock, startLockRenewer } from '../components/operation-lock.js';
import { log } from '../utils/logger.js';

export class KhAdmin extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-管理',
            dsc: 'kh插件 记录管理',
            priority: 5000,
            startScheduler: false,
            rule: [
                {
                    reg: '^#?清理幽灵记录$', //针对低于1.13.0的旧版而保留的清理功能
                    fnc: 'cleanGhostRecords'
                }
            ]
        });
    }

    async cleanGhostRecords(e) {

        if (isDivingGroup(e, config)) return false;
        if (!e.isMaster) return false;

        const lock = await acquireOperationLock(redis, OPERATION_LOCK_KEY, config.lockTTL, 'ghost-cleanup');
        if (!lock) {
            await e.reply("当前已有身份记录操作正在执行，请稍后再试。");
            return true;
        }

        let lostLockError = null;
        const stopRenewer = startLockRenewer(lock, 30_000, error => {
            lostLockError = error || new Error('操作锁已失去所有权');
            log.w(`清理幽灵记录操作锁已失效${error ? `：${error.message}` : ''}；将停止后续写入。`);
        });

        await e.reply("开始扫描身份记录并清理幽灵记录，这可能需要几秒钟，请稍候...");

        try {
            // 获取插件所有的 Redis Key
            const keys = await scanLegacyKeys(`${config.redisPrefix}:*`);
            let cleanCount = 0; // 清理掉的无用记录数
            let fixCount = 0;   // 修复的附带改名信息的记录数
            let affectedUsers = 0; // 受影响的用户数

            for (const key of keys) {
                if (lostLockError || !await lock.owns()) {
                    lostLockError ||= new Error('操作锁已失去所有权');
                    log.w('清理幽灵记录已中止：操作锁不再属于当前任务。');
                    break;
                }
                const prefix = `${config.redisPrefix}:`;
                const suffix = key.slice(prefix.length); // 截取掉前缀，剩下 群号:QQ号
                if (!/^\d+:\d+$/.test(suffix)) continue;

                const historyJson = await redis.get(key);
                if (!historyJson) continue;

                let history = [];
                try {
                    history = JSON.parse(historyJson);
                } catch (err) { continue; }

                if (history.length <= 1) continue;

                let hasModified = false;
                let fixedHistory = [];

                // 预搜索  找到该用户记录中的第一个真实头像
                let fallbackRecord = history.find(r => r.headtime && r.headtime !== 631152000000);

                let lastValidHeadtime = fallbackRecord ? fallbackRecord.headtime : 631152000000;
                let lastValidHeadtimeGMT = fallbackRecord ? fallbackRecord.headtimeGMT : "Mon, 01 Jan 1990 00:00:00 GMT";
                let lastValidContentLength = fallbackRecord ? fallbackRecord.contentLength : "1512";

                // 1. 遍历修复幽灵时间戳
                for (let i = 0; i < history.length; i++) {
                    let current = { ...history[i] };

                    // 遇到真实记录，更新基准
                    if (current.headtime && current.headtime !== 631152000000) {
                        lastValidHeadtime = current.headtime;
                        lastValidHeadtimeGMT = current.headtimeGMT;
                        lastValidContentLength = current.contentLength;
                        fixedHistory.push(current);
                    } else {
                        // 遇到幽灵记录 使用当前的基准覆盖
                        hasModified = true;

                        current.headtime = lastValidHeadtime;
                        current.headtimeGMT = lastValidHeadtimeGMT;
                        current.contentLength = lastValidContentLength;

                        fixedHistory.push(current);
                    }
                }

                // 2. 遍历去重  清除修复头像后可能出现的完全重复的记录
                if (hasModified) {
                    let finalHistory = [];
                    for (let i = 0; i < fixedHistory.length; i++) {
                        let current = fixedHistory[i];
                        let prev = finalHistory.length > 0 ? finalHistory[finalHistory.length - 1] : null;

                        if (prev &&
                            current.nickname === prev.nickname &&
                            current.card === prev.card &&
                            current.title === prev.title &&
                            current.role === prev.role &&
                            current.headtime === prev.headtime) {
                            // 发现完全一致的冗余记录，要清楚
                            cleanCount++;
                        } else {
                            if (current.headtime !== prev?.headtime) {
                                // 虽然信息不同被保留，但修复时间戳
                                fixCount++;
                            }
                            finalHistory.push(current);
                        }
                    }

                    // 3. 覆盖写入 Redis：失锁时停止，避免用旧快照覆盖新记录。
                    if (lostLockError || !await lock.owns()) {
                        lostLockError ||= new Error('操作锁已失去所有权');
                        log.w(`清理幽灵记录已中止：写入 ${key} 前操作锁失效。`);
                        break;
                    }
                    await redis.set(key, JSON.stringify(finalHistory));
                    affectedUsers++;
                }
            }

            if (lostLockError) {
                await e.reply("清理已安全中止：操作锁失效或 Redis 续租异常，未继续写入剩余记录；请稍后重新执行。");
            } else {
                await e.reply(`清理完成。\n共扫描到 ${affectedUsers} 名受影响的用户。\n删除 ${cleanCount} 条冗余记录。\n修复了 ${fixCount} 条包含其他信息的错乱记录。`);
            }

        } catch (err) {
            log.e(`清理幽灵记录失败: ${err}`)
            await e.reply("清理过程中发生错误，请查看控制台日志。");
        } finally {
            stopRenewer();
            await lock.release().catch(error => log.w(`清理幽灵记录操作锁释放失败: ${error.message}`));
        }

        return true;

    }
}
