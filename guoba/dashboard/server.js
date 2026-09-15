/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-10 18:22:04
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-15 22:41:40
 * @FilePath: /kh-plugin/guoba/dashboard/server.js
 * @Description: 
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveHeadPath } from '../../components/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_INDEX = path.join(__dirname, 'index.html');

let routeRegistered = false;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 5000;

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

  if (!globalThis.Bot?.express) {
    console.warn('[kh-plugin] Bot.express 不可用，当前环境不支持独立看板路由，跳过注册。');
    return;
  }

  const app = globalThis.Bot.express;
  if (typeof app.get !== 'function') {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.warn(`[kh-plugin] Bot.express 尚未就绪，${RETRY_INTERVAL / 1000} 秒后重试（${retryCount}/${MAX_RETRIES}）...`);
      setTimeout(() => initDashboard(), RETRY_INTERVAL);
    } else {
      console.warn(`[kh-plugin] Bot.express 重试 ${MAX_RETRIES} 次后仍未就绪，放弃注册看板路由。`);
    }
    return;
  }

  const dashboardDir = __dirname;

  // 静态文件路由
  function serveFile(res, filename, mime) {
    const fp = path.join(dashboardDir, filename);
    try {
      const content = fs.readFileSync(fp);
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
    }
  }
  app.get('/kh-plugin/dashboard/style.css', (req, res) => serveFile(res, 'style.css', 'text/css; charset=utf-8'));
  app.get('/kh-plugin/dashboard/app.js',   (req, res) => serveFile(res, 'app.js',   'application/javascript; charset=utf-8'));
  app.get('/kh-plugin/dashboard/icon.png', (req, res) => {
    const fp = path.join(path.dirname(__dirname), '..', 'resources', 'img', 'icon.png');
    try {
      const content = fs.readFileSync(fp);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  app.get('/kh-plugin/dashboard/avatar', (req, res) => {
    const { uid, headtime, gid } = req.query;
    if (!uid || !headtime) { res.statusCode = 400; res.end('Missing params'); return; }
    const fp = resolveHeadPath(uid, headtime, gid || undefined);
    if (!fp) { res.statusCode = 404; res.end('Not Found'); return; }
    try {
      const content = fs.readFileSync(fp);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  // HTML 页面路由（注入锅巴挂载前缀）
  app.get('/kh-plugin/dashboard', serveIndex);

  routeRegistered = true;
  // console.log('[kh-plugin] 数据看板已就绪，访问地址: http://<host>:<port>/kh-plugin/dashboard');
}