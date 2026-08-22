/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-19 21:41:45
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-22 22:30:56
 * @FilePath: /kh-plugin/apps/help.js
 * @Description: 帮助文档
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { BaseApp } from '../components/base-app.js';
import { helpScreenshot } from '../components/help.js';
import { log } from '../utils/logger.js';
import { isDivingGroup } from '../utils/group-policy.js';

export class KhHelp extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-帮助',
            dsc: 'kh插件 指令帮助',
            priority: 4999,
            rule: [
                {
                    reg: '^#?kh帮助$',
                    fnc: 'khHelp'
                }
            ]
        });
    }

    async khHelp(e) {
        if (isDivingGroup(e)) return false;
        try {
            await helpScreenshot(e);
        } catch (error) {
            log.e(`渲染帮助信息失败: ${error.message}`);
            await e.reply('帮助信息渲染失败，请检查 resources/help/help.md 与 Puppeteer。');
        }
        return true;
    }
}
