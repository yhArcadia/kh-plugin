/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:54:45
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 19:57:56
 * @FilePath: /kh-plugin/guoba/actions/helpers.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
export function resultOk(Result, data, message = '操作成功') {
    return Result?.ok ? Result.ok(data, message) : { ok: true, data, message };
}

export function resultError(Result, message) {
    return Result?.error ? Result.error(message) : { ok: false, message };
}

export function redisClient() {
    if (!global.redis) throw new Error('Redis 尚未连接，无法读取 kh-plugin 数据。');
    return global.redis;
}

export function parseKey(key, prefix) {
    const rest = key.slice(`${prefix}:`.length).split(':');
    if (rest.length !== 2 || !/^\d+$/.test(rest[0]) || !/^\d+$/.test(rest[1])) return null;
    return { groupId: Number(rest[0]), userId: Number(rest[1]) };
}

export async function normalizeActionArgs(args, keys) {
    if (Array.isArray(args)) return Object.fromEntries(keys.map((key, index) => [key, args[index]]));
    return args && typeof args === 'object' ? args : {};
}

export function briefActionResult(action, data) {
    if (action === 'statistics')
        return `已统计 ${data.scannedMemberKeys} 个成员索引、${data.scannedRecords} 条身份记录，涉及 ${data.groups.length} 个群${data.capped ? '（达到扫描上限）' : ''}。`;
    if (action === 'members')
        return `群 ${data.groupId}：第 ${data.page} 页返回 ${data.items.length} 人，共扫描到 ${data.totalMembers} 名成员${data.capped ? '（达到扫描上限）' : ''}。`;
    if (action === 'memberHistory')
        return `群 ${data.groupId} 的 QQ ${data.userId}：共 ${data.totalRecords} 条记录，返回最近 ${data.records.length} 条${data.truncated ? '。' : '。'}`;
    if (action === 'blacklistPreview')
        return `已整理 ${data.length} 名黑名单成员的最新昵称/头像预览。`;
    return '操作成功。';
}

export async function runAction(action, input, context = {}) {
    const Result = context?.Result;
    try {
        const data = await action(input);
        return resultOk(Result, data, briefActionResult(action.name, data));
    } catch (error) {
        return resultError(Result, error?.message || '操作失败。');
    }
}