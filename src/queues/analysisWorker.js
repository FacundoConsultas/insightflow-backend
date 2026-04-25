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

// Factor de desviación: 1.8 significa que la crisis se dispara si el score actual 
// es un 180% superior a lo normal de ese usuario.
const FACTOR_DESVIACION = 1.8;
const MINIMO_SCORE_BASE = 5; // Evita falsos positivos en cuentas nuevas o muy tranquilas.

const worker = new Worker('analisis-mensajes', async (job) => {
    const { texto, usuario_id } = job.data; 
    
    console.log(`🤖 Analizando impacto para trabajo ${job.id}...`);

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

        // 1. Guardar el análisis individual
        const { error: dbError } = await supabase
            .from("analisis")
            .insert([{
                texto_original: texto,
                resultado: analisisIA.respuesta_automatica,
                categoria: analisisIA.categoria,
                sentimiento: analisisIA.sentimiento,
                prioridad: analisisIA.prioridad,
                resumen: analisisIA.analisis_resumen,
                usuario_id: usuario_id
            }]);

        if (dbError) throw dbError;

        // --- 🧠 LÓGICA DE BASELINE DINÁMICO (Detección de Anomalías) ---
        
        // A. Calcular la "Normalidad" (Promedio últimas 48hs)
        const hace48Horas = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: historico } = await supabase
            .from("analisis")
            .select("prioridad")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .gt("created_at", hace48Horas);

        const puntosTotales48h = historico.reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
        const promedioPorHora = puntosTotales48h / 48;
        
        // Si la cuenta es muy nueva, usamos el MINIMO_SCORE_BASE como red de seguridad
        const baseline = Math.max(promedioPorHora, MINIMO_SCORE_BASE);

        // B. Calcular la "Urgencia Actual" (Score última 1 hora)
        const haceUnaHora = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        const { data: recientes } = await supabase
            .from("analisis")
            .select("prioridad")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .in("sentimiento", ["Negativo", "Irritado"])
            .gt("created_at", haceUnaHora);

        const scoreActual = recientes.reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
        
        console.log(`📊 Baseline (${analisisIA.categoria}): ${baseline.toFixed(2)} | Actual: ${scoreActual}`);

        // C. Comparación Inteligente
        if (scoreActual > (baseline * FACTOR_DESVIACION)) {
            
            const { data: crisisExistente } = await supabase
                .from("patrones_crisis")
                .select("id")
                .eq("usuario_id", usuario_id)
                .eq("categoria", analisisIA.categoria)
                .eq("resuelta", false)
                .single();

            if (!crisisExistente) {
                const incremento = ((scoreActual / baseline) * 100).toFixed(0);
                const insight = `ANOMALÍA DETECTADA: La categoría ${analisisIA.categoria} presenta un score de ${scoreActual}, un ${incremento}% superior al volumen normal.`;
                
                await supabase.from("patrones_crisis").insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight,
                    frecuencia: recientes.length,
                    nivel_critico: scoreActual > (baseline * 3) ? 'alto' : 'medio'
                }]);

                await enviarAlertaEmail(usuario_id, analisisIA.categoria, insight);
            }
        }

        console.log(`✅ Trabajo ${job.id} terminado.`);
        return { success: true };

    } catch (error) {
        console.error("❌ ERROR EN EL TRABAJO:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;