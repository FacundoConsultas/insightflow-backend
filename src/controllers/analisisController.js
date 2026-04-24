import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

const procesarAnalisisIA = async (texto, usuario_id) => {
    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `Eres InsightFlow AI, experto en Customer Experience para E-commerce.
                Tu misión es clasificar el feedback para evitar crisis operativas.

                Analiza el mensaje y responde ÚNICAMENTE en JSON con esta estructura:
                {
                  "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                  "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                  "prioridad": "Crítica, Alta, Media o Baja",
                  "analisis_resumen": "Resumen técnico de 1 oración",
                  "respuesta_automatica": "Respuesta profesional y empática",
                  "alerta_operativa": "Breve nota interna si hay un patrón de falla"
                }

                REGLAS:
                1. Prioridad CRÍTICA si menciona: 'abogado', 'estafa', 'defensa al consumidor', o demoras de envío mayores a 10 días.
                2. Categoria 'Logística' si habla de: envíos, Andreani, Correo Argentino, o números de tracking.
                3. Categoria 'Error de Sistema' si habla de: la web se tilda, no carga el carrito, o fallas en cupones.`
            },
            { role: "user", content: texto },
        ],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" }
    });

    const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

    const { data, error: dbError } = await supabase
        .from("analisis")
        .insert([
            {
                texto_original: texto,
                resultado: analisisIA.respuesta_automatica,
                categoria: analisisIA.categoria,
                sentimiento: analisisIA.sentimiento,
                prioridad: analisisIA.prioridad,
                resumen: analisisIA.analisis_resumen,
                usuario_id: usuario_id
            }
        ])
        .select();

    if (dbError) throw dbError;
    return { analisisIA, registro: data[0] };
};

export const crearAnalisis = async (req, res) => {
    try {
        const { texto, usuario_id } = req.body;
        if (!texto || !usuario_id) return res.status(400).json({ error: "Faltan datos" });
        const resultado = await procesarAnalisisIA(texto, usuario_id);
        return res.status(200).json(resultado);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

export const crearAnalisisMasivo = async (req, res) => {
    try {
        const { mensajes, usuario_id } = req.body;
        const resultados = [];
        for (const texto of mensajes) {
            try {
                const resIA = await procesarAnalisisIA(texto, usuario_id);
                resultados.push(resIA);
            } catch (err) { console.error("Fallo en uno", err.message); }
        }
        return res.status(200).json({ mensaje: "Masivo finalizado", procesados: resultados.length });
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

export const eliminarAnalisis = async (id) => {
    try {
        await supabase.from("analisis").delete().eq("id", id);
    } catch (error) { console.error(error); }
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