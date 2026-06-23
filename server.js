// ── server.js ─────────────────────────────────────────────────────────────────
// Zero-dependency static file server using Node.js built-ins only.
// Serves everything from the /public folder.
//
// Run:  node server.js
// Then open the printed Network URL on your phone (same WiFi required).
// ─────────────────────────────────────────────────────────────────────────────

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT   = 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath    = path.join(PUBLIC, urlPath);
  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Security: prevent directory traversal outside /public
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const code = err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(code, { 'Content-Type': 'text/plain' });
      res.end(`${code} ${err.code === 'ENOENT' ? 'Not Found' : 'Server Error'}: ${urlPath}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

function getLocalIP() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n🎧  Doc Audio Player\n');
  console.log(`   Local   → http://localhost:${PORT}`);
  console.log(`   Network → http://${ip}:${PORT}   ← open this on your phone\n`);
  console.log('   Phone and computer must be on the same WiFi.');
  console.log('   Ctrl+C to stop.\n');
});
