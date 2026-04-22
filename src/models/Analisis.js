import { supabase } from '../config/supabase.js'; // CAMBIO: import y agregado de .js

const Analisis = {
    crear: async (datos) => {
        return await supabase
            .from('analisis_datos')
            .insert([{
                contenido: datos.contenido,
                resultado_ia: datos.resultado_ia,
                user_id: datos.user_id 
            }]);
    },
    obtenerTodos: async (user_id) => {
        return await supabase
            .from('analisis_datos')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false });
    }
};

export default Analisis; // CAMBIO: export default en lugar de module.exports