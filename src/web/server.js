'use strict';
/**
 * Web server: phục vụ overlay (OBS) + trang điều khiển, và kênh realtime socket.io.
 *   /overlay  – trang hiển thị 1080x1920 cho OBS / TikTok LIVE Studio (chỉ nhận dữ liệu)
 *   /control  – trang điều khiển, CHỈ cho phép truy cập từ máy local (hoặc có CONTROL_TOKEN)
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLocal(addr) {
  return LOOPBACK.has(String(addr || ''));
}

function createWebServer({ controlToken, logger }) {
  const app = express();
  app.disable('x-powered-by');

  // Trang điều khiển: chỉ máy local hoặc có token (?token=...)
  const guard = (req, res, next) => {
    if (isLocal(req.socket.remoteAddress) || (controlToken && req.query.token === controlToken)) return next();
    logger.warn(`Chặn truy cập trang điều khiển từ ${req.socket.remoteAddress}`);
    res.status(403).send('Trang điều khiển chỉ mở được trên máy chạy game.');
  };

  app.get('/', (req, res) => res.redirect('/overlay'));
  app.get('/overlay', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'overlay.html')));
  app.get('/control', guard, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'control.html')));
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

  const server = http.createServer(app);
  const io = new Server(server, { serveClient: true });

  const overlay = io.of('/overlay');
  const control = io.of('/control');
  control.use((socket, next) => {
    const addr = socket.handshake.address;
    if (isLocal(addr) || (controlToken && socket.handshake.auth?.token === controlToken)) return next();
    logger.warn(`Chặn socket điều khiển từ ${addr}`);
    next(new Error('forbidden'));
  });

  return { app, server, io, overlay, control };
}

module.exports = { createWebServer, isLocal };
