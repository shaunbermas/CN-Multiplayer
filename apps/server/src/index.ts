import http from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_PORT, ROOM_NAME } from '@cn-trials/shared';
import { resetTickStats, snapshot } from './metrics.ts';
import { TrialRoom } from './rooms/TrialRoom.ts';

const port = Number(process.env.PORT ?? DEFAULT_PORT);

const httpServer = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (req.url === '/health') {
    res.writeHead(200, cors);
    return res.end(JSON.stringify(snapshot()));
  }
  if (req.url === '/metrics/reset' && req.method === 'POST' && process.env.CN_TEST === '1') {
    resetTickStats();
    res.writeHead(204, cors);
    return res.end();
  }
  res.writeHead(404, cors);
  res.end(JSON.stringify({ error: 'not found' }));
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_NAME, TrialRoom);

await gameServer.listen(port);
console.log(JSON.stringify({ ev: 'listening', port }));

const shutdown = async () => { await gameServer.gracefullyShutdown(false); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
