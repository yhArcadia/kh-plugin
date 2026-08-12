/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:52:03
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-12 16:46:15
 * @FilePath: /kh-plugin/apps/scheduler.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { BaseApp } from '../components/base-app.js';
import { config, memberUpdater } from '../components/runtime.js';
import { log } from '../utils/logger.js';

export class KhScheduler extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-定时更新群员信息调度',
            dsc: 'kh插件 定时更新群员信息调度',
            priority: 6000,
            startScheduler: true,
            rule: []
        });
    }

    async scheduleUpdateCore(operation = null) {

        if (!this.Bot) {
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

            let isGroupAllowed = true;
            if (config.groupWhitelist && config.groupWhitelist.length > 0) {
                isGroupAllowed = config.groupWhitelist.includes(Number(gid));
            } else {
                isGroupAllowed = !(config.groupBlacklist || []).includes(Number(gid));
            }

            if (!isGroupAllowed) {
                log.w(`群 ${gid} 在黑名单或未在白名单中，跳过定时更新。`);
                continue;
            }

            try {
                const updatedUids = await memberUpdater.updateGroupMemberInfo(
                    gid,
                    this.Bot,
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
}
