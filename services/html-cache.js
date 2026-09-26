/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-26 16:44:35
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-26 16:59:23
 * @FilePath: /kh-plugin/services/html-cache.js
 * @Description: kh插件临时HTML缓存服务
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const KH_HTML_DIR_NAMES = new Set([
    'who_are_you',
    'who_are_you_profile',
    'who_are_you_rank',
    'who_are_you_help',
    'who_are_you_version'
]);

function isKhHtmlDir(name) {
    return KH_HTML_DIR_NAMES.has(name);
}

async function walkFiles(dir, files = []) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return files;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await walkFiles(fullPath, files);
        else if (entry.isFile()) files.push(fullPath);
    }
    return files;
}

export async function collectKhHtmlCacheStats(htmlRoot) {
    const stats = { totalFiles: 0, totalSize: 0, directories: [] };
    let entries;
    try {
        entries = await fs.readdir(htmlRoot, { withFileTypes: true });
    } catch {
        return stats;
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || !isKhHtmlDir(entry.name)) continue;
        const files = await walkFiles(path.join(htmlRoot, entry.name));
        let size = 0;
        for (const file of files) {
            try { size += (await fs.stat(file)).size; } catch { /* 文件可能在扫描时消失 */ }
        }
        stats.totalFiles += files.length;
        stats.totalSize += size;
        stats.directories.push({ name: entry.name, files: files.length, size });
    }
    stats.directories.sort((a, b) => b.size - a.size);
    return stats;
}

export async function cleanKhHtmlCache(htmlRoot, log = null) {
    const stats = await collectKhHtmlCacheStats(htmlRoot);
    let deletedFiles = 0;
    let deletedSize = 0;
    for (const directory of stats.directories) {
        const dirPath = path.join(htmlRoot, directory.name);
        const files = await walkFiles(dirPath);
        for (const file of files) {
            try {
                const fileStat = await fs.stat(file);
                await fs.unlink(file);
                deletedFiles++;
                deletedSize += fileStat.size;
            } catch (err) {
                log?.d?.(`[html-cache-clean] 删除失败: ${file}: ${err.message}`);
            }
        }
        // 只删除 KH 缓存目录下已经为空的子目录，保留根目录结构。
        const removeEmptyDirs = async (dir) => {
            let children;
            try { children = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
            for (const child of children) {
                if (child.isDirectory()) await removeEmptyDirs(path.join(dir, child.name));
            }
            try {
                if ((await fs.readdir(dir)).length === 0 && dir !== dirPath) await fs.rmdir(dir);
            } catch { /* 忽略并发渲染或权限变化 */ }
        };
        await removeEmptyDirs(dirPath);
    }
    return { deletedFiles, deletedSize };
}
