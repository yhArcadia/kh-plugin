/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-19 21:41:44
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-20 19:00:08
 * @FilePath: /kh-plugin/components/help.js
 * @Description: 帮助文档渲染组件
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot, helpMarkdown, helpTemplate } from './paths.js';
import { screenshot, screenshotBuffer } from './render.js';
import { escapeHtml } from './version.js';
import cfg from '../../../lib/config/config.js';

const MAX_SECTIONS = 12;
const MAX_ITEMS_PER_SECTION = 12;
const MAX_TEXT_LENGTH = 1000;

function cleanText(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT_LENGTH);
}

function renderInline(value) {
    const escaped = escapeHtml(cleanText(value));
    return escaped
        .replace(/`([^`\n]+)`/g, '<span class="cmd">$1</span>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<span class="strong">$1</span>');
}

export function parseHelpMarkdown(source) {
    const sections = [];
    let current = null;
    for (const rawLine of String(source ?? '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || /^<!--|^\*\/$/.test(line)) continue;
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (heading) {
            const title = cleanText(heading[1].replace(/^#+\s*/, ''));
            if (/^(changelog|更新日志)$/i.test(title)) continue;
            if (current) sections.push(current);
            current = { title, items: [] };
            continue;
        }
        if (!current) continue;
        const item = line.match(/^[-*+]\s+(.+)$/);
        if (!item) continue;
        const text = cleanText(item[1]);
        if (text) current.items.push(renderInline(text));
    }
    if (current) sections.push(current);
    return sections
        .filter(section => section.title && section.items.length)
        .slice(0, MAX_SECTIONS)
        .map(section => ({ ...section, items: section.items.slice(0, MAX_ITEMS_PER_SECTION) }));
}

export function helpCardData(file = helpMarkdown) {
    const source = fs.readFileSync(file, 'utf8');
    const pluginVersion = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version;
    return {
        pluginName: 'kh-plugin',
        title: '指令与使用指南',
        subtitle: '记录群友的每一副嘴脸（',
        sections: parseHelpMarkdown(source),
        footer: `Created By ${cfg.package.name} v${cfg.package.version} & kh-plugin v${pluginVersion}`
    };
}

export async function renderHelpImageBuffer(data = helpCardData()) {
    const image = await screenshotBuffer(
        'help',
        'help-info',
        { ...data, scale: 1.2, imgType: 'png' },
        helpTemplate
    );
    if (!Buffer.isBuffer(image) || image.length === 0) {
        throw new Error('Puppeteer 未返回有效的帮助卡 PNG Buffer');
    }
    return image;
}

export async function renderHelpCard(data = helpCardData()) {
    const image = await screenshot(
        'help',
        'help-info',
        { ...data, scale: 1.2, imgType: 'png' },
        helpTemplate
    );
    if (!image) throw new Error('Puppeteer 未返回帮助卡图片');
    return image;
}

export async function helpScreenshot(e) {
    return e.reply(await renderHelpCard());
}

export { helpTemplate, pluginRoot };
