const http = require('http');
const fs = require('fs');
const path = require('path');

const hostname = '0.0.0.0';
const initialPort = Number(process.env.PORT || 3000);
const rootDir = process.cwd();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

function safeJoin(base, requestPath) {
  const resolved = path.resolve(base, '.' + requestPath);
  if (!resolved.startsWith(base)) {
    return null;
  }
  return resolved;
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const relativePath = decodeURIComponent(parsedUrl.pathname);
    const filePath = safeJoin(rootDir, relativePath);

    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error) {
        if (error.code === 'ENOENT' && path.extname(relativePath) === '') {
          serveFile(path.join(rootDir, 'index.html'), res);
        } else if (error.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Server error');
        }
        return;
      }

      if (stats.isDirectory()) {
        serveFile(path.join(filePath, 'index.html'), res);
      } else {
        serveFile(filePath, res);
      }
    });
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      if (nextPort - initialPort < 10) {
        console.log(`Port ${port} is busy, trying ${nextPort} instead.`);
        startServer(nextPort);
      } else {
        console.error(`Unable to find an open port after ${nextPort - 1}.`);
        process.exit(1);
      }
    } else {
      throw error;
    }
  });

  server.listen(port, hostname, () => {
    console.log(`Local preview available at http://${hostname}:${port}`);
  });
}

startServer(initialPort);
