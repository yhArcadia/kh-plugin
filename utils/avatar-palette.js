/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-17 20:43:43
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-17 20:48:32
 * @FilePath: /kh-plugin/utils/avatar-palette.js
 * @Description: #头像时长 的模板适配层。
 *
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { extractImageTheme } from './image-theme.js';
import { log } from './logger.js';

const DEFAULT_AVATAR_PALETTE = Object.freeze({
    avatarBorderColor: '#d9e3ef',
    durationCardBg: '#e4eef9',
    durationCardBorder: '#c7d8eb',
    accentColor: '#426f9d'
});

export async function getAvatarPalette(avatarUrl, options = {}) {
    const theme = await extractImageTheme(avatarUrl, {
        ...options,
        fallback: options.fallback || {
            accentColor: DEFAULT_AVATAR_PALETTE.accentColor,
            outlineColor: DEFAULT_AVATAR_PALETTE.avatarBorderColor,
            surfaceColor: DEFAULT_AVATAR_PALETTE.durationCardBg,
            borderColor: DEFAULT_AVATAR_PALETTE.durationCardBorder
        },
        logDebug: message => log.d(`头像时长${message}`)
    });
    return {
        avatarBorderColor: theme.outlineColor,
        durationCardBg: theme.surfaceColor,
        durationCardBorder: theme.borderColor,
        accentColor: theme.accentColor
    };
}
