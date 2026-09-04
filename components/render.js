/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-06 19:58:56
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-08-21 18:35:38
 * @FilePath: /kh-plugin/components/render.js
 * @Description: 渲染模板
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import template from 'art-template';
import { templateDir, headPath } from './paths.js';

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

export function buildHistoryCard({ gid, uid, groupName, member, history, remarks = [], limit = 0 }) {
  const visible = limit > 0 ? history.slice(-limit) : history;
  const offset = history.length - visible.length;
  const now = Date.now(), first = new Date(visible[0]?.recordTime || now).getTime() || now;
  const messages = [];
  messages.push({
    isSystemMessage: true,
    content: member?.join_time ?
      `该用户于 ${new Date(member.join_time * 1000).toLocaleString('zh-CN', { hour12: false })} 加入本群` :
      '这是该用户曾在本群留下的马甲记录'
  });
  if (member?.last_sent_time)
    messages.push({
      isSystemMessage: true,
      content: `最后发言于 ${new Date(member.last_sent_time * 1000).toLocaleString('zh-CN', { hour12: false })}`
    });
  for (let i = 0; i < visible.length; i++) {
    const r = visible[i], t = new Date(r.recordTime || now).getTime() || now, next = new Date(visible[i + 1]?.recordTime || now).getTime() || now;
    const left = Math.max(0, Math.min(617, Math.round((t - first) / Math.max(1, now - first) * 617)));
    const width = Math.max(2, Math.min(617 - left, Math.round((next - t) / Math.max(1, now - first) * 617)));
    const role = r.role || 'member', title = r.title || '', badgeText = `LV${r.level ?? '?'}${title ? ` ${title}` : role === 'owner' ? ' 群主' : role === 'admin' ? ' 管理员' : ''}`;
    messages.push({
      isSystemMessage: false,
      avatar: fs.existsSync(headPath(gid, uid, r.headtime)) ?
        `file://${headPath(gid, uid, r.headtime)}` :
        `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uid}`,
      nickname: r.card || r.nickname || String(uid),
      badgeText,
      badgeColor: role === 'owner' ?
        '#FFE3C1' : role === 'admin' ?
          '#CFEFEC' : title ?
            '#F3D4FF' :
            '#E3E3E3',
      badgeTextColor: role === 'owner' ?
        '#FF7B01' : role === 'admin' ?
          '#1FB19F' : title ?
            '#AB5DD4' :
            '#818181',
      content: `<b>头衔：</b>${title || '无'}<br><b>昵称：</b>${r.nickname || ' '}<br><b>群名片：</b>${r.card || ' '}<div class="timeline"><i style="left:${left}px;width:${width}px"></i></div><small>${String(r.recordTime || '')}</small><em>#${offset + i + 1}</em>`
    });
  }
  for (const [i, remark] of remarks.entries())
    messages.push({
      isSystemMessage: true,
      content: `${remarks.length > 1 ? `备注 ${i + 1}` : '备注'}：${remark}`
    });
  return { groupName: groupName || String(gid), history: messages };
}