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
    server.middlewares.use('/native-status', (_req, res) => {
      const files = fs.readdirSync(native).filter(file => file.endsWith('.swift'));
      const version = fs.readFileSync('ios/project.yml', 'utf8').match(/MARKETING_VERSION: '([^']+)'/)?.[1];
      res.setHeader('Content-Type', 'application/json');res.end(JSON.stringify({ version, files, updated: Math.max(...files.map(file => fs.statSync(path.join(native, file)).mtimeMs)) }));
    });
  } }]
});
