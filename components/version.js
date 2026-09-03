/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:56
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-03 22:49:32
 * @FilePath: /kh-plugin/components/version.js
 * @Description: 插件版本信息渲染组件
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot, versionTemplate } from './paths.js';
import cfg from '../../../lib/config/config.js';
import { screenshot } from './render.js';

let _cachedPluginVersion = null;
export function getPluginVersion() {
    if (_cachedPluginVersion === null) {
        _cachedPluginVersion = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version;
    }
    return _cachedPluginVersion;
}

const MAX_RELEASES = 4; // 最多解析几个版本
const MAX_HIGHLIGHTS = 50; //每个版本最多几条
const MAX_TEXT_LENGTH = 1500; //文本截断
const VERSION_PART = '\\d+(?:\\.\\d+){1,3}(?:[-+][\\w.]+)?';
const VERSION_HEADING = new RegExp(`^#{1,6}\\s+\\[?v?(${VERSION_PART}(?:\\s*[~～]\\s*v?${VERSION_PART})?)\\]?\\s*(?:[-—–:]\\s*)?(.*)$`, 'i');
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

export function renderInlineMarkdown(value) {
  const text = escapeHtml(truncateText(value));
  return text
    .replace(/`([^`\n]+)`/g, '<span class="cmd">$1</span>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<span class="strong">$1</span>');
}

function cleanMarkdown(line) {
  return truncateText(String(line ?? '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim());
}

function cleanHighlightMarkdown(line) {
  return truncateText(String(line ?? '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .trim());
}

function parseReleaseHeading(line) {
  const heading = String(line ?? '').trim().match(VERSION_HEADING);
  if (!heading) return null;
  const suffix = heading[2].trim();
  return {
    version: heading[1],
    date: suffix.match(DATE)?.[1]?.replace(/[/.]/g, '-') || '',
    title: cleanMarkdown(suffix.replace(DATE, '')),
    highlights: []
  };
}

// 解析 CHANGELOG 的多个版本，最新项排在前面
export function parseChangelogReleases(source, limit = MAX_RELEASES) {
  const releases = [];
  let current = null;
  for (const rawLine of String(source ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = parseReleaseHeading(line);
    if (heading) {
      if (current) releases.push(current);
      if (releases.length >= limit) break;
      current = heading;
      continue;
    }
    if (!current || !line || /^[-*_]{3,}$/.test(line) || /^<!--|^\*\/$/.test(line)) continue;
    const text = cleanHighlightMarkdown(line);
    if (text) current.highlights.push(text);
  }
  if (current && releases.length < limit) releases.push(current);
  return releases.map(release => ({
    ...release,
    highlights: release.highlights.slice(0, MAX_HIGHLIGHTS)
  }));
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

export function versionCardData(file = path.join(pluginRoot, 'CHANGELOG.md')) {
  const releases = parseChangelogReleases(fs.readFileSync(file, 'utf8'));
  const parsed = releases[0] || {
    version: '版本信息',
    date: '',
    title: '',
    highlights: ['未找到可展示的更新说明。']
  };
  const pluginVersion = getPluginVersion();
  return {
    pluginName: 'kh-plugin',
    version: parsed.version,
    date: parsed.date || '',
    releases: releases.length ? releases.map(release => ({
      ...release,
      highlights: release.highlights.length
        ? release.highlights.map(renderInlineMarkdown)
        : (release.title ? [renderInlineMarkdown(release.title)] : [])
    })) : [{ ...parsed, highlights: [renderInlineMarkdown(parsed.highlights[0])] }],
    footer: `Created By ${cfg.package.name} v${cfg.package.version} & kh-plugin v${pluginVersion}`,
    fallback: !releases.length
  };
}

export async function renderVersionCard(data = versionCardData()) {
  const image = await screenshot('version', 'version-info', { ...data, scale: 1.2, imgType: 'png' }, versionTemplate);
  if (!image) throw new Error('Puppeteer 未返回版本卡图片');
  return image;
}

export async function versionScreenshot(e) {
  const image = await renderVersionCard();
  return e.reply(image);
}