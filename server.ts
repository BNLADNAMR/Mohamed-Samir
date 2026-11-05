import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  // فحص حالة الخادم
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      securityLayer: 'rbac-firestore-enforced',
      timestamp: new Date().toISOString(),
    });
  });

  // تنزيل ملف ZIP المجمع الجاهز للاستضافة المباشرة (Static Web / InfinityFree)
  app.get(['/api/download-dist-zip', '/dist-package.zip'], (_req: Request, res: Response) => {
    const zipPath = path.resolve('dist-package.zip');
    if (fs.existsSync(zipPath)) {
      res.download(zipPath, 'dist_static_web_infinityfree.zip');
    } else {
      res.status(404).json({ error: 'ملف الحزمة غير متوفر بعد، يرجى تشغيل npm run build' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/dist/**'] },
      },
      optimizeDeps: {
        entries: ['index.html'],
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
