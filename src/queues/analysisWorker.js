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
    const { texto, usuario_id } = job.data; 
    
    console.log(`🤖 Analizando impacto para trabajo ${job.id}...`);

    try {
        // 1. Análisis de IA
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI. Analiza y responde ÚNICAMENTE en JSON:
                    {
                      "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                      "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                      "prioridad": "Crítica, Alta, Media o Baja",
                      "analisis_resumen": "1 oración",
                      "respuesta_automatica": "Respuesta profesional"
                    }`
                },
                { role: "user", content: texto },
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

        // 2. Guardar el análisis individual
        await supabase.from("analisis").insert([{
            texto_original: texto,
            resultado: analisisIA.respuesta_automatica,
            categoria: analisisIA.categoria,
            sentimiento: analisisIA.sentimiento,
            prioridad: analisisIA.prioridad,
            resumen: analisisIA.analisis_resumen,
            usuario_id: usuario_id
        }]);

        // --- 🧠 LÓGICA DE CONTEXTO HISTÓRICO Y TENDENCIAS ---
        const ahora = new Date();
        const hace48Horas = new Date(ahora - 48 * 60 * 60 * 1000).toISOString();
        
        const { data: historico } = await supabase
            .from("analisis")
            .select("prioridad, created_at")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .gt("created_at", hace48Horas);

        // A. Baseline (Normalidad de las últimas 48hs)
        const puntosTotales48h = (historico || []).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
        const baseline = Math.max(puntosTotales48h / 48, MINIMO_SCORE_BASE);

        // B. Score Actual (Última 1 hora)
        const haceUnaHora = new Date(ahora - 1 * 60 * 60 * 1000).toISOString();
        const recientes = (historico || []).filter(t => t.created_at > haceUnaHora);
        const scoreActual = recientes.reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);

        // C. Comparativa Ayer (Misma ventana horaria hace 24hs)
        const hace25Horas = new Date(ahora - 25 * 60 * 60 * 1000).toISOString();
        const hace23Horas = new Date(ahora - 23 * 60 * 60 * 1000).toISOString();
        const scoreAyer = (historico || [])
            .filter(t => t.created_at > hace25Horas && t.created_at < hace23Horas)
            .reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);

        console.log(`📊 [${analisisIA.categoria}] Baseline: ${baseline.toFixed(2)} | Actual: ${scoreActual} | Ayer: ${scoreAyer}`);

        // --- 🔎 GESTIÓN DE CRISIS CON INSIGHTS ---

        const { data: crisisActiva } = await supabase
            .from("patrones_crisis")
            .select("id")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .eq("resuelta", false)
            .maybeSingle();

        if (scoreActual > (baseline * FACTOR_DESVIACION)) {
            if (!crisisActiva) {
                // Generar Insight de Tendencia
                let tendenciaMsg = "Se detectó una anomalía en el volumen de quejas.";
                
                if (scoreAyer > 0) {
                    const diff = ((scoreActual / scoreAyer) * 100).toFixed(0);
                    if (scoreActual > scoreAyer) {
                        tendenciaMsg = `La situación está EMPEORANDO: el impacto es un ${diff}% mayor que ayer a esta hora.`;
                    } else {
                        tendenciaMsg = `Problema RECURRENTE: se detectó un patrón crítico similar al de ayer.`;
                    }
                }

                const incrementoBaseline = ((scoreActual / baseline) * 100).toFixed(0);
                const insightFinal = `🚨 ${tendenciaMsg} (Score: ${scoreActual}, +${incrementoBaseline}% vs. normal).`;
                
                await supabase.from("patrones_crisis").insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight: insightFinal,
                    frecuencia: recientes.length,
                    nivel_critico: scoreActual > (baseline * 3) ? 'alto' : 'medio'
                }]);

                await enviarAlertaEmail(usuario_id, analisisIA.categoria, insightFinal);
            }
        } 
        else if (crisisActiva && scoreActual <= baseline) {
            console.log(`✅ Situación normalizada en ${analisisIA.categoria}.`);
            await supabase
                .from("patrones_crisis")
                .update({ resuelta: true, resuelta_at: ahora.toISOString() })
                .eq("id", crisisActiva.id);
        }

        console.log(`✅ Trabajo ${job.id} procesado.`);
        return { success: true };

    } catch (error) {
        console.error("❌ ERROR EN TRABAJO:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;