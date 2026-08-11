/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-08 20:52:03
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-10 19:18:41
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/apps/remark.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { WhoApp } from '../components/base-app.js';
import { config } from '../components/runtime.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { log } from '../utils/logger.js';

export class WhoRemark extends WhoApp {
    constructor() {
        super({
            name: 'Who插件-群员备注管理',
            dsc: 'WhoAreYou 备注管理',
            priority: 5000,
            rule: [
                {
                    reg: '^#(添加|设置)备注',
                    fnc: 'addRemark'
                },
                {
                    reg: '^#删除备注',
                    fnc: 'delRemark'
                }
            ]
        });
    }

    async addRemark(e) {
        if (isDivingGroup(e, config)) return false;
        if (!e.isMaster) return false;
        if (!e.at) {
            await e.reply("请@你要添加备注的用户。");
            return true;
        }

        // 提取内容
        let content = e.msg.replace(/^#(添加|设置)备注/, '').trim();
        content = content.replace(/@\S+/g, '').trim(); // 去除@部分

        if (!content) {
            await e.reply("请输入备注内容，例如：#添加备注 这是渔火小号");
            return true;
        }

        const redisKey = `${config.redisPrefix}:remark:${e.group_id}:${e.at}`;

        let remarkList = [];
        const currentData = await redis.get(redisKey);

        if (currentData) {
            try {
                remarkList = JSON.parse(currentData);
            } catch (err) {
                remarkList = [];
                log.e(`备注数据解析失败，已重置: ${err}`);
            }
        }

        // 追加新备注
        remarkList.push(content);

        // 存回 Redis
        await redis.set(redisKey, JSON.stringify(remarkList));

        await e.reply(`添加成功！该用户当前共有 ${remarkList.length} 条备注。`);
        return true;
    }

    async delRemark(e) {
        if (isDivingGroup(e, config, logger)) return false;
        if (!e.isMaster) return false;
        if (!e.at) {
            await e.reply("请@你要删除备注的用户。");
            return true;
        }

        let textWithoutCmd = e.msg.replace(/^#删除备注/, '').trim();
        textWithoutCmd = textWithoutCmd.replace(/@\S+/g, '').trim();

        const indexStr = textWithoutCmd.match(/^(\d+)$/);

        const redisKey = `${config.redisPrefix}:remark:${e.group_id}:${e.at}`;

        // 如果没有指定数字，则视为“清空所有备注”
        if (!indexStr) {
            if (await redis.exists(redisKey)) {
                await redis.del(redisKey);
                await e.reply("已清空该用户的所有备注。");
            } else {
                await e.reply("该用户没有任何备注。");
            }
            return true;
        }

        const index = parseInt(indexStr[1], 10);
        if (index <= 0) {
            await e.reply("序号必须大于0。");
            return true;
        }

        const currentData = await redis.get(redisKey);
        if (!currentData) {
            await e.reply("该用户没有任何备注。");
            return true;
        }

        let remarkList = [];
        try {
            remarkList = JSON.parse(currentData);
        } catch (err) {
            await e.reply("数据异常，无法解析备注列表。");
            return true;
        }

        if (index > remarkList.length) {
            await e.reply(`删除失败：该用户只有 ${remarkList.length} 条备注。`);
            return true;
        }

        const deletedItem = remarkList.splice(index - 1, 1);

        if (remarkList.length === 0) {
            await redis.del(redisKey);
            await e.reply(`已删除备注【${deletedItem}】，该用户已无备注。`);
        } else {
            await redis.set(redisKey, JSON.stringify(remarkList));
            await e.reply(`已删除第 ${index} 条备注【${deletedItem}】，剩余 ${remarkList.length} 条。`);
        }
        return true;
    }
}
