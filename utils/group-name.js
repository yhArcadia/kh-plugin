/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 00:44:27
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 01:21:58
 * @FilePath: /kh-plugin/utils/group-name.js
 * @Description: 获取群名
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
/**
 * 获取群名
 * @param {number|string} gid 群号
 * @param {object} [bot] bot 实例，不传则用全局 Bot
 * @returns {string} 群名，取不到时返回群号字符串
 */
export function getGroupName(gid, bot) {
  const gidStr = String(gid);
  try {
    const b = bot || (typeof global !== 'undefined' && global.Bot) || (typeof globalThis !== 'undefined' && globalThis.Bot);
    if (!b) return gidStr;
    const groupInfo = b.gl?.get(Number(gid)) || b.gl?.get(gidStr);
    if (groupInfo) {
      return groupInfo.group_name || groupInfo.name || gidStr;
    }
    return b.pickGroup?.(gid)?.name || gidStr;
  } catch {
    return gidStr;
  }
}