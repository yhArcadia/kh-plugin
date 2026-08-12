/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-09 19:36:23
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-12 16:10:11
 * @FilePath: /kh-plugin/utils/logger.js
 * @Description: 覆写logger，添加插件专属前缀。
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

const PREFIX = '[kh-plugin] ';

function write(level, ...args) {
    const method = logger[level];
    if (typeof method !== 'function') return;

    if (typeof args[0] === 'string') {
        method.call(logger, `${PREFIX} ${args[0]}`, ...args.slice(1));
        return;
    }

    method.call(logger, PREFIX, ...args);
}

export const log = {
    d: (...args) => write('debug', ...args),
    i: (...args) => write('info', ...args),
    w: (...args) => write('warn', ...args),
    e: (...args) => write('error', ...args),
    m: (...args) => write('mark', ...args)
};