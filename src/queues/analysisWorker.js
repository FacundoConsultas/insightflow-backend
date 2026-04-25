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
    console.log(`🤖 Procesando | Usuario: ${usuario_id}`);

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI. Analiza y responde ÚNICAMENTE en JSON:
                    {
                      "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                      "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                      "prioridad": "Crítica, Alta, Media o Baja",
                      "riesgo_churn": true,
                      "analisis_resumen": "1 oración",
                      "accion_recomendada": "Acción inmediata (máx 15 palabras)",
                      "respuesta_automatica": "Respuesta profesional"
                    }`
                },
                { role: "user", content: texto },
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);
        const esChurn = analisisIA.riesgo_churn === true || analisisIA.riesgo_churn === "true";

        await supabase.from("analisis").insert([{
            texto_original: texto,
            resultado: analisisIA.respuesta_automatica,
            categoria: analisisIA.categoria,
            sentimiento: analisisIA.sentimiento,
            prioridad: analisisIA.prioridad,
            resumen: analisisIA.analisis_resumen,
            riesgo_churn: esChurn, 
            usuario_id: usuario_id,
            cliente_id: cliente_id || "Anónimo"
        }]);

        const ahora = new Date();
        const hace48Horas = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
        const { data: historico } = await supabase.from("analisis").select("prioridad, created_at").eq("usuario_id", usuario_id).eq("categoria", analisisIA.categoria).gt("created_at", hace48Horas);

        const baseline = Math.max((historico || []).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0) / 48, MINIMO_SCORE_BASE);
        const scoreActual = (historico || []).filter(t => new Date(t.created_at) > new Date(ahora - 3600000)).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);

        const { data: incidenteActivo } = await supabase.from("patrones_crisis").select("id, estado").eq("usuario_id", usuario_id).eq("categoria", analisisIA.categoria).neq("estado", "resuelto").maybeSingle();

        if (scoreActual > (baseline * FACTOR_DESVIACION) || esChurn) {
            const insight = `${esChurn ? '⚠️ RIESGO DE FUGA' : '🚨 ALERTA'} en ${analisisIA.categoria}: ${analisisIA.accion_recomendada}`;
            
            if (!incidenteActivo) {
                await supabase.from("patrones_crisis").insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight,
                    estado: 'abierto',
                    frecuencia: (historico || []).length + 1,
                    nivel_critico: (esChurn || scoreActual > baseline * 3) ? 'alto' : 'medio'
                }]);
                // AQUÍ SE DISPARA EL EMAIL
                await enviarAlertaEmail(usuario_id, analisisIA.categoria, insight);
            } else {
                await supabase.from("patrones_crisis").update({ frecuencia: (historico || []).length + 1 }).eq("id", incidenteActivo.id);
            }
        }

        return { success: true };
    } catch (error) {
        console.error("❌ Error worker:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;