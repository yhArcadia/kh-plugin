/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-22 22:40:07
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-08 17:20:51
 * @FilePath: /kh-plugin/apps/statistics.js
 * @Description: 头像存储统计
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { headsDir, orphansDir } from '../components/paths.js';
import { encodeSafeUid, decodeSafeUid, decodeRedisUid } from '../utils/uid-encoder.js';
import { scanKeys } from '../components/storage.js';
import { config } from '../components/runtime.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { log } from '../utils/logger.js';
import { acquireOperationLock, startLockRenewer } from '../components/operation-lock.js';


const OLD_FORMAT_RE = /^(\d+)_(.+)_(\d+)\.jpg$/i;
const NEW_FORMAT_RE = /^(.+)_(\d+)\.jpg$/i;
const STAT_CONCURRENCY = 48;
const TOP_N_USERS = 50;
const ORPHAN_PREVIEW_LIMIT = 50;

let orphanCleaning = false;

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[index]}`;
}

function normalizeFileEntry(filename) {
    const oldMatch = filename.match(OLD_FORMAT_RE);
    if (oldMatch) {
        const rawUid = oldMatch[2];
        return {
            safeUid: encodeSafeUid(rawUid),
            headtime: Number(oldMatch[3]),
            isOldFormat: true,
            rawUid,
            gid: oldMatch[1]
        };
    }
    const newMatch = filename.match(NEW_FORMAT_RE);
    if (newMatch) {
        return {
            safeUid: newMatch[1],
            headtime: Number(newMatch[2]),
            isOldFormat: false
        };
    }
    return null;
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

async function getGroupName(bot, groupId) {
    const group = bot?.pickGroup?.(Number(groupId));
    if (!group) return null;
    const cachedName = group.info?.group_name || group.group_name || group.name;
    if (cachedName) return String(cachedName);
    try {
        const info = await group.getInfo?.(true);
        return info?.group_name || info?.name || null;
    } catch {
        return null;
    }
}

function maskGroupName(name) {
    const chars = Array.from(String(name || '').trim());
    if (chars.length >= 3) return `${chars[0]}** ${chars.at(-1)}`;
    if (chars.length === 2) return `${chars[0]}**`;
    return '**';
}

function maskGroupId(groupId) {
    const text = String(groupId);
    return text.length <= 4 ? `${text.slice(0, 2)}**` : `${text.slice(0, 2)}** ${text.slice(-2)}`;
}

function maskUserId(userId) {
    const text = String(userId);
    if (text.length <= 4) return `${text.slice(0, 2)}**`;
    return `${text.slice(0, 4)}**${text.slice(-1)}`;
}

async function getUserNickname(bot, userId) {
    try {
        const user = bot?.pickUser?.(Number(userId));
        if (user?.nickname) return String(user.nickname);
        const res = await bot?.sendApi?.('get_stranger_info', { user_id: Number(userId) });
        return res?.data?.nick || res?.data?.nickname || null;
    } catch {
        return null;
    }
}

export class KhStatistics extends plugin {
    constructor() {
        super({
            name: 'kh插件-存储统计',
            dsc: '统计 KH 历史头像文件数量和存储占用',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?kh统计$',
                    fnc: 'showStatistics'
                },
                {
                    reg: '^#?kh闲置头像$',
                    fnc: 'showOrphanAvatars'
                },
                {
                    reg: '^#?kh清理闲置(头像)?$',
                    fnc: 'cleanOrphanAvatars'
                }
            ]
        });
    }

    async showStatistics(e) {
        if (!e.isMaster) return false;
        if (isDivingGroup(e, config)) return false;

        let tempMsgId = null;

        try {
            if (e.isGroup) {
                const res = await e.reply("正在统计……");
                if (res?.message_id) tempMsgId = res.message_id;
            }

            const stats = await this.collectStats();
            const isPrivate = !e.isGroup;

            let msg = 'KH 头像存储统计\n';
            msg += '===========================\n';

            // 维度一：全局概览
            const dedupSavings = stats.totalPossibleSize - stats.totalActualSize;
            msg += '📦 全局概览\n';
            msg += `  活跃头像：${stats.activeFiles.toLocaleString('zh-CN')} 个\n`;
            msg += `  磁盘占用：${formatBytes(stats.totalActualSize)}\n`;
            if (dedupSavings > 0) {
                msg += `  跨群共享：${formatBytes(dedupSavings)}\n`;
            }

            // 维度二：分群占用（全量归因）
            if (stats.groupStats.length > 0) {
                msg += '\n📊 分群占用\n';
                const names = await mapWithConcurrency(stats.groupStats, 8, async (g) => ({
                    gid: g.gid,
                    name: await getGroupName(e.bot || globalThis.Bot, g.gid)
                }));
                const nameMap = new Map(names.map(n => [n.gid, n.name]));

                for (let i = 0; i < stats.groupStats.length; i++) {
                    const g = stats.groupStats[i];
                    const name = nameMap.get(g.gid);
                    const label = name
                        ? (isPrivate ? name : maskGroupName(name))
                        : maskGroupId(g.gid);
                    msg += `  ${i + 1}. ${label}：${g.refs.toLocaleString('zh-CN')} 张 · ${formatBytes(g.size)}\n`;
                }
            }

            // 维度三：Top N 用户
            if (stats.topUsers.length > 0) {
                msg += '\n👤 Top 用户\n';
                const users = await mapWithConcurrency(stats.topUsers, 5, async (u) => {
                    let rawUid;
                    try {
                        rawUid = decodeSafeUid(u.safeUid);
                    } catch {
                        rawUid = u.safeUid;
                    }
                    const nickname = await getUserNickname(e.bot || globalThis.Bot, rawUid);
                    return { ...u, rawUid, nickname };
                });
                for (let i = 0; i < users.length; i++) {
                    const u = users[i];
                    const label = u.nickname
                        ? u.nickname
                        : (isPrivate ? u.rawUid : maskUserId(u.rawUid));
                    msg += `  ${i + 1}. ${label}：${u.count} 张 · ${formatBytes(u.size)}\n`;
                }
            }

            // 维度四：闲置头像概况
            if (stats.orphanStats.totalFiles > 0) {
                msg += '\n🗑️ 闲置头像\n';
                msg += `  待清理：${stats.orphanStats.totalFiles} 个文件 · ${formatBytes(stats.orphanStats.totalSize)}\n`;
                if (stats.orphanStats.earliestDate) {
                    msg += `  最早：${stats.orphanStats.earliestDate} · 最新：${stats.orphanStats.latestDate}\n`;
                }
                msg += '  输入 #kh闲置头像 查看 · #kh清理闲置 清除\n';
            }

            const forwardMsg = await (e.isGroup
                ? e.group.makeForwardMsg([{
                    message: msg,
                    nickname: e.bot?.nickname || "KH 存储统计",
                    user_id: e.bot?.uin || 0
                }])
                : Bot.makeForwardMsg([{
                    message: msg,
                    nickname: e.bot?.nickname || "KH 存储统计",
                    user_id: e.bot?.uin || 0
                }]));
            await e.reply(forwardMsg);

            if (tempMsgId && e.isGroup) {
                try {
                    await e.group.recallMsg(tempMsgId);
                } catch (recallErr) {
                    log.e(`撤回提示消息失败: ${recallErr.message}`);
                }
            }
        } catch (error) {
            log.e('统计 KH 头像存储失败', error);
            await e.reply('统计 KH 头像存储时发生错误，请查看控制台日志。');
        }
        return true;
    }

    async collectStats() {
        // 阶段一：收集 Redis 引用
        const prefix = `${config.redisPrefix}:`;
        const refMap = new Map();
        const perGroupMap = new Map();

        await scanKeys(redis, `${prefix}*`, {
            count: 500,
            callback: async (key) => {
                const suffix = key.slice(prefix.length);
                const parts = suffix.split(':');
                if (parts.length !== 2) return;
                const gid = parts[0];
                const rawUid = decodeRedisUid(parts[1]);
                const safeUid = encodeSafeUid(rawUid);

                try {
                    const raw = await redis.get(key);
                    if (!raw) return;
                    const history = JSON.parse(raw);
                    if (!Array.isArray(history)) return;

                    for (const record of history) {
                        if (record.headtime) {
                            const fileKey = `${safeUid}:${record.headtime}`;
                            if (!refMap.has(fileKey)) refMap.set(fileKey, new Set());
                            refMap.get(fileKey).add(gid);

                            if (!perGroupMap.has(gid)) perGroupMap.set(gid, new Set());
                            perGroupMap.get(gid).add(fileKey);
                        }
                    }
                } catch { /* skip invalid keys */ }
            }
        });

        // 阶段二：扫描活跃头像文件
        const entries = await fs.readdir(headsDir, { withFileTypes: true });
        const files = entries.filter(e => e.isFile() && e.name.endsWith('.jpg'));

        const fileInfos = await mapWithConcurrency(files, STAT_CONCURRENCY, async (entry) => {
            const normalized = normalizeFileEntry(entry.name);
            if (!normalized) return null;
            try {
                const stat = await fs.stat(path.join(headsDir, entry.name));
                return { ...normalized, size: stat.size };
            } catch (err) {
                log.d(`统计跳过无法读取的头像文件: ${entry.name}: ${err.message}`);
                return null;
            }
        });

        // 按 (safeUid, headtime) 去重
        const uniqueFiles = new Map();
        for (const info of fileInfos) {
            if (!info) continue;
            const key = `${info.safeUid}:${info.headtime}`;
            if (!uniqueFiles.has(key)) {
                uniqueFiles.set(key, info);
            }
        }

        // 维度一：全局概览
        let totalActualSize = 0;
        let totalPossibleSize = 0;
        for (const [key, info] of uniqueFiles) {
            totalActualSize += info.size;
            const refCount = refMap.get(key)?.size || 0;
            totalPossibleSize += info.size * Math.max(1, refCount);
        }

        // 维度二：分群占用
        const groupStats = [];
        for (const [gid, fileKeys] of perGroupMap) {
            let groupSize = 0;
            for (const key of fileKeys) {
                const info = uniqueFiles.get(key);
                if (info) groupSize += info.size;
            }
            if (fileKeys.size > 0) {
                groupStats.push({ gid, refs: fileKeys.size, size: groupSize });
            }
        }
        groupStats.sort((a, b) => b.size - a.size);

        // 维度三：Top N 用户
        const userMap = new Map();
        for (const [key, info] of uniqueFiles) {
            const existing = userMap.get(info.safeUid) || { count: 0, size: 0 };
            existing.count++;
            existing.size += info.size;
            userMap.set(info.safeUid, existing);
        }
        const topUsers = [...userMap.entries()]
            .map(([safeUid, data]) => ({ safeUid, ...data }))
            .sort((a, b) => b.size - a.size)
            .slice(0, TOP_N_USERS);

        // 维度四：闲置头像
        let orphanStats = { totalFiles: 0, totalSize: 0, earliestDate: null, latestDate: null };
        try {
            const orphanEntries = await fs.readdir(orphansDir, { withFileTypes: true });
            const dateDirs = orphanEntries.filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name));
            const dates = [];
            for (const dir of dateDirs) {
                dates.push(dir.name);
                try {
                    const subEntries = await fs.readdir(path.join(orphansDir, dir.name), { withFileTypes: true });
                    const subFiles = subEntries.filter(e => e.isFile() && e.name.endsWith('.jpg'));
                    orphanStats.totalFiles += subFiles.length;
                    for (const f of subFiles) {
                        try {
                            const st = await fs.stat(path.join(orphansDir, dir.name, f.name));
                            orphanStats.totalSize += st.size;
                        } catch (err) {
                            log.d(`统计孤儿头像跳过: ${dir.name}/${f.name}: ${err.message}`);
                        }
                    }
                } catch (err) {
                    log.d(`统计跳过不可读孤儿目录: ${dir.name}: ${err.message}`);
                }
            }
            dates.sort();
            if (dates.length > 0) {
                orphanStats.earliestDate = dates[0];
                orphanStats.latestDate = dates[dates.length - 1];
            }
        } catch (err) {
            log.d(`统计孤儿头像: orphans目录访问失败: ${err.message}`);
        }

        return {
            activeFiles: uniqueFiles.size,
            totalActualSize,
            totalPossibleSize,
            groupStats,
            topUsers,
            orphanStats
        };
    }

    async showOrphanAvatars(e) {
        if (!e.isMaster) return false;
        if (isDivingGroup(e, config)) return false;

        try {
            const orphanFiles = [];
            const orphanEntries = await fs.readdir(orphansDir, { withFileTypes: true });
            const dateDirs = orphanEntries.filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name));

            for (const dir of dateDirs) {
                try {
                    const subEntries = await fs.readdir(path.join(orphansDir, dir.name), { withFileTypes: true });
                    const jpgFiles = subEntries.filter(e => e.isFile() && e.name.endsWith('.jpg'));
                    for (const f of jpgFiles) {
                        orphanFiles.push({
                            dateDir: dir.name,
                            filename: f.name,
                            fullPath: path.join(orphansDir, dir.name, f.name)
                        });
                    }
                } catch (err) {
                    log.d(`展示闲置头像跳过不可读目录: ${dir.name}: ${err.message}`);
                }
            }

            if (orphanFiles.length === 0) {
                await e.reply('当前没有闲置头像文件。');
                return true;
            }

            orphanFiles.sort((a, b) => {
                if (a.dateDir !== b.dateDir) return a.dateDir.localeCompare(b.dateDir);
                return a.filename.localeCompare(b.filename);
            });

            const total = orphanFiles.length;
            const makeForward = e.isGroup
                ? (data) => e.group.makeForwardMsg(data)
                : (data) => Bot.makeForwardMsg(data);

            const botInfo = {
                nickname: e.bot?.nickname || 'KH 闲置头像',
                user_id: e.bot?.uin || 0
            };

            const forwardMsgData = [];
            const displayFiles = orphanFiles.slice(0, ORPHAN_PREVIEW_LIMIT);
            const remaining = total - displayFiles.length;

            forwardMsgData.push({
                message: `闲置头像共 ${total} 个${remaining > 0 ? `（仅展示前 ${ORPHAN_PREVIEW_LIMIT} 个）` : ''}。输入 #kh清理闲置头像 清除全部 ${total} 个闲置头像。`,
                ...botInfo
            });
            for (const file of displayFiles) {
                forwardMsgData.push({
                    message: [
                        segment.image(file.fullPath),
                        `归档日期: ${file.dateDir} | ${file.filename}`
                    ],
                    ...botInfo
                });
            }
            if (remaining > 0) {
                forwardMsgData.push({
                    message: `还有 ${remaining} 张未展示。`,
                    ...botInfo
                });
            }
            const forwardMsg = await makeForward(forwardMsgData);
            await e.reply(forwardMsg);
        } catch (error) {
            log.e('展示闲置头像失败', error);
            await e.reply('获取闲置头像时发生错误，请查看控制台日志。');
        }
        return true;
    }

    async cleanOrphanAvatars(e) {
        if (!e.isMaster) return false;
        if (isDivingGroup(e, config)) return false;

        if (orphanCleaning) {
            await e.reply('当前正在进行清理操作，请稍后再试。');
            return true;
        }

        const lockKey = `${config.redisPrefix}${config.lockKeyOperation}`;
        const lock = await acquireOperationLock(redis, lockKey, config.lockTTL, 'orphan-clean');
        if (!lock) {
            await e.reply('当前已有其他操作正在进行中，请稍后再试。');
            return true;
        }

        let lostLock = false;
        const stopRenewer = startLockRenewer(lock, 30_000, () => {
            lostLock = true;
            log.w('[orphan-clean] 操作锁已失去所有权，将停止清理。');
        });

        orphanCleaning = true;

        let tempMsgId = null;
        try {
            if (e.isGroup) {
                const res = await e.reply('正在清理闲置头像……');
                if (res?.message_id) tempMsgId = res.message_id;
            }

            const prefix = `${config.redisPrefix}:`;
            const refMap = new Set();
            await scanKeys(redis, `${prefix}*`, {
                count: 500,
                callback: async (key) => {
                    const suffix = key.slice(prefix.length);
                    const parts = suffix.split(':');
                    if (parts.length !== 2) return;
                    const rawUid = decodeRedisUid(parts[1]);
                    const safeUid = encodeSafeUid(rawUid);
                    try {
                        const raw = await redis.get(key);
                        if (!raw) return;
                        const history = JSON.parse(raw);
                        if (!Array.isArray(history)) return;
                        for (const record of history) {
                            if (record.headtime) {
                                refMap.add(`${safeUid}:${record.headtime}`);
                            }
                        }
                    } catch { /* skip */ }
                }
            });

            let restoredCount = 0;
            let deletedCount = 0;
            let deletedSize = 0;
            const emptyDirs = [];

            const orphanEntries = await fs.readdir(orphansDir, { withFileTypes: true });
            const dateDirs = orphanEntries.filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name));

            for (const dir of dateDirs) {
                if (lostLock) {
                    log.w('[orphan-clean] 操作锁已失去所有权，中止清理。');
                    break;
                }
                const dirPath = path.join(orphansDir, dir.name);
                let dirHasFiles = false;
                try {
                    const subEntries = await fs.readdir(dirPath, { withFileTypes: true });
                    const jpgFiles = subEntries.filter(e => e.isFile() && e.name.endsWith('.jpg'));

                    for (const f of jpgFiles) {
                        if (lostLock) {
                            log.w('[orphan-clean] 操作锁已失去所有权，中止当前目录处理。');
                            dirHasFiles = true;
                            break;
                        }
                        const filePath = path.join(dirPath, f.name);
                        const normalized = normalizeFileEntry(f.name);
                        if (!normalized) {
                            try {
                                const st = fsSync.statSync(filePath);
                                deletedSize += st.size;
                                fsSync.unlinkSync(filePath);
                                deletedCount++;
                            } catch (err) {
                                log.d(`[orphan-clean] 删除文件失败: ${f.name}: ${err.message}`);
                                dirHasFiles = true;
                            }
                            continue;
                        }

                        const refKey = `${normalized.safeUid}:${normalized.headtime}`;
                        if (refMap.has(refKey)) {
                            const targetPath = path.join(headsDir, f.name);
                            try {
                                fsSync.renameSync(filePath, targetPath);
                                restoredCount++;
                                log.i(`[orphan-clean] 恢复文件: ${f.name}`);
                            } catch (moveErr) {
                                log.e(`[orphan-clean] 恢复文件失败: ${f.name}`, moveErr);
                                dirHasFiles = true;
                            }
                        } else {
                            try {
                                const st = fsSync.statSync(filePath);
                                fsSync.unlinkSync(filePath);
                                deletedSize += st.size;
                                deletedCount++;
                            } catch (err) {
                                log.d(`[orphan-clean] 删除文件失败: ${f.name}: ${err.message}`);
                                dirHasFiles = true;
                            }
                        }
                    }

                    if (!dirHasFiles) {
                        try {
                            const remaining = await fs.readdir(dirPath);
                            if (remaining.length === 0) {
                                emptyDirs.push(dirPath);
                            }
                        } catch (err) {
                            log.d(`[orphan-clean] 检查目录内容失败: ${dir.name}: ${err.message}`);
                        }
                    }
                } catch (err) {
                    log.d(`[orphan-clean] 跳过不可读目录: ${dir.name}: ${err.message}`);
                }
            }

            for (const dirPath of emptyDirs) {
                try {
                    fsSync.rmdirSync(dirPath);
                } catch (rmdirErr) {
                    log.e(`[orphan-clean] 删除空目录失败: ${dirPath}`, rmdirErr);
                }
            }

            let msg = '闲置头像清理完成\n';
            msg += '===========================\n';
            if (restoredCount > 0) {
                msg += `恢复：${restoredCount} 个文件（已被重新引用）\n`;
            }
            msg += `删除：${deletedCount} 个文件\n`;
            msg += `释放：${formatBytes(deletedSize)}`;

            await e.reply(msg);

            if (tempMsgId && e.isGroup) {
                try {
                    await e.group.recallMsg(tempMsgId);
                } catch (recallErr) {
                    log.e(`撤回提示消息失败: ${recallErr.message}`);
                }
            }
        } catch (error) {
            log.e('清理闲置头像失败', error);
            await e.reply('清理闲置头像时发生错误，请查看控制台日志。');
        } finally {
            stopRenewer();
            await lock.release().catch(err => log.w(`[orphan-clean] 锁释放失败: ${err.message}`));
            orphanCleaning = false;
        }
        return true;
    }
}