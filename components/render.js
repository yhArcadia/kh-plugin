/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:56
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-16 21:26:45
 * @FilePath: /kh-plugin/components/render.js
 * @Description: 渲染模板
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import template from 'art-template';
import { templateDir } from './paths.js';

const bundledCjkPath = path.join(path.dirname(templateDir), 'fonts', 'NotoSansCJK-Regular.ttc');
const bundledLatinRegularPath = path.join(path.dirname(templateDir), 'fonts', 'Roboto-Regular.ttf');
const bundledLatinMediumPath = path.join(path.dirname(templateDir), 'fonts', 'Roboto-Medium.ttf');
let bundledFontFace = null;

export function bundledFontCss() {
  if (bundledFontFace) return bundledFontFace;
  const cjk = fs.readFileSync(bundledCjkPath).toString('base64');
  const latinRegular = fs.readFileSync(bundledLatinRegularPath).toString('base64');
  const latinMedium = fs.readFileSync(bundledLatinMediumPath).toString('base64');
  bundledFontFace = `@font-face{font-family:"KHUnified";src:url("data:font/ttf;base64,${latinRegular}") format("truetype");font-weight:400;font-style:normal;font-display:block;unicode-range:U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF;}@font-face{font-family:"KHUnified";src:url("data:font/ttf;base64,${latinMedium}") format("truetype");font-weight:500;font-style:normal;font-display:block;unicode-range:U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF;}@font-face{font-family:"KHUnified";src:url("data:font/collection;base64,${cjk}") format("truetype");font-weight:400;font-style:normal;font-display:block;unicode-range:U+2E80-2EFF,U+3000-303F,U+3040-30FF,U+3100-312F,U+3130-318F,U+31A0-31BF,U+3200-32FF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF;}*{font-family:"KHUnified","Noto Color Emoji",sans-serif !important;}`;
  return bundledFontFace;
}

export function bodyScale(renderScale) {
  const scale = Math.min(3, Math.max(0.5, (renderScale || 100) / 100)); //限最高3倍精度
  return `transform:scale(${scale})`;
}

export function renderTemplate(name, data) {
  return template.render(fs.readFileSync(path.join(templateDir, name), 'utf8'), data);
}

export async function screenshot(name, saveId, data, tplFile = path.join(templateDir, `${name}.html`)) {
  const puppeteer = (await import('./puppeteer.js')).default;
  return puppeteer.screenshot(`who_are_you_${name}`, { tplFile, saveId, ...data, khFontCss: bundledFontCss() });
}

export async function screenshotBuffer(name, saveId, data, tplFile = path.join(templateDir, `${name}.html`)) {
  const renderer = (await import('../../../lib/renderer/loader.js')).default.getRenderer();
  return renderer.render(`who_are_you_${name}`, { tplFile, saveId, ...data, khFontCss: bundledFontCss() });
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