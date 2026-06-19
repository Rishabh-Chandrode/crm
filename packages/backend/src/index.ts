import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { CONFIG } from './config.js';
import { migrate } from './db/migrate.js';
import routes from './routes/index.js';
import { startScheduler } from './services/scheduler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(errorHandler);

async function start(): Promise<void> {
  await migrate();
  startScheduler();
  app.listen(CONFIG.port, () => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] Server restarted — running on port ${CONFIG.port} [${CONFIG.nodeEnv}]`);
  });
}

start().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
