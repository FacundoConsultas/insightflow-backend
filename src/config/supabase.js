import { createClient } from '@supabase/supabase-js';
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ptgfyifwhksybvqxlvtj.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'sb_publishable_40jKxAW8rABZkLzaIOwK9g_3Tx_cgbK'
);

module.exports = supabase;