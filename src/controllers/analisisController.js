import { analysisQueue } from '../queues/analysisQueue.js';
import { supabase } from "../config/supabase.js";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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

// --- NUEVA FUNCIÓN: RESOLVER CRISIS MASIVAMENTE ---
export const resolverCrisisMasiva = async (req, res) => {
    const { crisis_id, usuario_id } = req.body;

    try {
        // 1. Obtener datos de la crisis
        const { data: crisis } = await supabase
            .from('patrones_crisis')
            .select('*')
            .eq('id', crisis_id)
            .single();

        if (!crisis) return res.status(404).json({ error: "Crisis no encontrada" });

        // 2. IA genera respuesta de contingencia
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres el Director de Comunicación. Hay una crisis de ${crisis.categoria}. 
                    Insight: ${crisis.insight}. Redacta una respuesta corta, profesional y empática para los clientes. 
                    No uses nombres específicos.`
                }
            ],
            model: "llama-3.1-8b-instant"
        });

        const respuestaMaestra = completion.choices[0]?.message?.content;

        // 3. Actualizar todos los tickets de esa categoría (últimas 2 horas)
        const haceDosHoras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        
        await supabase
            .from('analisis')
            .update({ resultado: respuestaMaestra })
            .eq('usuario_id', usuario_id)
            .eq('categoria', crisis.categoria)
            .gt('created_at', haceDosHoras);

        // 4. Marcar crisis como resuelta
        await supabase
            .from('patrones_crisis')
            .update({ resuelta: true })
            .eq('id', crisis_id);

        res.json({ success: true, respuesta: respuestaMaestra });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- FUNCIONES EXISTENTES ---
export const crearAnalisis = async (req, res) => {
    try {
        const { texto, usuario_id } = req.body;
        if (!texto || !usuario_id) return res.status(400).json({ error: "Faltan datos" });

        const tier = await getUserTier(usuario_id);

        if (tier < 1) {
            const { count } = await supabase
                .from("analisis")
                .select("*", { count: 'exact', head: true })
                .eq("usuario_id", usuario_id);

            if (count >= MAX_FREE_MESSAGES) {
                return res.status(403).json({ error: "Límite alcanzado" });
            }
        }

        await analysisQueue.add('analizar-ticket', { texto, usuario_id });
        return res.status(202).json({ mensaje: "Análisis encolado" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const crearAnalisisMasivo = async (req, res) => {
    try {
        const { mensajes, usuario_id } = req.body;
        if (!mensajes || !usuario_id) return res.status(400).json({ error: "Faltan datos" });

        const tier = await getUserTier(usuario_id);

        if (tier < 1) {
            const { count } = await supabase
                .from("analisis")
                .select("*", { count: 'exact', head: true })
                .eq("usuario_id", usuario_id);

            if (count + mensajes.length > MAX_FREE_MESSAGES) {
                return res.status(403).json({ error: "Límite insuficiente" });
            }
        }

        for (const texto of mensajes) {
            await analysisQueue.add('analizar-ticket-masivo', { texto, usuario_id });
        }

        return res.status(202).json({ mensaje: "Procesamiento masivo iniciado" });
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
        const { id } = req.params;
        const { error } = await supabase.from("analisis").delete().eq("id", id);
        if (error) throw error;
        return res.status(200).json({ mensaje: "Eliminado" });
    } catch (error) { 
        return res.status(500).json({ error: error.message });
    }
};

export const obtenerEstadisticas = async (req, res) => {
    try {
        const { usuario_id } = req.query;
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