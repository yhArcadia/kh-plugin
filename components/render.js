/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:56
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-06 17:59:21
 * @FilePath: /kh-plugin/components/render.js
 * @Description: 渲染模板
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import template from 'art-template';
import { templateDir } from './paths.js';

export function renderTemplate(name, data) {
  return template.render(fs.readFileSync(path.join(templateDir, name), 'utf8'), data);
}

export async function screenshot(name, saveId, data, tplFile = path.join(templateDir, `${name}.html`)) {
  const puppeteer = (await import('./puppeteer.js')).default;
  return puppeteer.screenshot(`who_are_you_${name}`, { tplFile, saveId, ...data });
}

export async function screenshotBuffer(name, saveId, data, tplFile = path.join(templateDir, `${name}.html`)) {
  const renderer = (await import('../../../lib/renderer/loader.js')).default.getRenderer();
  return renderer.render(`who_are_you_${name}`, { tplFile, saveId, ...data });
}

export function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!seconds) return '片刻';
  const units = [
    [31536000, '年'],
    [2592000, '个月'],
    [86400, '天'],
    [3600, '小时'],
    [60, '分钟'],
    [1, '秒']
  ];
  const out = [];
  for (const [size, label] of units) {
    const value = Math.floor(seconds / size);
    if (value) {
      out.push(`${value}${label}`);
      seconds %= size; if (out.length === 3) break;
    }
  }
  return out.join('') || '刚刚';
}