/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-07 00:23:33
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-14 23:18:40
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
        return;
    }
    try {
        await e.bot.sendApi('set_msg_emoji_like', {
            message_id: e.message_id,
            emoji_id: emojiID,
            set: true
        });
        log.i(`已对消息 ${e.message_id} 添加表情回应 ${emojiID}`);
    } catch (emojiErr) {
        log.w(`添加表情回应 ${emojiID} 失败 (API 调用异常): ${emojiErr.message}`);
    }
}

