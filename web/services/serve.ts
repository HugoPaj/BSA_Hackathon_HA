// Run a service as its own local process: a plain HTTP server on 127.0.0.1.
import http from 'node:http';
import { handle, type Routes } from './store';

export function serve(name: string, routes: Routes, port: number, onListen: () => void) {
  http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { status, data } = await handle(name, routes, req.method ?? 'GET', new URL(req.url ?? '/', 'http://x').pathname, raw);
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  }).listen(port, '127.0.0.1', onListen);
}
