/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-07 00:23:37
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-11 18:07:57
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/render/rank-renderer.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs';
import path from 'node:path';
import template from 'art-template';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { templateDir } from '../components/paths.js';

export async function rankRender({ gid, gname, topN, rankType, rankTitle, config }) {

    const maxScore = Math.max(...topN.map(i => i.score));

    const renderList = topN.map(item => {
        return {
            ...item,
            barWidth: maxScore > 0 ? (item.score / maxScore) * 100 : 0
        };
    });

    const renderData = {
        groupName: gname,
        title: rankTitle,
        limit: config.rankLimit,
        rankType: rankType,
        list: renderList
    };

    const templateContent = fs.readFileSync(path.join(templateDir, "rank.html"), 'utf-8');
    const html = template.render(templateContent, renderData);

    const img = await puppeteer.screenshot('who_are_you_rank', {
        tplFile: path.join(templateDir, 'rank.html'),
        saveId: `${gid}_rank`,
        ...renderData
    });

    return img;
}
