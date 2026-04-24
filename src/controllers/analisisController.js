import { analysisQueue } from '../queues/analysisQueue.js';
import { supabase } from "../config/supabase.js";

export const crearAnalisis = async (req, res) => {
    try {
        const { texto, usuario_id } = req.body;
        if (!texto || !usuario_id) return res.status(400).json({ error: "Faltan datos" });

        // Encolamos el trabajo
        await analysisQueue.add('analizar-ticket', { texto, usuario_id }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
        });

        return res.status(202).json({ 
            mensaje: "Análisis iniciado", 
            detalle: "El ticket ha sido encolado para procesamiento asíncrono." 
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const crearAnalisisMasivo = async (req, res) => {
    try {
        const { mensajes, usuario_id } = req.body;
        if (!mensajes || !usuario_id) return res.status(400).json({ error: "Faltan datos" });

        // Encolamos cada mensaje como una tarea individual en Redis
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
        const { id } = req.params; // Asumiendo que viene por params
        await supabase.from("analisis").delete().eq("id", id);
        return res.status(200).json({ mensaje: "Eliminado" });
    } catch (error) { 
        return res.status(500).json({ error: error.message });
    }
};

export const obtenerEstadisticas = async (req, res) => {
    try {
        const { usuario_id } = req.query;
        const { data } = await supabase.from("analisis").select("sentimiento, prioridad").eq("usuario_id", usuario_id);
        return res.status(200).json({ stats: data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};