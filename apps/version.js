/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:52:04
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-20 16:06:59
 * @FilePath: /kh-plugin/apps/version.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { BaseApp } from '../components/base-app.js';
import { versionScreenshot } from '../components/version.js';
import { log } from '../utils/logger.js';

export class KhVersion extends BaseApp {
    constructor() {
        super({
            name: 'kh插件-版本信息',
            dsc: 'kh插件 版本信息',
            priority: 5000,
            rule: [
                {
                    reg: '^#?kh版本$',
                    fnc: 'khVersion'
                }
            ]
        });
    }

    async khVersion(e) {
        try {
            await versionScreenshot(e);
        } catch (err) {
            log.e(`渲染版本信息失败: ${err.message}`);
            await e.reply('版本信息渲染失败，请检查 CHANGELOG.md 与 Puppeteer。');
        }
        return true;
    }
}
