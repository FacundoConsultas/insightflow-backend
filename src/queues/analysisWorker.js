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

// --- CONFIGURACIÓN DE INTELIGENCIA ---
const FACTOR_DESVIACION = 1.8; // Alerta si sube un 180% sobre lo normal
const MINIMO_SCORE_BASE = 5;   // Red de seguridad para cuentas nuevas

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

        // --- 🧠 LÓGICA DE BASELINE DINÁMICO (Detección de Anomalías) ---
        
        // A. Calcular la "Normalidad" (Promedio últimas 48hs)
        const hace48Horas = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: historico } = await supabase
            .from("analisis")
            .select("prioridad")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .gt("created_at", hace48Horas);

        const puntosTotales48h = (historico || []).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
        const promedioPorHora = puntosTotales48h / 48;
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

        const scoreActual = (recientes || []).reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
        
        console.log(`📊 [${analisisIA.categoria}] Baseline: ${baseline.toFixed(2)} | Actual: ${scoreActual}`);

        // --- 🔎 GESTIÓN AUTOMÁTICA DE CRISIS ---

        // Verificar si ya existe una crisis activa para esta categoría
        const { data: crisisActiva } = await supabase
            .from("patrones_crisis")
            .select("id")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .eq("resuelta", false)
            .maybeSingle();

        // CASO 1: DISPARAR CRISIS (Si el score actual supera el baseline * factor)
        if (scoreActual > (baseline * FACTOR_DESVIACION)) {
            if (!crisisActiva) {
                const incremento = ((scoreActual / baseline) * 100).toFixed(0);
                const insight = `ANOMALÍA DETECTADA: La categoría ${analisisIA.categoria} presenta un score de ${scoreActual} (${incremento}% sobre lo normal).`;
                
                await supabase.from("patrones_crisis").insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight,
                    frecuencia: (recientes || []).length,
                    nivel_critico: scoreActual > (baseline * 3) ? 'alto' : 'medio'
                }]);

                await enviarAlertaEmail(usuario_id, analisisIA.categoria, insight);
            }
        } 
        // CASO 2: AUTOCIERRE (Si hay crisis activa pero el score ya volvió a la normalidad)
        else if (crisisActiva && scoreActual <= baseline) {
            console.log(`✅ Normalización detectada en ${analisisIA.categoria}. Cerrando crisis automáticamente...`);
            await supabase
                .from("patrones_crisis")
                .update({ 
                    resuelta: true, 
                    resuelta_at: new Date().toISOString() 
                })
                .eq("id", crisisActiva.id);
        }

        console.log(`✅ Trabajo ${job.id} procesado.`);
        return { success: true };

    } catch (error) {
        console.error("❌ ERROR:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;