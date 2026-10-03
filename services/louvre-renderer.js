/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-10-03 17:09:04
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-10-03 17:23:11
 * @FilePath: /kh-plugin/services/louvre-renderer.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs/promises';
import puppeteer from '../components/puppeteer.js';
import fetch from 'node-fetch';

let assets;
async function loadAssets() {
  if (!assets) assets = Promise.all([
    fs.readFile(new URL('../resources/louvre/louvre.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../resources/louvre/pencil-texture.jpg', import.meta.url)),
    fs.readFile(new URL('../resources/louvre/one-last-image-logo2.png', import.meta.url)),
  ]).catch(error => { assets = null; throw error; });
  return assets;
}

export async function renderLouvre(imageUrl, options) {
  const [script, pencil, watermark] = await loadAssets();
  const response = await fetch(imageUrl, { size: 15 * 1024 * 1024, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const config = {
    zoom: 1, light: 0, shadeLimit: 118, shadeLight: options.toneCount,
    shade: true, kuma: options.kiss, hajimei: options.firstEdition,
    watermark: options.watermark, convoluteName: options.style,
    convolute1Diff: true, convoluteName2: null,
    Convolutes: Object.fromEntries([
      ...['精细', '一般', '稍粗', '超粗', '极粗'].map((name, i) => {
        const size = 5 + i * 2;
        return [name, Array(size * size).fill(1 / (size * size))];
      }),
      ['浮雕', [1, 1, 1, 1, 1, -1, -1, -1, -1]], ['线稿', null],
    ]),
    lightCut: 128, darkCut: options.lineWeight, denoise: options.denoise,
  };
  // 使用yunzai的puppeteer
  const initialized = typeof puppeteer.browserInit === 'function'
    ? await puppeteer.browserInit() : null;
  const browser = initialized?.newPage ? initialized : puppeteer.browser;
  if (!browser?.newPage) throw new Error('没有可用的 Yunzai 浏览器，请检查 Puppeteer 配置');
  const page = await browser.newPage();
  const timer = setTimeout(() => { void page.close().catch(() => { }); }, 60000);
  timer.unref?.();
  try {
    await page.setContent('<!doctype html><html><body></body></html>', { timeout: 15000 });
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(async (input, pencilData, watermarkData, config) => {
      const load = src => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('无法解码图片'));
        image.src = src;
      });
      const [image, pencil, watermark] = await Promise.all([load(input), load(pencilData), load(watermarkData)]);
      if (image.naturalWidth * image.naturalHeight > 40000000) throw new Error('图片像素过多，请缩小后重试');
      pencilTextureEl = pencil;
      watermarkImageEl = watermark;
      const outputCanvas = document.createElement('canvas');
      await louvre({ img: image, outputCanvas, config });
      return outputCanvas.toDataURL('image/jpeg', 0.92);
    }, `data:${type};base64,${buffer.toString('base64')}`,
      `data:image/jpeg;base64,${pencil.toString('base64')}`,
      `data:image/png;base64,${watermark.toString('base64')}`, config);
    return Buffer.from(result.split(',')[1], 'base64');
  } finally {
    clearTimeout(timer);
    await page.close().catch(() => { });
  }
}
