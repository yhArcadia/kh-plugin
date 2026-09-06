/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:57
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-06 20:24:27
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
    if (this._starting || this.job || process.env.WHO_ARE_YOU_DISABLE_SCHEDULER === '1') return;
    const cron = this.config[this.scheduleKey];
    if (!cron || typeof cron !== 'string' || cron.trim().split(/\s+/).length < 5) {
      this.log.w(`${this.label} cron 表达式无效: ${cron}，已跳过`);
      return;
    }
    this._starting = true;
    import('node-schedule').then(({ default: schedule }) => {
      if (this.job) { this._starting = false; return; }
      this.job = schedule.scheduleJob(cron.trim(), () => this.execute().catch(err => this.log.w(`定时任务执行失败: ${err.message}`)));
      this._starting = false;
      this.log.m(`${this.label}已设置: ${cron.trim()}`);
    }).catch(err => {
      this._starting = false;
      this.log.w(`无法加载 node-schedule: ${err.message}`);
    });
  }

  stop() { if (this.job) this.job.cancel(); this.job = null; }

  reschedule() {
    if (this.job) this.stop();
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