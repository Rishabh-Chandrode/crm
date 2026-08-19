import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dns from 'dns';

// Force IPv4 DNS resolution to prevent ENETUNREACH errors on IPv6-misconfigured servers
dns.setDefaultResultOrder('ipv4first');

import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app: ReturnType<typeof express> = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(errorHandler);

export default app;
