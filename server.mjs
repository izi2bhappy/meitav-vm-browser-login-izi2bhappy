import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
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

  if (req.url === '/login') {
    console.log('[/login] payload:', JSON.stringify(payload, null, 2));

    const child = spawn('node', [join(__dir, 'login.mjs')], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(payload.idNumber && { ID_NUMBER: payload.idNumber }),
        ...(payload.phoneNumber && { PHONE_NUMBER: payload.phoneNumber }),
      },
    });
    child.on('error', err => console.error('[/login] Failed to spawn login.mjs:', err));
    child.on('exit', code => console.log(`[/login] login.mjs exited with code ${code}`));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered' }));
    return;
  }

  if (req.url === '/verify') {
    console.log('[/verify] payload:', JSON.stringify(payload, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
