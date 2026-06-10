import pg from 'pg';
import { CONFIG } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: CONFIG.databaseUrl,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected database pool error:', err);
});
