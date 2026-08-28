/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-07 00:23:33
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-28 23:26:42
 * @FilePath: /kh-plugin/utils/message.js
 * @Description: 为消息添加贴表情回应。
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { log } from './logger.js';

/** 
 * 贴表情回应
 * @param {object} e - Yunzai的事件对象
 * @param {number|string} emojiID - 要添加的表情ID
 * 敬礼 = 282；
 * 🎉 = 144；
 * 摊手 = 174；
 * 尴尬 = 10；
 * 茶杯 = 60；
 * ok = 124；
 * no = 123;
 * 报j = 424；
 */
export async function setMsgEmojiLike(e, emojiID) {
    if (!e || !e.bot || !e.message_id || emojiID === undefined || emojiID === null) {
        log.w('[setMsgEmojiLike] 调用失败：缺少必要参数 e 或 emojiID。');
        return false;
    }
    try {
        await e.bot.sendApi('set_msg_emoji_like', {
            message_id: e.message_id,
            emoji_id: emojiID,
            set: true
        });
        log.i(`已对消息 ${e.message_id} 添加表情回应 ${emojiID}`);
        return true;
    } catch (emojiErr) {
        log.w(`添加表情回应 ${emojiID} 失败 (API 调用异常): ${emojiErr.message}`);
        return false;
    }
}

/** 撤回消息 */
export async function recallMessage(e, messageId) {
    try {
        if (e?.bot?.sendApi) {
            await e.bot.sendApi('delete_msg', { message_id: messageId });
            return true;
        }
        if (e?.group?.recallMsg) {
            await e.group.recallMsg(messageId);
            return true;
        }
    } catch (error) {
        log.w(`[recallMessage] 撤回消息失败：${error?.message || error}`);
    }
    return false;
}

/** 从事件中提取被 @ 的用户 ID（不含机器人自身） */
export function mentionedUserId(e) {
    if (e?.at && String(e.at) !== String(e.self_id || '')) return String(e.at);
    const segment = Array.isArray(e?.message)
        ? e.message.find(item =>
            item?.type === 'at' &&
            String(item?.qq || item?.data?.qq || '') !== String(e.self_id || '')
        )
        : null;
    return segment ? String(segment.qq || segment.data?.qq || '') : '';
}