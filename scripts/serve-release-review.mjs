import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reviewPath = resolve(process.argv[2] || 'work/release/review.html');
const port = Number(process.env.PORT) || 5187;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname !== '/' && pathname !== '/review.html') {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const html = await readFile(reviewPath);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    response.end(html);
  } catch {
    response.writeHead(500).end('Review artifact unavailable');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`2D release review available at http://127.0.0.1:${port}/`);
});
