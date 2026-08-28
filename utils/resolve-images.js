/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-28
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-28 23:27:08
 * @FilePath: /kh-plugin/utils/resolve-images.js
 * @Description: 从指令事件中解析图片来源，返回 { sender, at, reply } 结构。
 *               sender: 发送者头像
 *               at: @用户头像列表
 *               reply: 引用消息中的图片列表（支持提取合并转发中的图片）
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { log } from './logger.js';

export function getAvatarUrl(qq) {
	return `https://q1.qlogo.cn/g?b=qq&s=640&nk=${qq}`;
}

export async function downloadAvatar(userId) {
	const response = await fetch(getAvatarUrl(userId), { signal: AbortSignal.timeout(10000) });
	if (!response.ok) throw new Error(`头像下载失败：HTTP ${response.status}`);
	return Buffer.from(await response.arrayBuffer());
}

function extractForwardId(seg) {
	if (!seg) return null;

	if (seg.type === 'forward') {
		return seg.id || seg.data?.id || null;
	}

	if (seg.type === 'xml') {
		const xmlContent = seg.data?.xml || seg.xml || '';
		const match = xmlContent.match(/m_resid="([^"]+)"/) || xmlContent.match(/resid="([^"]+)"/);
		if (match) return match[1];
	}

	if (seg.type === 'json') {
		try {
			const jsonStr = typeof seg.data?.json === 'string' ? seg.data.json :
				(typeof seg.data?.json === 'object' ? JSON.stringify(seg.data.json) : '');
			if (jsonStr) {
				const jsonData = JSON.parse(jsonStr);
				if (jsonData?.app === 'com.tencent.multimsg') {
					return jsonData?.meta?.detail?.resid || null;
				}
			}
		} catch (e) { /* ignore */ }
	}

	return null;
}

async function resolveForwardRecursive(group, messageArray, depth = 0) {
	const MAX_DEPTH = 10;
	const segments = [];

	if (depth > MAX_DEPTH) {
		log.w('resolveImages: 合并转发嵌套深度超过 ' + MAX_DEPTH + ' 层，停止递归');
		return segments;
	}

	for (const msg of messageArray) {
		if (!msg.message) continue;

		for (const seg of msg.message) {
			const nestedForwardId = extractForwardId(seg);

			if (nestedForwardId) {
				try {
					const nestedContent = seg.content || seg.data?.content;
					if (nestedContent && Array.isArray(nestedContent) && nestedContent.length > 0) {
						const nested = await resolveForwardRecursive(group, nestedContent, depth + 1);
						segments.push(...nested);
					} else if (group?.getForwardMsg) {
						const nestedData = await group.getForwardMsg(nestedForwardId);
						if (nestedData && nestedData.length > 0) {
							const nested = await resolveForwardRecursive(group, nestedData, depth + 1);
							segments.push(...nested);
						}
					}
				} catch (err) {
					log.w('resolveImages: 获取嵌套合并转发失败 (depth=' + (depth + 1) + ')', err);
				}
			} else {
				segments.push(seg);
			}
		}
	}

	return segments;
}

function extractImagesFromSegments(segments) {
	const images = [];
	for (const seg of segments) {
		if (seg.type === 'image' && seg.url) {
			images.push(seg.url);
		}
	}
	return images;
}

export async function resolveImages(e) {
	const result = {
		sender: getAvatarUrl(e.user_id),
		at: [],
		reply: []
	};

	if (e.at) {
		const atList = Array.isArray(e.at) ? e.at : [e.at];
		for (const qq of atList) {
			result.at.push(getAvatarUrl(qq));
		}
	}

	if (e.reply_id) {
		try {
			const replyMsg = await e.getReply();
			if (replyMsg && replyMsg.message) {
				const isForward = replyMsg.message.find(m =>
					m.type === 'forward' || m.type === 'xml' || m.type === 'json'
				);

				if (isForward) {
					try {
						const forwardContent = isForward.content || isForward.data?.content;
						if (forwardContent && Array.isArray(forwardContent) && forwardContent.length > 0) {
							const segments = await resolveForwardRecursive(e.group, forwardContent);
							result.reply = extractImagesFromSegments(segments);
						} else if (e.group?.getForwardMsg) {
							let forwardId = extractForwardId(isForward);
							if (!forwardId) forwardId = replyMsg.source?.id || replyMsg.id;
							if (forwardId) {
								const forwardData = await e.group.getForwardMsg(forwardId);
								if (forwardData && forwardData.length > 0) {
									const segments = await resolveForwardRecursive(e.group, forwardData);
									result.reply = extractImagesFromSegments(segments);
								}
							}
						} else {
							result.reply = extractImagesFromSegments(replyMsg.message);
						}
					} catch (err) {
						log.w('resolveImages: 解析合并转发失败，降级使用原消息', err);
						result.reply = extractImagesFromSegments(replyMsg.message);
					}
				} else {
					result.reply = extractImagesFromSegments(replyMsg.message);
				}
			}
		} catch (err) {
			log.w('resolveImages: 获取回复消息失败', err);
		}
	}

	return result;
}