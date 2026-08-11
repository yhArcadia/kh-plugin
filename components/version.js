/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:56
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-11 18:09:14
 * @FilePath: /Yunzai/plugins/who-are-you-plugin/components/version.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './paths.js';
import { screenshot } from './render.js';

const MAX_HIGHLIGHTS = 8;
const MAX_TEXT_LENGTH = 140;
const VERSION_HEADING = /^#{1,6}\s+\[?v?(\d+(?:\.\d+){1,3}(?:[-+][\w.]+)?)\]?\s*(?:[-—–:]\s*)?(.*)$/i;
const DATE = /\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/;

export function truncateText(value, limit = MAX_TEXT_LENGTH) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function cleanMarkdown(line) {
  return truncateText(String(line ?? '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim());
}

export function parseChangelogText(source) {
  const lines = String(source ?? '').split(/\r?\n/);
  let latest = null;
  let collecting = false;
  const fallback = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(VERSION_HEADING);
    if (heading) {
      if (latest) break;
      const suffix = heading[2].trim();
      latest = {
        version: heading[1],
        date: suffix.match(DATE)?.[1]?.replace(/[/.]/g, '-') || '',
        title: cleanMarkdown(suffix.replace(DATE, '')),
        highlights: []
      };
      collecting = true;
      continue;
    }
    if (!collecting && line && !/^<!--|^\*\/$/.test(line) && !/^#\s+changelog$/i.test(line)) {
      const text = cleanMarkdown(line);
      if (text && !/^[-*_]{3,}$/.test(text)) fallback.push(text);
    }
    if (collecting && line && !/^[-*_]{3,}$/.test(line) && !/^<!--|^\*\/$/.test(line)) {
      const text = cleanMarkdown(line);
      if (text) latest.highlights.push(text);
    }
  }

  if (latest) {
    latest.highlights = latest.highlights.slice(0, MAX_HIGHLIGHTS);
    if (!latest.highlights.length && latest.title) latest.highlights.push(latest.title);
    return { ...latest, fallback: false };
  }

  return {
    version: '版本信息',
    date: '',
    title: '',
    highlights: fallback.slice(0, MAX_HIGHLIGHTS),
    fallback: true
  };
}

export function parseChangelog(file = path.join(pluginRoot, 'CHANGELOG.md')) {
  return parseChangelogText(fs.readFileSync(file, 'utf8'));
}

export function versionCardData(file) {
  const parsed = parseChangelog(file);
  const highlights = parsed.highlights.length ? parsed.highlights : ['未找到可展示的更新说明。'];
  return {
    pluginName: 'WhoAreYou',
    subtitle: '群成员身份记录插件',
    version: parsed.version,
    // date: parsed.date || '未标注发布日期',
    date: parsed.date || '',
    latestUpdate: truncateText(highlights[0]),
    highlights: highlights.map(text => escapeHtml(truncateText(text))),
    sourceLabel: '当前插件版本信息来源为 CHANGELOG.md',
    generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    fallback: parsed.fallback
  };
}

export async function renderVersionCard(data = versionCardData()) {
  const image = await screenshot('version', 'version-info', { ...data, scale: 1.2, imgType: 'png' });
  if (!image) throw new Error('Puppeteer 未返回版本卡图片');
  return image;
}

export async function versionScreenshot(e) {
  const image = await renderVersionCard();
  return e.reply(image);
}
