/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-07 00:23:33
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-22 22:28:54
 * @FilePath: /kh-plugin/utils/group-policy.js
 * @Description: 潜水群判定
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { config as runtimeConfig } from '../components/runtime.js';
import { log } from "./logger.js";

// 判断潜水群
export function isDivingGroup(e, config = runtimeConfig) {
    let isDiving = false
    if (e.isGroup && (config.divingGroups || []).includes(Number(e.group_id))) {
        isDiving = true
        let gname = e.group_name || e.group_id.toString();
        log.i(`群【${gname}】位于潜水群列表，将不会触发显式消息反馈。`);
    }
    return isDiving
}
