/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-15 16:20:49
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-15 17:43:38
 * @FilePath: /kh-plugin/apps/leave-notice.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { getHistory } from '../components/storage.js';
import { renderHistory } from '../render/history-renderer.js';
import { config } from '../components/runtime.js';
import { getGroupName } from '../utils/group-name.js';
import { log } from '../utils/logger.js';

export class KhLeaveNotice extends plugin {
  constructor() {
    super({
      name: 'kh插件-退群通知',
      dsc: '退群时发送身份历史记录图片',
      event: 'notice.group.decrease',
      priority: 100,
    });
    this.tips = '退群了';
  }

  async accept() {
    if (this.e.user_id == this.e.self_id) return;

    const userId = this.e.user_id;
    const groupId = this.e.group_id;
    const e = this.e;

    // 潜水群
    if ((config.divingGroups || []).includes(Number(groupId))) {
      log.i(`[退群通知-身份记录] 群${groupId}位于潜水群列表，跳过退群通知。`);
      return 'return';
    }

    // 非全群启用时，仅在指定列表中配置的群启用
    if (!config.leaveNoticeAllGroups) {
      if (!(config.leaveNoticeGroups || []).includes(Number(groupId))) {
        log.i(`[退群通知-身份记录] 退群通知未全群启用，群${groupId}不在指定群列表中。`);
        return;
      }
    }

    const name = e.member?.card || e.member?.nickname || String(userId);
    const msg = `${name}(${userId}) ${this.tips}`;

    log.m(`[退群通知-身份记录]${e.logText} ${msg}`);

    const history = await getHistory(redis, config, groupId, userId);

    if (history && history.length > 0) {
      const gname = getGroupName(groupId, e.bot);
      const member = {
        user_id: userId,
        card: e.member?.card,
        nickname: e.member?.nickname,
        join_time: 0,
        last_sent_time: 0,
        shut_up_timestamp: 0,
      };

      try {
        const img = await renderHistory({
          e,
          groupId,
          gname,
          member,
          inquirer: member,
          fullHistory: history,
          renderLimit: config.maxRenderLength || 10,
          showTimeline: true,
          redis,
          config,
          commonGroupCount: 1,
        });

        if (img) {
          await this.reply([msg, img]);
          return 'return';
        }
      } catch (err) {
        log.e(`[退群通知-身份记录] 渲染失败: ${err.message}`);
      }
    }

    await this.reply(msg);
    return 'return';
  }
}