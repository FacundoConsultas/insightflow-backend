import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

// FUNCIÓN INTERNA: Esta es la que hace el trabajo sucio con Groq y Supabase
const procesarAnalisisIA = async (texto, usuario_id) => {
    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `Eres InsightFlow AI, un analista senior de operaciones para E-commerce. 
                Tu objetivo es procesar tickets de soporte y convertirlos en datos accionables.

                Analiza el mensaje y responde ÚNICAMENTE en JSON con esta estructura:
                {
                  "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                  "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                  "prioridad": "Crítica, Alta, Media o Baja",
                  "analisis_resumen": "Resumen técnico de 1 oración indicando el problema central",
                  "respuesta_automatica": "Respuesta profesional, empática y resolutiva para el cliente",
                  "detecto_pedido": true
                }

                REGLAS DE NEGOCIO:
                - Si menciona 'estafa', 'denuncia', 'abogado' o 'redes sociales', prioridad CRÍTICA.
                - Si el sentimiento es 'Irritado', la respuesta_automatica debe ser conciliadora y escalar el caso.
                - Si menciona un número (ej: #1234), detecto_pedido debe ser true.`
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

// @desc Crear análisis individual
export const crearAnalisis = async (req, res) => {
    try {
        const { texto, usuario_id } = req.body;
        if (!texto || !usuario_id) return res.status(400).json({ error: "Texto y usuario_id obligatorios" });

        const resultado = await procesarAnalisisIA(texto, usuario_id);
        return res.status(200).json({ mensaje: "Completado", ...resultado });
    } catch (error) {
        return res.status(500).json({ error: "Error en motor de IA", detalles: error.message });
    }
};

// @desc NUEVO: Análisis Masivo para CSV
export const crearAnalisisMasivo = async (req, res) => {
    try {
        const { mensajes, usuario_id } = req.body;
        if (!mensajes || !Array.isArray(mensajes)) return res.status(400).json({ error: "Se requiere un array de mensajes" });

        console.log(`🚀 Iniciando carga masiva: ${mensajes.length} mensajes.`);

        // Procesamos uno por uno para no saturar el Rate Limit de Groq gratuito
        const resultados = [];
        for (const texto of mensajes) {
            try {
                const resIA = await procesarAnalisisIA(texto, usuario_id);
                resultados.push(resIA);
            } catch (err) {
                console.error("Error en un mensaje del masivo:", err.message);
                // Si uno falla, seguimos con el resto
            }
        }

        return res.status(200).json({ 
            mensaje: "Procesamiento masivo finalizado", 
            total: mensajes.length, 
            procesados: resultados.length 
        });
    } catch (error) {
        return res.status(500).json({ error: "Error en proceso masivo", detalles: error.message });
    }
};

// ... (El resto de tus funciones obtenerHistorial, obtenerEstadisticas y eliminarAnalisis se mantienen igual abajo)
export const obtenerHistorial = async (req, res) => { /* tu código actual */ };
export const obtenerEstadisticas = async (req, res) => { /* tu código actual */ };
export const eliminarAnalisis = async (req, res) => { /* tu código actual */ };