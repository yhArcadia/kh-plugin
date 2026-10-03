/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-10-03 17:09:04
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-10-03 18:40:15
 * @FilePath: /kh-plugin/services/louvre-renderer.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import fs from 'node:fs/promises';
import puppeteer from '../components/puppeteer.js';
import fetch from 'node-fetch';
import { LouvreError } from '../utils/louvre-errors.js';

let assets;
async function loadAssets() {
  if (!assets) assets = Promise.all([
    fs.readFile(new URL('../resources/louvre/louvre.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../resources/louvre/pencil-texture.jpg', import.meta.url)),
    fs.readFile(new URL('../resources/louvre/kh-logo.png', import.meta.url)),
  ]).catch(error => { assets = null; throw new LouvreError('ASSETS', '滤镜资源读取失败', error); });
  return assets;
}

export async function renderLouvre(imageUrl, options) {
  const [script, pencil, watermark] = await loadAssets();
  try {
    const url = new URL(imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('不支持的图片来源');
  } catch (error) { throw new LouvreError('SOURCE', '图片来源不是 HTTP URL', error); }
  let buffer, type;
  try {
    const response = await fetch(imageUrl, { size: 15 * 1024 * 1024, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('下载图片失败：HTTP ' + response.status);
    buffer = Buffer.from(await response.arrayBuffer());
    type = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  } catch (error) {
    const code = error.type === 'max-size' ? 'SIZE'
      : ['AbortError', 'TimeoutError'].includes(error.name) ? 'DOWNLOAD_TIMEOUT' : 'DOWNLOAD';
    throw new LouvreError(code, '图片下载阶段失败', error);
  }
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
  // Use Yunzai's existing browser; never launch or close a separate browser.
  let page;
  try {
    const initialized = typeof puppeteer.browserInit === 'function' ? await puppeteer.browserInit() : null;
    const browser = initialized?.newPage ? initialized : puppeteer.browser;
    if (!browser?.newPage) throw new Error('没有可用的 Yunzai 浏览器实例');
    page = await browser.newPage();
  } catch (error) { throw new LouvreError('BROWSER', '浏览器初始化阶段失败', error); }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void page.close().catch(() => {}); }, 60000);
  timer.unref?.();
  try {
    await page.setContent('<!doctype html><html><body></body></html>', { timeout: 15000 });
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(async (input, pencilData, watermarkData, config) => {
      const load = (src, label) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(label));
        image.src = src;
      });
      const [image, pencil, watermark] = await Promise.all([load(input, 'LOUVRE_DECODE'), load(pencilData, 'LOUVRE_ASSET_DECODE'), load(watermarkData, 'LOUVRE_ASSET_DECODE')]);
      if (image.naturalWidth * image.naturalHeight > 40000000) throw new Error('LOUVRE_SIZE');
      pencilTextureEl = pencil;
      watermarkImageEl = watermark;
      const outputCanvas = document.createElement('canvas');
      await louvre({ img: image, outputCanvas, config });
      return outputCanvas.toDataURL('image/jpeg', 0.92);
    }, `data:${type};base64,${buffer.toString('base64')}`,
    `data:image/jpeg;base64,${pencil.toString('base64')}`,
    `data:image/png;base64,${watermark.toString('base64')}`, config);
    return Buffer.from(result.split(',')[1], 'base64');
  } catch (error) {
    const message = String(error.message || '');
    const code = timedOut || error.name === 'TimeoutError' ? 'TIMEOUT'
      : message.includes('LOUVRE_ASSET_DECODE') ? 'ASSET_DECODE'
      : message.includes('LOUVRE_DECODE') ? 'DECODE'
      : message.includes('LOUVRE_SIZE') ? 'SIZE' : 'RENDER';
    throw new LouvreError(code, '浏览器图片处理阶段失败', error);
  } finally {
    clearTimeout(timer);
    await page.close().catch(() => {});
  }
}
