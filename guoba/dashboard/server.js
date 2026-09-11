/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-10 18:22:04
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-11 19:15:17
 * @FilePath: /kh-plugin/guoba/dashboard/server.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_INDEX = path.join(__dirname, 'index.html');

let routeRegistered = false;

async function serveIndex(req, res) {
  try {
    const mountPrefix = await getGuobaMountPrefix();
    const raw = fs.readFileSync(DASHBOARD_INDEX, 'utf8');
    const html = raw.replace(
      "window.__GUOBA_MOUNT_PREFIX__ = '/guoba-plugin-mock-root'",
      `window.__GUOBA_MOUNT_PREFIX__ = ${JSON.stringify(mountPrefix)}`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.end(html);
  } catch (err) {
    res.statusCode = 500;
    res.end('看板页面加载失败，请检查插件文件完整性。');
  }
}

async function getGuobaMountPrefix() {
  try {
    const { _paths } = await import('#guoba.platform');
    return _paths?.server?.realMountPrefix || '/guoba-plugin-mock-root';
  } catch {
    return '/guoba-plugin-mock-root';
  }
}

export function initDashboard() {
  if (routeRegistered) return;

  const app = globalThis.Bot?.express;
  if (!app || typeof app.get !== 'function') {
    console.warn('[kh-plugin] Bot.express 不可用，看板路由注册延迟到 3 秒后重试...');
    setTimeout(() => initDashboard(), 3000);
    return;
  }

  console.log('[kh-plugin] 正在注册仪表盘路由...');

  const dashboardDir = __dirname;

  // 静态文件路由
  function serveFile(res, filename, mime) {
    const fp = path.join(dashboardDir, filename);
    console.log('[kh-plugin] serveFile:', filename, '->', fp, fs.existsSync(fp) ? 'EXISTS' : 'MISSING');
    try {
      const content = fs.readFileSync(fp);
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(content);
      console.log('[kh-plugin] serveFile:', filename, 'OK,', content.length, 'bytes');
    } catch (e) {
      console.log('[kh-plugin] serveFile:', filename, 'ERROR:', e.message);
      res.statusCode = 404;
      res.end('Not Found');
    }
  }
  app.get('/kh-plugin/dashboard/style.css', (req, res) => serveFile(res, 'style.css', 'text/css; charset=utf-8'));
  app.get('/kh-plugin/dashboard/app.js',   (req, res) => serveFile(res, 'app.js',   'application/javascript; charset=utf-8'));

  // HTML 页面路由（注入锅巴挂载前缀）
  app.get('/kh-plugin/dashboard', serveIndex);

  routeRegistered = true;
  // console.log('[kh-plugin] 数据看板已就绪，访问地址: http://<host>:<port>/kh-plugin/dashboard');
}