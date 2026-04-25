import { Worker } from 'bullmq';
import redisConnection from '../config/redisClient.js';
import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";
import { enviarAlertaEmail } from "../services/emailService.js";

const PESOS_PRIORIDAD = {
  "Crítica": 4,
  "Alta": 2,
  "Media": 1,
  "Baja": 0.5
};

const FACTOR_DESVIACION = 1.8;
const MINIMO_SCORE_BASE = 5;

const worker = new Worker('analisis-mensajes', async (job) => {
    // Extraemos cliente_id del trabajo (capa de cliente)
    const { texto, usuario_id, cliente_id } = job.data; 
    
    console.log(`🤖 Analizando impacto para usuario ${usuario_id} | Cliente: ${cliente_id || 'Anónimo'}...`);

    try {
        // 1. Análisis de IA con foco en CHURN
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI, experto en retención de clientes. 
                    Analiza y responde ÚNICAMENTE en JSON:
                    {
                      "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                      "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                      "prioridad": "Crítica, Alta, Media o Baja",
                      "analisis_resumen": "1 oración",
                      "respuesta_automatica": "Respuesta profesional",
                      "riesgo_churn": true/false
                    }`
                },
                { role: "user", content: texto },
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

        // 2. Guardar el análisis incluyendo cliente_id
        await supabase.from("analisis").insert([{
            texto_original: texto,
            resultado: analisisIA.respuesta_automatica,
            categoria: analisisIA.categoria,
            sentimiento: analisisIA.sentimiento,
            prioridad: analisisIA.prioridad,
            resumen: analisisIA.analisis_resumen,
            usuario_id: usuario_id,
            cliente_id: cliente_id || "Anónimo"
        }]);

        // --- 🧠 LÓGICA DE CONTEXTO E INTELIGENCIA ---
        const ahora = new Date();
        const hace48Horas = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
        
        const { data: historico } = await supabase
            .from("analisis")
            .select("prioridad, created_at, sentimiento, cliente_id")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .gt("created_at", hace48Horas);

        // A. Baseline (Normalidad)
        const puntosTotales48h = (historico || []).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
        const baseline = Math.max(puntosTotales48h / 48, MINIMO_SCORE_BASE);

        // B. Score Actual (Última hora)
        const haceUnaHora = new Date(ahora - 1 * 60 * 60 * 1000).toISOString();
        const recientes = (historico || []).filter(t => t.created_at > haceUnaHora);
        const scoreActual = recientes.reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);

        // C. Comparativa Ayer (Contexto profundo)
        const hace25Horas = new Date(ahora - 25 * 60 * 60 * 1000).toISOString();
        const hace23Horas = new Date(ahora - 23 * 60 * 60 * 1000).toISOString();
        const scoreAyer = (historico || [])
            .filter(t => t.created_at > hace25Horas && t.created_at < hace23Horas)
            .reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);

        // --- 🔎 GESTIÓN DE CRISIS Y CHURN ---

        const { data: crisisActiva } = await supabase
            .from("patrones_crisis")
            .select("id")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .eq("resuelta", false)
            .maybeSingle();

        // Se dispara si hay anomalía de volumen O riesgo de pérdida de cliente
        if (scoreActual > (baseline * FACTOR_DESVIACION) || analisisIA.riesgo_churn) {
            if (!crisisActiva) {
                let tendenciaMsg = "Se detectó una anomalía.";
                
                // Lógica de tendencia
                if (scoreAyer > 0) {
                    const diff = ((scoreActual / scoreAyer) * 100).toFixed(0);
                    tendenciaMsg = scoreActual > scoreAyer 
                        ? `EMPEORANDO: ${diff}% más que ayer.` 
                        : `RECURRENTE: Patrón similar a ayer.`;
                }

                // Lógica de Churn
                const churnAlert = analisisIA.riesgo_churn && cliente_id 
                    ? `⚠️ RIESGO DE CHURN: Cliente [${cliente_id}] en peligro. ` 
                    : "";

                const incremento = ((scoreActual / baseline) * 100).toFixed(0);
                const insightFinal = `${churnAlert}🚨 ${tendenciaMsg} Score: ${scoreActual} (+${incremento}% vs normal).`;
                
                await supabase.from("patrones_crisis").insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight: insightFinal,
                    frecuencia: recientes.length,
                    nivel_critico: (analisisIA.riesgo_churn || scoreActual > baseline * 3) ? 'alto' : 'medio'
                }]);

                await enviarAlertaEmail(usuario_id, analisisIA.categoria, insightFinal);
            }
        } 
        else if (crisisActiva && scoreActual <= baseline) {
            console.log(`✅ Normalización en ${analisisIA.categoria}. Cerrando crisis.`);
            await supabase
                .from("patrones_crisis")
                .update({ resuelta: true, resuelta_at: ahora.toISOString() })
                .eq("id", crisisActiva.id);
        }

        console.log(`✅ Trabajo ${job.id} finalizado.`);
        return { success: true };

    } catch (error) {
        console.error("❌ ERROR EN EL WORKER:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;