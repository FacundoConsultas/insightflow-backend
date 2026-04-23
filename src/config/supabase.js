import { createClient } from '@supabase/supabase-js';

// Usamos la Service Role Key para que el backend tenga permisos totales
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // <--- Fijate que diga esto exactamente
);