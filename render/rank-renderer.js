/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-07 00:23:37
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-20 19:00:02
 * @FilePath: /kh-plugin/render/rank-renderer.js
 * @Description: 排行榜渲染器
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import template from 'art-template';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { templateDir, pluginRoot } from '../components/paths.js';
import cfg from '../../../lib/config/config.js';

export async function rankRender({ gid, gname, topN, rankType, rankTitle, config }) {

    const maxScore = Math.max(...topN.map(i => i.score));

    const renderList = topN.map(item => {
        return {
            ...item,
            barWidth: maxScore > 0 ? (item.score / maxScore) * 100 : 0,
            silenceMarkerLeft: item.showSilenceMarker && item.silenceRatio !== null
                ? Math.max(1.5, Math.min((maxScore > 0 ? (item.score / maxScore) * 100 : 0) - 1.5, (maxScore > 0 ? (item.score / maxScore) * 100 : 0) * item.silenceRatio))
                : null
        };
    });

    const renderData = {
        groupName: gname,
        title: rankTitle,
        limit: config.rankLimit,
        rankType: rankType,
        list: renderList,
        footer: `Created By ${cfg.package.name} v${cfg.package.version} & kh-plugin v${JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version}`
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
