import { supabase } from '../config/supabase.js';

const Analisis = {
    crear: async (datos) => {
        return await supabase
            .from('analisis') // Cambiado de analisis_datos a analisis
            .insert([{
                texto_original: datos.texto_original,
                resultado: datos.resultado,
                usuario_id: datos.usuario_id 
            }]);
    },
    obtenerTodos: async (usuario_id) => {
        return await supabase
            .from('analisis')
            .select('*')
            .eq('usuario_id', usuario_id)
            .order('created_at', { ascending: false });
    }
};

export default Analisis;