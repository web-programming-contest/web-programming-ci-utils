#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function createStaticServer(root) {
  const absoluteRoot = path.resolve(root);
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const decoded = decodeURIComponent(requestUrl.pathname);
      if (decoded === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const requested = decoded === '/' ? '/index.html' : decoded;
      const filename = path.resolve(absoluteRoot, `.${requested}`);
      const relative = path.relative(absoluteRoot, filename);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const stats = await lstat(filename);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type':
          MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      createReadStream(filename).pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}
