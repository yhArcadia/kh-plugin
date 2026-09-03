/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-03 19:14:57
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-03 19:44:01
 * @FilePath: /kh-plugin/utils/boxization.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { log } from './logger.js';

const BOX_WIDTH = 49;
const INNER_WIDTH = BOX_WIDTH - 4;

function visualWidth(str) {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x2E80 && code <= 0x2FDF) ||
      (code >= 0xFE30 && code <= 0xFE6F) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0x20000 && code <= 0x2FFFF)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function boxLine(content) {
  const pad = INNER_WIDTH - visualWidth(content);
  return `# ${content}${pad > 0 ? ' '.repeat(pad) : ''} #`;
}

function printBox(lines) {
  log.m('#'.repeat(BOX_WIDTH));
  for (const entry of lines) {
    if (typeof entry === 'string') {
      log.i(entry);
    } else {
      log[entry.level || 'i'](entry.line);
    }
  }
  log.m('#'.repeat(BOX_WIDTH));
}

function wrapModuleNames(modules) {
  const lines = [];
  const indent = '  ';
  let current = indent;
  for (let i = 0; i < modules.length; i++) {
    const seg = modules[i] + (i < modules.length - 1 ? ', ' : '');
    if (visualWidth(current) + visualWidth(seg) > INNER_WIDTH) {
      lines.push(boxLine(current));
      current = indent + seg;
    } else {
      current += seg;
    }
  }
  if (current !== indent) {
    lines.push(boxLine(current));
  }
  return lines;
}

export { boxLine, printBox, wrapModuleNames };