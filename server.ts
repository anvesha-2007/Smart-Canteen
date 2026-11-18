import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './src/server/routes/auth.ts';
import menuRoutes from './src/server/routes/menu.ts';
import cartRoutes from './src/server/routes/cart.ts';
import orderRoutes from './src/server/routes/orders.ts';
import staffRoutes from './src/server/routes/staff.ts';
import adminRoutes from './src/server/routes/admin.ts';
import { wsHub } from './src/realtime/wsHub.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'smart-canteen', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', menuRoutes);
  app.use('/api', orderRoutes);

  // Attach WebSocket hub to HTTP server
  wsHub.init(server);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Canteen server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Smart Canteen server:', err);
  process.exit(1);
});
