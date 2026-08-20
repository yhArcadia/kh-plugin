import fs from 'node:fs';
import path from 'node:path';
import { isDivingGroup } from '../utils/group-policy.js';
import { BaseApp } from '../components/base-app.js';
import { config, headDir, OPERATION_LOCK_KEY } from '../components/runtime.js';
import { acquireOperationLock, startLockRenewer } from '../components/operation-lock.js';
import { getHistoryDetailed } from '../components/storage.js';
import { log } from '../utils/logger.js';

export class KhRecordManage extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-群员记录管理',
            dsc: 'kh插件 删除记录管理',
            priority: 5000,
            startScheduler: false,
            rule: [
                {
                    reg: '^#?删除记录([\\d,，]+)',
                    fnc: 'deleteRecord'
                }
            ]
        });
    }

    async deleteRecord(e) {

        if (isDivingGroup(e, config)) return false;
        if (!e.isMaster) return false;
        if (!e.at) {
            await e.reply("请@你要删除其记录的用户。");
            return true;
        }
        e.msg = e.msg.replace(/[，,]+/g, ",");
        const match = e.msg.match(/^#?删除记录([\d,]+)/);
        if (!match) {
            return false;
        }

        // 解析所有序号
        const indicesStr = match[1];
        const indices = indicesStr.split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0);
        if (indices.length === 0) {
            await e.reply("请输入有效的记录序号（从1开始）。");
            return true;
        }

        // 去重并从大到小排序
        const uniqueIndices = [...new Set(indices)].sort((a, b) => b - a);

        if (await this.isOperationRunning()) {
            await e.reply("已有其他更新或清理任务正在进行中，请稍后再试。");
            return true;
        }
        const lock = await acquireOperationLock(redis, OPERATION_LOCK_KEY, 60, 'record-delete');
        if (!lock) {
            await e.reply("未能获取操作锁，请稍后再试。");
            return true;
        }

        const stopRenewer = startLockRenewer(lock, 30_000, () => {
            log.w('删除记录操作锁已失去所有权；将拒绝继续写入。');
        });

        try {
            const detail = await getHistoryDetailed(redis, config, e.group_id, e.at);
            if (detail.corrupt) {
                log.w(`删除记录已拒绝：群 ${e.group_id} 用户 ${e.at} 的历史 JSON 损坏。`);
                await e.reply("该用户历史数据损坏，已拒绝删除以避免覆盖原始数据；请使用主人调试/修复功能处理。");
                return true;
            }
            const history = detail.history;

            if (history.length === 0) {
                await e.reply("该用户暂无历史记录。");
                return true;
            }

            const deletedRecordsInfo = []; // 成功删除的记录信息
            const deletedHeadtimes = new Set(); // 被删除记录的头像
            const invalidIndices = []; // 无效的序号

            // 执行删除
            for (const index of uniqueIndices) {
                const recordIndex = index - 1;
                if (recordIndex >= 0 && recordIndex < history.length) {
                    const deletedRecord = history.splice(recordIndex, 1)[0];
                    deletedRecordsInfo.push({ index: index, time: deletedRecord.recordTime });
                    if (deletedRecord.headtime) {
                        deletedHeadtimes.add(deletedRecord.headtime);
                    }
                } else {
                    // 序号无效
                    invalidIndices.push(index);
                }
            }

            if (deletedRecordsInfo.length === 0) {
                await e.reply(`输入的序号均无效或不存在，该用户只有 ${history.length} 条记录。`);
                return true;
            }

            // 保存回 Redis
            if (!await lock.owns()) {
                log.w(`删除记录已中止：群 ${e.group_id} 用户 ${e.at} 的操作锁已失效。`);
                await e.reply("删除操作锁已失效，已取消写入以保护记录；请稍后重试。");
                return true;
            }
            await redis.set(detail.key, JSON.stringify(history));

            // 是否需要删除头像文件
            let cleanedFiles = 0;
            if (deletedHeadtimes.size > 0) {
                for (const headtimeToDelete of deletedHeadtimes) {
                    // 检查剩余记录中是否还有使用此头像的
                    const isHeadtimeInUse = history.some(record => record.headtime === headtimeToDelete);
                    if (!isHeadtimeInUse) {
                        const picpath = path.join(headDir, `${e.group_id}_${e.at}_${headtimeToDelete}.jpg`);
                        try {
                            if (fs.existsSync(picpath)) {
                                fs.unlinkSync(picpath);
                                cleanedFiles++;
                            }
                        } catch (err) {
                            log.e(`删除头像文件 ${picpath} 失败: ${err}`);
                        }
                    }
                }
                if (cleanedFiles > 0) {
                    log.i(`批量删除记录，并清理了 ${cleanedFiles} 个不再使用的头像文件。`);
                }
            }

            // 回复结果
            const deletedIndicesStr = deletedRecordsInfo
                .map(r => r.index)
                .sort((a, b) => a - b)
                .join(', ');

            let replyMsg = `成功删除该用户第 ${deletedIndicesStr} 条记录。`;

            if (invalidIndices.length > 0) {
                replyMsg += `\n（序号 ${invalidIndices.join(', ')} 无效或超出范围[1-${history.length + deletedRecordsInfo.length}]，已跳过）`;
            }

            await e.reply(replyMsg);

        } catch (error) {
            log.e(`删除记录时出错: ${error}`);
            await e.reply("删除记录时发生内部错误，请查看日志。");
        } finally {
            stopRenewer();
            await lock.release().catch(err => log.w(`删除记录操作锁释放失败: ${err.message}`));
        }

        return true;

    }
}