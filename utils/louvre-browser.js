/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-10-04 17:41:59
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-10-04 17:46:26
 * @FilePath: /kh-plugin/utils/louvre-browser.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
export async function browserFromRenderer(renderer) {
  for (const owner of [renderer, renderer?.puppeteer]) {
    if (!owner) continue;
    if (typeof owner.newPage === 'function') return owner;
    let initialized;
    if (typeof owner.browserInit === 'function') initialized = await owner.browserInit();
    const browser = initialized?.newPage ? initialized : owner.browser;
    if (typeof browser?.newPage === 'function') return browser;
  }
  return null;
}

export async function resolveLouvreBrowser(renderer, loadRenderer) {
  const browser = await browserFromRenderer(renderer);
  if (browser) return browser;
  const registered = await loadRenderer();
  const fallback = await browserFromRenderer(registered);
  if (fallback) return fallback;
  throw new Error(`截图对象未提供浏览器接口（id=${renderer?.id || 'unknown'}）；注册的 Puppeteer 渲染器也未提供 browserInit/browser/newPage`);
}
