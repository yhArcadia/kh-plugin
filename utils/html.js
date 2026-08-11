/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-11 19:11:22
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-11 19:21:14
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/utils/html.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

// 文本插入HTML之前转义。
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
