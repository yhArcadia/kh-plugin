/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-09 19:36:23
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-10-04 17:58:46
 * @FilePath: /kh-plugin/utils/logger.js
 * @Description: 覆写logger，添加插件专属前缀。
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { getPluginVersion } from '../components/version.js';

const subVersion = 1
const PREFIX = `[kh-plugin][v${getPluginVersion()}.${subVersion}]`;

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
    m: (...args) => write('mark', ...args),
    
    debug: (...args) => write('debug', ...args),
    info: (...args) => write('info', ...args),
    warn: (...args) => write('warn', ...args),
    error: (...args) => write('error', ...args),
    mark: (...args) => write('mark', ...args)
};