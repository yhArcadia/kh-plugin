/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-04 22:45:46
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-05 00:57:30
 * @FilePath: /kh-plugin/utils/uid-encoder.js
 * @Description: ID编码
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import crypto from 'node:crypto';

const MAX_FILENAME_LENGTH = 200;

export function encodeSafeUid(uid) {
    const encoded = encodeURIComponent(String(uid));
    if (encoded.length <= MAX_FILENAME_LENGTH) return encoded;

    const hash = crypto.createHash('md5').update(encoded).digest('hex').slice(0, 16);
    const prefix = encoded.slice(0, MAX_FILENAME_LENGTH - 17);
    return `${prefix}_${hash}`;
}

export function encodeRedisUid(uid) {
    return String(uid).replace(/:/g, '_');
}

export function decodeSafeUid(safeUid) {
    try {
        return decodeURIComponent(safeUid);
    } catch {
        return safeUid;
    }
}