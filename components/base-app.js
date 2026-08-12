/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:15:20
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-12 16:38:54
 * @FilePath: /kh-plugin/components/base-app.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { rankRender } from '../render/rank-renderer.js';
import { renderHistory } from '../render/history-renderer.js';
import { config, getBot, schedulerState, OPERATION_LOCK_KEY } from './runtime.js';
import { Scheduler } from './scheduler.js';

export class BaseApp extends plugin {
  constructor({ name, dsc, rule, priority = 5000, startScheduler = false }) {
    super({
      name,
      dsc,
      event: 'message.group',
      priority,
      rule
    });
    this.config = config;
    this.Bot = getBot();
    if (!this.Bot) {
      logger.info(`[${name}] 构造时未获取到全局 Bot，将在5秒后重试...`);
      setTimeout(() => {
        this.Bot = getBot();
        if (this.Bot)
          logger.info(`[${name}] 已延迟获取到 Bot 实例。`);
        else
          logger.info(`[${name}] 延迟获取 Bot 失败。`);
      }, 5000);
    }
    if (startScheduler) this.startScheduler();
  }

  async isOperationRunning() {
    return Boolean(await redis.exists(OPERATION_LOCK_KEY));
  }


  /**
   * 渲染排行榜图片
   * @param {string} gid - 群号
   * @param {string} gname - 群名称
   * @param {number} topN - 显示前 N 名
   * @param {string} rankType - 排行类型
   * @param {string} rankTitle - 排行标题
   * @returns {Promise} 渲染结果
   */
  async rankRender(gid, gname, topN, rankType, rankTitle) {
    return rankRender({ gid, gname, topN, rankType, rankTitle, config: this.config });
  }

  /**
   * 渲染历史记录图片
   * @param {Object} e - 事件对象
   * @param {string} groupId - 群号
   * @param {string} gname - 群名称
   * @param {Object} member - 成员信息
   * @param {Object} inquirer - 查询者信息
   * @param {Array} fullHistory - 完整历史记录
   * @param {number} [renderLimit=0] - 渲染数量限制，0 表示不限制
   * @param {boolean} [showTimeline=true] - 是否显示时间线
   * @returns {Promise} 渲染结果
   */
  async imgRender(e, groupId, gname, member, inquirer, fullHistory, renderLimit = 0, showTimeline = true) {
    return renderHistory({
      e,
      groupId,
      gname,
      member,
      inquirer,
      fullHistory,
      renderLimit,
      showTimeline,
      redis,
      config: this.config,
      logger
    });
  }

  /**
   * 启动定时任务调度器
   * WHO_ARE_YOU_DISABLE_SCHEDULER 为 '1' 则不启动
   * 调度器已存在则更新运行函数，否则创建新的调度器
   */
  startScheduler() {
    const state = schedulerState();
    if (process.env.WHO_ARE_YOU_DISABLE_SCHEDULER === '1') return;
    if (state.scheduler) {
      state.scheduler.run = operation => this.scheduleUpdateCore(operation);
      state.scheduler.log = logger;
      return;
    }
    state.scheduler = new Scheduler({
      config: this.config,
      redis,
      run: operation => this.scheduleUpdateCore(operation),
      log: logger
    });
    state.scheduler.start();
  }
}
