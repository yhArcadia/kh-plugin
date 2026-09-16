/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-10 18:22:04
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-16 00:13:10
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
let mountPrefixCache = null;

async function getGuobaMountPrefix() {
  if (mountPrefixCache) return mountPrefixCache;
  try {
    const { _paths } = await import('#guoba.platform');
    mountPrefixCache = _paths?.server?.realMountPrefix || '/guoba-plugin-mock-root';
  } catch {
    mountPrefixCache = '/guoba-plugin-mock-root';
  }
  return mountPrefixCache;
}

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

function registerRoutes(app) {
  const dashboardDir = __dirname;

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

  app.get('/kh-plugin/dashboard', serveIndex);
}

async function tryGetGuobaExpress() {
  try {
    const platform = await import('#guoba.platform');
    const app = platform?._paths?.server?.app
      || platform?._paths?.app
      || platform?.app
      || platform?.express;
    if (app && typeof app.get === 'function') return app;
  } catch {
    // #guoba.platform 不可用，返回 null
  }
  return null;
}

async function tryResolveExpress() {
  // TRSS-Yunzai 的 Bot.express
  const botExpress = globalThis.Bot?.express;
  if (botExpress && typeof botExpress.get === 'function') {
    return { app: botExpress, source: 'Bot.express' };
  }
  if (botExpress) {
  // Bot.express 存在但 get 还不是函数（Express 实例尚未初始化完成）
    return { app: null, source: 'Bot.express', pending: true };
  }

  // 锅巴的 Express 实例（通过 #guoba.platform）
  const guobaApp = await tryGetGuobaExpress();
  if (guobaApp) {
    return { app: guobaApp, source: 'guoba.platform' };
  }

  return { app: null, source: null };
}

async function doInit() {
  if (routeRegistered) return;

  const resolved = await tryResolveExpress();

  if (resolved.app) {
    registerRoutes(resolved.app);
    routeRegistered = true;
    return;
  }

  if (resolved.pending) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.warn(`[kh-plugin] Bot.express 尚未就绪，${RETRY_INTERVAL / 1000} 秒后重试（${retryCount}/${MAX_RETRIES}）...`);
      setTimeout(() => doInit(), RETRY_INTERVAL);
    } else {
      console.warn(`[kh-plugin] Bot.express 重试 ${MAX_RETRIES} 次后仍未就绪，放弃注册看板路由。`);
    }
    return;
  }

  // 两个方案都不可用
  console.warn('[kh-plugin] 当前环境不支持数据看板。');
}

export function initDashboard() {
  doInit().catch(err => {
    console.warn('[kh-plugin] 看板路由注册异常:', err.message);
  });
}