import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const native = path.resolve('ios/Undertone');
export default defineConfig({
  root: 'ios/preview', server: { host: '127.0.0.1', port: 1431, strictPort: true },
  plugins: [{ name: 'native-source-status', configureServer(server) {
    server.watcher.add(native);
    server.watcher.on('change', file => {
      if (file.startsWith(native)) server.ws.send({ type: 'custom', event: 'native-change', data: { file: path.basename(file), time: new Date().toISOString() } });
    });
    server.middlewares.use('/native-preview', (req, res) => {
      const name = req.url.split('?')[0].slice(1);
      if (!['home.png','search.png','player.png'].includes(name)) { res.statusCode = 404; res.end(); return; }
      const file = path.resolve('qa-output/ios', fs.readFileSync('ios/project.yml','utf8').match(/MARKETING_VERSION: '([^']+)'/)?.[1] || '0.6.0', name);
      if (!fs.existsSync(file)) { res.statusCode = 404; res.end('Native capture is awaiting CI'); return; }
      res.setHeader('Content-Type','image/png'); fs.createReadStream(file).pipe(res);
    });
    server.middlewares.use('/native-status' , (_req, res) => {
      const files = fs.readdirSync(native).filter(file => file.endsWith('.swift'));
      const version = fs.readFileSync('ios/project.yml', 'utf8').match(/MARKETING_VERSION: '([^']+)'/)?.[1];
      res.setHeader('Content-Type', 'application/json');res.end(JSON.stringify({ version, files, updated: Math.max(...files.map(file => fs.statSync(path.join(native, file)).mtimeMs)) }));
    });
  } }]
});
