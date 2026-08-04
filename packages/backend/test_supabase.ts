import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

createClient('url', 'key', {
  auth: { persistSession: false },
  realtime: {
    transport: WebSocket
  }
});
