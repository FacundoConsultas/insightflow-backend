import { Worker } from 'bullmq';
import redisConnection from '../config/redisClient.js';
import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";
import { enviarAlertaEmail } from "../services/emailService.js";

const PESOS_PRIORIDAD = { "Crítica": 4, "Alta": 2, "Media": 1, "Baja": 0.5 };
const FACTOR_DESVIACION = 1.8;
const MINIMO_SCORE_BASE = 5;

const worker = new Worker('analisis-mensajes', async (job) => {
    const { texto, usuario_id, cliente_id } = job.data; 
    
    console.log(`🤖 Procesando | Usuario: ${usuario_id} | Cliente: ${cliente_id || 'Anónimo'}`);

    try {
        // 1. IA: Análisis de sentimiento, Churn y Acción de Retención
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI. Tu objetivo es salvar el negocio. 
                    Analiza y responde ÚNICAMENTE en JSON:
                    {
                      "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                      "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                      "prioridad": "Crítica, Alta, Media o Baja",
                      "riesgo_churn": true,
                      "analisis_resumen": "1 oración",
                      "accion_recomendada": "Acción inmediata para retener al cliente (máx 15 palabras)",
                      "respuesta_automatica": "Respuesta profesional"
                    }`
                },
                { role: "user", content: texto },
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

        // 2. Guardar análisis en Supabase (LÍNEA CORREGIDA AQUÍ)
        await supabase.from("analisis").insert([{
            texto_original: texto,
            resultado: analisisIA.respuesta_automatica,
            categoria: analisisIA.categoria,
            sentimiento: analisisIA.sentimiento,
            prioridad: analisisIA.prioridad,
            resumen: analisisIA.analisis_resumen,
            riesgo_churn: analisisIA.riesgo_churn, // <--- ESTO ES LO QUE FALTABA
            usuario_id: usuario_id,
            cliente_id: cliente_id || "Anónimo"
        }]);

        // --- 🧠 LÓGICA DE INTELIGENCIA Y BASELINE ---
        const ahora = new Date();
        const hace48Horas = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
        const { data: historico } = await supabase
            .from("analisis")
            .select("prioridad, created_at")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .gt("created_at", hace48Horas);

        const baseline = Math.max((historico || []).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0) / 48, MINIMO_SCORE_BASE);
        const scoreActual = (historico || []).filter(t => t.created_at > new Date(ahora - 3600000).toISOString()).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);

        // --- 🔎 GESTIÓN DE INCIDENTES Y ESTADOS ---
        const { data: incidenteActivo } = await supabase
            .from("patrones_crisis")
            .select("id, estado")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .neq("estado", "resuelto")
            .maybeSingle();

        if (scoreActual > (baseline * FACTOR_DESVIACION) || analisisIA.riesgo_churn) {
            if (!incidenteActivo) {
                const churnTag = analisisIA.riesgo_churn ? `⚠️ CHURN: [${cliente_id || 'ID Desconocido'}]` : `🚨 ALERTA`;
                const insight = `${churnTag} en ${analisisIA.categoria}. ACCIÓN: ${analisisIA.accion_recommended}`;
                
                await supabase.from("patrones_crisis").insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight,
                    estado: 'abierto',
                    frecuencia: (historico || []).length,
                    nivel_critico: (analisisIA.riesgo_churn || scoreActual > baseline * 3) ? 'alto' : 'medio'
                }]);

                await enviarAlertaEmail(usuario_id, analisisIA.categoria, insight);
            } else {
                await supabase.from("patrones_crisis").update({ frecuencia: (historico || []).length }).eq("id", incidenteActivo.id);
            }
        } 
        else if (incidenteActivo && scoreActual <= baseline && incidenteActivo.estado === 'abierto') {
            await supabase.from("patrones_crisis").update({ 
                estado: 'resuelto', 
                resuelta: true, 
                resuelta_at: ahora.toISOString() 
            }).eq("id", incidenteActivo.id);
        }

        return { success: true };
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN WORKER:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;