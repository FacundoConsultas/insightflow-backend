import { analysisQueue } from '../queues/analysisQueue.js';
import { supabase } from "../config/supabase.js";

const MAX_FREE_MESSAGES = 10;

// Helper para verificar el Tier del usuario
const getUserTier = async (usuario_id) => {
    const { data, error } = await supabase
        .from('usuarios')
        .select('tier')
        .eq('id', usuario_id)
        .single();
    if (error || !data) return 0;
    return data.tier;
};

export const crearAnalisis = async (req, res) => {
    try {
        const { texto, usuario_id } = req.body;
        if (!texto || !usuario_id) return res.status(400).json({ error: "Faltan datos" });

        const tier = await getUserTier(usuario_id);

        // Si NO es Pro, verificamos el límite de 10
        if (tier < 1) {
            const { count, error: countError } = await supabase
                .from("analisis")
                .select("*", { count: 'exact', head: true })
                .eq("usuario_id", usuario_id);

            if (countError) throw countError;

            if (count >= MAX_FREE_MESSAGES) {
                return res.status(403).json({ 
                    error: "Límite alcanzado", 
                    detalle: "Has agotado tus 10 análisis gratuitos. Pasate al plan Pro para continuar." 
                });
            }
        }

        // Encolamos el trabajo
        await analysisQueue.add('analizar-ticket', { texto, usuario_id }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
        });

        return res.status(202).json({ 
            mensaje: "Análisis iniciado", 
            detalle: "El ticket ha sido encolado para procesamiento." 
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const crearAnalisisMasivo = async (req, res) => {
    try {
        const { mensajes, usuario_id } = req.body;
        if (!mensajes || !usuario_id) return res.status(400).json({ error: "Faltan datos" });

        const tier = await getUserTier(usuario_id);

        // Si NO es Pro, validamos si los mensajes del CSV exceden lo que le queda de créditos
        if (tier < 1) {
            const { count } = await supabase
                .from("analisis")
                .select("*", { count: 'exact', head: true })
                .eq("usuario_id", usuario_id);

            if (count + mensajes.length > MAX_FREE_MESSAGES) {
                return res.status(403).json({ 
                    error: "Límite insuficiente", 
                    detalle: `Tu archivo tiene ${mensajes.length} mensajes, pero solo te quedan ${MAX_FREE_MESSAGES - count} créditos en el plan gratuito.` 
                });
            }
        }

        // Encolamos todos los mensajes
        for (const texto of mensajes) {
            await analysisQueue.add('analizar-ticket-masivo', { texto, usuario_id });
        }

        return res.status(202).json({ 
            mensaje: "Procesamiento masivo iniciado", 
            total_encolados: mensajes.length 
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const obtenerHistorial = async (req, res) => {
    try {
        const { usuario_id } = req.query;
        if (!usuario_id) return res.status(400).json({ error: "usuario_id requerido" });

        const { data, error } = await supabase
            .from("analisis")
            .select("*")
            .eq("usuario_id", usuario_id)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return res.status(200).json({ registros: data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const eliminarAnalisis = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from("analisis").delete().eq("id", id);
        if (error) throw error;
        return res.status(200).json({ mensaje: "Eliminado correctamente" });
    } catch (error) { 
        return res.status(500).json({ error: error.message });
    }
};

export const obtenerEstadisticas = async (req, res) => {
    try {
        const { usuario_id } = req.query;
        if (!usuario_id) return res.status(400).json({ error: "usuario_id requerido" });

        const { data, error } = await supabase
            .from("analisis")
            .select("sentimiento, prioridad")
            .eq("usuario_id", usuario_id);

        if (error) throw error;
        return res.status(200).json({ stats: data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};