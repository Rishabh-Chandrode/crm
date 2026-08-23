import pg from 'pg';
import { CONFIG } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: CONFIG.databaseUrl,
  max: 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected database pool error:', err);
});
