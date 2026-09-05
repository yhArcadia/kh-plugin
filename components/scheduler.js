/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:57
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-06 01:20:19
 * @FilePath: /kh-plugin/components/scheduler.js
 * @Description: 定时任务
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { acquireOperationLock, startLockRenewer } from './operation-lock.js';
import { log as defaultLog } from '../utils/logger.js';

export class Scheduler {
  constructor({ config, redis, run, log = defaultLog, scheduleKey = 'updateSchedule', label = '定时任务' }) {
    this.config = config;
    this.redis = redis;
    this.run = run;
    this.log = log;
    this.scheduleKey = scheduleKey;
    this.label = label;
    this.job = null;
  }

  start() {
    if (this.job || process.env.WHO_ARE_YOU_DISABLE_SCHEDULER === '1') return;
    import('node-schedule').then(({ default: schedule }) => {
      if (this.job) return;
      this.job = schedule.scheduleJob(this.config[this.scheduleKey], () => this.execute().catch(err => this.log.w(`[kh-plugin] 定时任务设置失败: ${err.message}`)));
      this.log.m(`[kh-plugin] ${this.label}已设置: ${this.config[this.scheduleKey]}`);
    }).catch(err => this.log.w(`无法加载 node-schedule: ${err.message}`));
  }

  stop() { if (this.job) this.job.cancel(); this.job = null; }

  reschedule() {
    if (!this.job) return;
    this.stop();
    this.start();
  }

  async execute() {
    const key = `${this.config.redisPrefix}${this.config.lockKeyOperation}`;
    const lock = await acquireOperationLock(this.redis, key, this.config.lockTTL, 'auto-update');
    if (!lock) return false;

    let lost = false;
    const stopRenewer = startLockRenewer(
      lock,
      Math.max(1_000, Math.floor(Number(this.config.lockTTL || 3600) * 500)),
      () => {
        lost = true;
        this.log.w('自动更新操作锁已失去所有权，将停止后续群更新。');
      }
    );
    try {
      await this.run({ ...lock, isLost: () => lost });
      return !lost;
    } finally {
      stopRenewer();
      await lock.release().catch(err => this.log.w(`自动更新锁释放失败: ${err.message}`));
    }
  }
}