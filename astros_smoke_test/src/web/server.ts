import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const PORT = 5174;
const HOST = '127.0.0.1';
const isDev = process.env.NODE_ENV !== 'production';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..', '..');
const distWebPath = join(packageRoot, 'dist', 'web');
const viteConfigPath = join(packageRoot, 'vite.web.config.ts');

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Placeholder API. Real endpoints land in Task 2.
  app.get('/api/state', (_req, res) => {
    res.json({ connected: false, port: null, baud: null, activeRunId: null });
  });

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      configFile: viteConfigPath,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    if (!existsSync(distWebPath)) {
      console.error(
        `[smoke-cockpit] No build found at ${distWebPath}. Run 'npm run web:build' first.`,
      );
      process.exit(1);
    }
    app.use(express.static(distWebPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(distWebPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[smoke-cockpit] http://localhost:${PORT}  (${isDev ? 'dev' : 'prod'})`);
  });
}

main().catch((err) => {
  console.error('[smoke-cockpit] failed to start:', err);
  process.exit(1);
});
