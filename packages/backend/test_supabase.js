"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var ws_1 = require("ws");
(0, supabase_js_1.createClient)('url', 'key', {
    auth: { persistSession: false },
    realtime: {
        transport: ws_1.default
    }
});
