/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-10-03 17:09:22
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-10-03 17:54:57
 * @FilePath: /kh-plugin/utils/louvre-options.js
 * @Description: 卢浮宫滤镜选项解析
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
export function parseLouvreOptions(msg) {
    const options = {
      style: /^#?线稿/.test(msg || '') ? '精细' : '一般',
      lineWeight: 118,
      toneCount: 108,
      denoise: true,
      kiss: !/^#?线稿/.test(msg || ''),
      watermark: true,
      firstEdition: false,
    };
    if (!msg) return options;
    const cleanMsg = msg.replace(/^#?(?:卢浮宫|louvre|线稿)/i, '').trim();
    const lowerCaseMsg = cleanMsg.toLowerCase();

    const styles = ['精细', '一般', '稍粗', '超粗', '极粗', '浮雕', '线稿'];
    for (const style of styles) {
      if (cleanMsg.includes(style)) {
        options.style = style;
        break;
      }
    }

    const lineMatch = cleanMsg.match(/线迹(?:轻重)?\s*(\d+)/);
    if (lineMatch?.[1]) {
      options.lineWeight = Math.max(80, Math.min(126, parseInt(lineMatch[1])));
    }

    const toneMatch = cleanMsg.match(/调子(?:数量)?\s*(\d+)/);
    if (toneMatch?.[1]) {
      options.toneCount = Math.max(20, Math.min(200, parseInt(toneMatch[1])));
    }
    
    const toggles = [
      { key: 'denoise', name: '降噪' },
      { key: 'kiss', name: 'Kiss' },
      { key: 'watermark', name: '水印' },
      { key: 'firstEdition', name: '初回' }
    ];
    for (const toggle of toggles) {
      const lowerCaseName = toggle.name.toLowerCase();
      if (lowerCaseMsg.includes('开' + lowerCaseName)) {
        options[toggle.key] = true;
      } else if (lowerCaseMsg.includes('关' + lowerCaseName)) {
        options[toggle.key] = false;
      }
    }

    return options;
  }