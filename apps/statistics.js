// 先做纯文本，有空了渲染成图表

import fs from 'node:fs/promises';
import path from 'node:path';
import { isDivingGroup } from '../utils/group-policy.js';
import { headDir } from '../components/runtime.js';
import { log } from '../utils/logger.js';

const AVATAR_FILE_RE = /^(\d+)_(\d+)_(\d+)\.jpg$/i;
const STAT_CONCURRENCY = 48;

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );
    const value = bytes / (1024 ** index);

    return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[index]}`;
}

function maskGroupName(name) {
    const chars = Array.from(String(name || '').trim());

    // 三字及以上
    if (chars.length >= 3) return `${chars[0]}** ${chars.at(-1)}`;

    // 两字群名隐去第二个
    if (chars.length === 2) return `${chars[0]}**`;

    // 单字或空群名
    return '**';
}

function maskGroupId(groupId) {
    const text = String(groupId);

    // 无法拿到群名时：只保留前两位与后两位。
    return text.length <= 4
        ? `${text.slice(0, 2)}**`
        : `${text.slice(0, 2)}** ${text.slice(-2)}`;
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    const runners = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (true) {
                const index = cursor++;
                if (index >= items.length) return;
                results[index] = await worker(items[index]);
            }
        }
    );

    await Promise.all(runners);
    return results;
}

async function collectAvatarStats(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter(
        entry => entry.isFile() && AVATAR_FILE_RE.test(entry.name)
    );

    // 读取文件元数据 size，限制并发
    const records = await mapWithConcurrency(
        files,
        STAT_CONCURRENCY,
        async entry => {
            const match = entry.name.match(AVATAR_FILE_RE);

            try {
                const stat = await fs.stat(path.join(dir, entry.name));
                return { groupId: match[1], size: stat.size };
            } catch (error) {
                log.w(`统计时跳过无法读取的头像文件 ${entry.name}:${error.message}`);
                return null;
            }
        }
    );

    const groups = new Map();
    let count = 0;
    let bytes = 0;

    for (const record of records) {
        if (!record) continue;

        count += 1;
        bytes += record.size;

        const group = groups.get(record.groupId) || {
            groupId: record.groupId,
            count: 0,
            bytes: 0
        };

        group.count += 1;
        group.bytes += record.size;
        groups.set(record.groupId, group);
    }

    return {
        count,
        bytes,
        groups: [...groups.values()].sort((a, b) => b.bytes - a.bytes)
    };
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
        // 已退群、接口不可用、权限或网络异常：回退到脱敏群号。
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
                }
            ]
        });
    }

    async showStatistics(e) {
        if (!e.isMaster) return false;
        if (isDivingGroup(e)) return false;

        try {
            const stats = await collectAvatarStats(headDir);
            const isPrivate = !e.isGroup;

            // 群名查询另外限并发。
            const names = await mapWithConcurrency(
                stats.groups,
                8,
                async group => ({
                    groupId: group.groupId,
                    name: await getGroupName(e.bot || globalThis.Bot, group.groupId)
                })
            );
            const nameByGroupId = new Map(
                names.map(item => [item.groupId, item.name])
            );

            const rows = stats.groups.map((group, index) => {
                const name = nameByGroupId.get(group.groupId);

                // 私聊主显示完整群名。
                // 群聊显示打码群名。
                // 无法取得群名,显示脱敏群号。
                const label = name
                    ? (isPrivate ? name : maskGroupName(name))
                    : maskGroupId(group.groupId);

                return `${index + 1}. ${label}：${group.count.toLocaleString('zh-CN')} 张 · ${formatBytes(group.bytes)}`;
            });

            await e.reply([
                'KH 头像存储统计',
                `总头像：${stats.count.toLocaleString('zh-CN')} 张`,
                `总占用：${formatBytes(stats.bytes)}`,
                '',
                // '分群统计（按占用降序）',
                ...rows
            ].join('\n'));
        } catch (error) {
            log.e('统计 KH 头像存储失败', error);
            await e.reply('统计 KH 头像存储时发生错误，请查看控制台日志。');
        }

        return true;
    }
}