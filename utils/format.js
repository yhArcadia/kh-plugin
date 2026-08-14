/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-07 00:23:33
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-14 23:17:45
 * @FilePath: /kh-plugin/utils/format.js
 * @Description: 一些格式化工具
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import moment from 'moment';

// 将秒数格式化为年月日时分秒
export function formatDuration(seconds) {
    if (!seconds || seconds <= 0) {
        return "片刻";
    }

    const d = moment.duration(seconds, 'seconds');

    const units = [
        { value: d.years(), label: '年' },
        { value: d.months(), label: '个月' },
        { value: d.days(), label: '天' },
        { value: d.hours(), label: '小时' },
        { value: d.minutes(), label: '分钟' },
        { value: d.seconds(), label: '秒' }
    ];

    const startIndex = units.findIndex(u => u.value > 0);

    if (startIndex === -1) {
        return "刚刚";
    }

    const top3Units = units.slice(startIndex, startIndex + 3);

    const result = top3Units
        .filter(u => u.value > 0)
        .map(u => `${u.value}${u.label}`)
        .join('');

    return result || "片刻";
}


// 计算 QQ 等级图标
export function getLevelIcons(level) {
    if (level <= 0) return '零级';
    const crowns = Math.floor(level / 64);
    level %= 64;
    const suns = Math.floor(level / 16);
    level %= 16;
    const moons = Math.floor(level / 4);
    level %= 4;
    const stars = level;

    return '👑'.repeat(crowns) + '☀️'.repeat(suns) + '🌙'.repeat(moons) + '⭐'.repeat(stars);
}

// 生成进度条
export function getProgressBar(current, total, barLength = 40) {
    const progress = current / total;
    const filledLength = Math.round(barLength * progress);
    const emptyLength = barLength - filledLength;
    const filledStr = '█'.repeat(filledLength);
    const emptyStr = '░'.repeat(emptyLength);
    const percent = (progress * 100).toFixed(1);

    return `${filledStr}${emptyStr} ${percent}% (${current}/${total})`;
}

