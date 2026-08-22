/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:52:03
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-22 22:37:02
 * @FilePath: /kh-plugin/apps/update.js
 * @Description: 更新插件
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import { update as YunzaiUpdate } from '../../other/update.js';
import { isDivingGroup } from '../utils/group-policy.js';

export class KhUpdate extends plugin {
    constructor() {
        super({
            name: 'kh插件-插件更新',
            dsc: '调用 Yunzai 标准更新器更新 kh-plugin',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^#?kh(插件)?(强制)?更新$',
                    fnc: 'updatePlugin',
                    permission: 'master'
                },
                {
                    reg: '^#?kh(插件)?更新日志$',
                    fnc: 'updateLog',
                    permission: 'master'
                }
            ]

        });
    }

    async updatePlugin() {
        if (isDivingGroup(this.e)) return false;
        const updater = new YunzaiUpdate(this.e);
        updater.e = {
            ...this.e,
            msg: this.e.msg.includes('强制')
                ? '#强制更新kh-plugin'
                : '#更新kh-plugin'
        };

        return updater.update();
    }

    async updateLog() {
        if (isDivingGroup(this.e)) return false;
        const updater = new YunzaiUpdate(this.e);

        updater.e = {
            ...this.e,
            msg: '#更新日志kh-plugin'
        };

        return updater.updateLog();
    }
}
