/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-05 17:43:40
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-08 16:57:52
 * @FilePath: /kh-plugin/services/orphan-scanner.js
 * @Description: 闲置头像扫描服务
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs';
import path from 'node:path';
import { scanKeys } from '../components/storage.js';
import { encodeSafeUid, decodeSafeUid, decodeRedisUid } from '../utils/uid-encoder.js';
import { ensureOrphanDirs } from '../components/paths.js';
import { log } from '../utils/logger.js';

const OLD_FORMAT_RE = /^(\d+)_(.+)_(\d+)\.jpg$/i;
const NEW_FORMAT_RE = /^(.+)_(\d+)\.jpg$/i;

export async function runOrphanScan({ redis, config, headsDir, operation = null }) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const stats = {
        scanned: 0,
        orphaned: 0,
        orphanedSize: 0,
        hardlinkCleaned: 0,
        contentCleaned: 0,
        errors: 0
    };

    log.m('[闲置头像扫描] 开始扫描...');

    const refs = new Set();
    const prefix = `${config.redisPrefix}:`;

    await scanKeys(redis, `${prefix}*`, {
        count: 500,
        callback: async (key) => {
            const keySuffix = key.slice(prefix.length);
            const parts = keySuffix.split(':');
            if (parts.length !== 2 || parts[0] === 'lock' || parts[0] === 'remark') return;

            try {
                const raw = await redis.get(key);
                if (!raw) return;
                const history = JSON.parse(raw);
                if (!Array.isArray(history)) return;

                const uid = decodeRedisUid(parts[1]);

                for (const record of history) {
                    if (record.headtime) {
                        refs.add(`${uid}:${record.headtime}`);
                    }
                }
            } catch (err) {
                stats.errors++;
                log.w(`[闲置头像扫描] 解析 key ${key} 失败: ${err.message}`);
            }
        }
    });

    log.m(`[闲置头像扫描] Redis 引用收集完成，共 ${refs.size} 个 (uid, headtime) 对`);

    if (operation?.isLost?.()) {
        log.w('[闲置头像扫描] 操作锁已失去所有权，中止扫描。');
        return stats;
    }

    const entries = fs.readdirSync(headsDir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.jpg'));

    const oldFiles = [];
    const newFiles = [];

    for (const file of files) {
        const name = file.name;
        stats.scanned++;

        const oldMatch = name.match(OLD_FORMAT_RE);
        if (oldMatch) {
            oldFiles.push({
                name,
                gid: oldMatch[1],
                uid: oldMatch[2],
                headtime: Number(oldMatch[3]),
                fullPath: path.join(headsDir, name)
            });
            continue;
        }

        const newMatch = name.match(NEW_FORMAT_RE);
        if (newMatch) {
            newFiles.push({
                name,
                safeUid: newMatch[1],
                headtime: Number(newMatch[2]),
                fullPath: path.join(headsDir, name)
            });
        }
    }

    let dateDir = null;
    const ensureDateDir = () => {
        if (!dateDir) dateDir = ensureOrphanDirs(dateStr);
        return dateDir;
    };
    const keptOldFiles = [];

    for (const file of newFiles) {
        let uid;
        try {
            uid = decodeSafeUid(file.safeUid);
        } catch {
            uid = file.safeUid;
        }
        if (refs.has(`${uid}:${file.headtime}`)) {
            // log.i(`[闲置头像扫描] 保留 活跃头像: ${file.name}`);
            continue;
        }

        try {
            const dest = path.join(ensureDateDir(), file.name);
            fs.renameSync(file.fullPath, dest);
            stats.orphaned++;
            const size = fs.statSync(dest).size;
            stats.orphanedSize += size;
            log.i(`[闲置头像扫描] 迁移 闲置头像: ${file.name} (${(size / 1024).toFixed(1)} KB) -> orphans/${dateStr}/`);
        } catch (err) {
            stats.errors++;
            log.w(`[闲置头像扫描] 迁移文件 ${file.name} 失败: ${err.message}`);
        }
    }

    for (const file of oldFiles) {
        if (refs.has(`${file.uid}:${file.headtime}`)) {
            keptOldFiles.push(file);
            // log.i(`[闲置头像扫描] 保留 活跃头像(旧格式): ${file.name}`);
            continue;
        }

        try {
            const dest = path.join(ensureDateDir(), file.name);
            fs.renameSync(file.fullPath, dest);
            stats.orphaned++;
            const size = fs.statSync(dest).size;
            stats.orphanedSize += size;
            log.i(`[闲置头像扫描] 迁移 闲置头像(旧格式): ${file.name} (${(size / 1024).toFixed(1)} KB) -> orphans/${dateStr}/`);
        } catch (err) {
            stats.errors++;
            log.w(`[闲置头像扫描] 迁移文件 ${file.name} 失败: ${err.message}`);
        }
    }

    for (const file of keptOldFiles) {
        const safeUid = encodeSafeUid(file.uid);
        const newPath = path.join(headsDir, `${safeUid}_${file.headtime}.jpg`);

        if (!fs.existsSync(newPath)) {
                log.i(`[闲置头像扫描] 保留旧格式文件: ${file.name} (新格式 ${path.basename(newPath)} 不存在)`);
                continue;
            }

        try {
            const oldStat = fs.statSync(file.fullPath);
            const newStat = fs.statSync(newPath);

            if (oldStat.ino === newStat.ino) {
                fs.unlinkSync(file.fullPath);
                stats.hardlinkCleaned++;
                log.i(`[闲置头像扫描] 清理 硬链接冗余: ${file.name} (与新格式 ${path.basename(newPath)} 指向同一 inode)`);
            } else if (oldStat.size === newStat.size) {
                fs.unlinkSync(file.fullPath);
                stats.contentCleaned++;
                log.i(`[闲置头像扫描] 清理 内容冗余: ${file.name} (${(oldStat.size / 1024).toFixed(1)} KB，与新格式 ${path.basename(newPath)} 大小相同)`);
            }
        } catch (err) {
            stats.errors++;
            log.w(`[闲置头像扫描] 清理冗余文件 ${file.name} 失败: ${err.message}`);
        }
    }

    log.m(
        `[闲置头像扫描] 完成！` +
        `扫描 ${stats.scanned} 个文件，` +
        `迁移 ${stats.orphaned} 个闲置头像 (${(stats.orphanedSize / 1024 / 1024).toFixed(2)} MB)，` +
        `清理 ${stats.hardlinkCleaned} 个硬链接冗余，` +
        `清理 ${stats.contentCleaned} 个内容冗余，` +
        `错误 ${stats.errors} 个`
    );

    return stats;
}