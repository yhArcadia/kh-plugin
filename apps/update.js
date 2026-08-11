/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:52:03
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-09 22:02:39
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/apps/update.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
export class WhoPluginUpdate extends plugin {
    constructor() {
        super({
            name: 'Who插件-插件更新',
            dsc: '调用 Yunzai 标准更新器更新 who-are-you-plugin',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^#who(插件)?(强制)?更新$',
                    fnc: 'updatePlugin',
                    permission: 'master'
                },
                {
                    reg: '^#who(插件)?更新日志$',
                    fnc: 'updateLog',
                    permission: 'master'
                }
            ]

        });
    }

    async updatePlugin() {
        this.e.msg = this.e.msg.includes('强制') ? '#强制更新who-are-you-plugin' : '#更新who-are-you-plugin';
        return false;
    }

    async updateLog() {
        this.e.msg = '#更新日志who-are-you-plugin';
        return false;
    }
}
