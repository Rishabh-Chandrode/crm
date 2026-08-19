import { app } from './app.js';
import { CONFIG } from './config.js';
import { migrate } from './db/migrate.js';
import { startScheduler } from './services/scheduler.js';

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
