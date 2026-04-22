import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Inicializamos el cliente de Supabase
export const supabase = createClient(
    process.env.SUPABASE_URL || 'https://ptgfyifwhksybvqxlvtj.supabase.co',
    process.env.SUPABASE_ANON_KEY
);