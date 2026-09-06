/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:52:03
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-06 20:43:39
 * @FilePath: /kh-plugin/apps/scheduler.js
 * @Description: 定时任务初始化（不继承 plugin，由 index.js 统一调用）
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { Scheduler } from '../components/scheduler.js';
import { config, getBot, memberUpdater, schedulerState } from '../components/runtime.js';
import { log } from '../utils/logger.js';
import { isGroupAllowed } from '../utils/group-policy.js';
import { runOrphanScan } from '../services/orphan-scanner.js';
import { headsDir } from '../components/paths.js';

async function scheduleUpdateCore(operation = null) {
    const Bot = getBot();
    if (!Bot) {
        log.w(`定时任务核心逻辑无法获取 Bot 实例，跳过本次更新。`);
        return;
    }
    log.i(`开始定时更新群员信息 (${config.autoUpdateGroups.join(', ')})`);
    let totalCount = 0;
    for (const gid of config.autoUpdateGroups) {
        if (operation?.isLost?.()) {
            log.w(`自动更新操作锁已失去所有权，中止本次更新循环。`);
            break;
        }
        if (!isGroupAllowed(gid, config)) {
            log.w(`群 ${gid} 在黑名单或未在白名单中，跳过定时更新。`);
            continue;
        }
        try {
            const updatedUids = await memberUpdater.updateGroupMemberInfo(
                gid, Bot,
                async () => !operation?.isLost?.() && (operation ? await operation.owns() : true)
            );
            totalCount += updatedUids.length;
        } catch (err) {
            log.e(`定时更新群 ${gid} 时出错: ${err}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log.i(`定时更新完成，共更新 ${totalCount} 条群员信息`);
}

async function scheduleOrphanScan(operation = null) {
    log.i('[闲置头像扫描] 定时任务触发');
    await runOrphanScan({ redis, config, headsDir, operation });
}

export function initScheduler() {
    if (process.env.WHO_ARE_YOU_DISABLE_SCHEDULER === '1') return;

    const state = schedulerState();

    if (state.scheduler) {
        state.scheduler.config = config;
        state.scheduler.run = (operation) => scheduleUpdateCore(operation);
        state.scheduler.log = log;
        state.scheduler.reschedule();
    } else {
        state.scheduler = new Scheduler({
            config,
            redis,
            run: (operation) => scheduleUpdateCore(operation),
            log,
            label: '群员信息更新'
        });
        state.scheduler.start();
    }

    if (state.orphanScheduler) {
        state.orphanScheduler.config = config;
        state.orphanScheduler.run = (operation) => scheduleOrphanScan(operation);
        state.orphanScheduler.log = log;
        state.orphanScheduler.reschedule();
    } else {
        state.orphanScheduler = new Scheduler({
            config,
            redis,
            run: (operation) => scheduleOrphanScan(operation),
            log,
            scheduleKey: 'orphanScanSchedule',
            label: '闲置头像扫描'
        });
        state.orphanScheduler.start();
    }
}