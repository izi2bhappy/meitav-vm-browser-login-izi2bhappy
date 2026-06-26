import http from 'http';
import { isMeitavRoute, handleMeitavRoute } from './meitav/routes.mjs';
import { isTaxesRoute, handleTaxesRoute } from './taxes/routes.mjs';

const PORT = process.env.PORT || 8080;

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve(body); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const payload = await readBody(req);

  if (isMeitavRoute(req.url)) {
    await handleMeitavRoute(req, res, payload);
    return;
  }

  if (isTaxesRoute(req.url)) {
    await handleTaxesRoute(req, res, payload);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
