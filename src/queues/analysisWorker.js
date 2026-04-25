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
    
    console.log(`🤖 Procesando Incidente | Usuario: ${usuario_id} | Cliente: ${cliente_id || 'Anónimo'}`);

    try {
        // 1. Análisis de IA (Categoría, Sentimiento y Riesgo de Churn)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI, experto en retención de clientes y gestión de crisis. 
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

        // 2. Guardar análisis individual
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

        // --- 🧠 LÓGICA DE INTELIGENCIA DE NEGOCIO ---
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

        // --- 🔎 TRACKING DE INCIDENTES (CAPA DE CLIENTE) ---
        
        // Buscamos si ya hay un incidente abierto o en progreso
        const { data: incidenteActivo } = await supabase
            .from("patrones_crisis")
            .select("id, estado")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .neq("estado", "resuelto")
            .maybeSingle();

        if (scoreActual > (baseline * FACTOR_DESVIACION) || analisisIA.riesgo_churn) {
            if (!incidenteActivo) {
                // Lógica de Mensaje de Alerta
                const churnTag = analisisIA.riesgo_churn ? `⚠️ CHURN DETECTADO [Cliente: ${cliente_id || 'ID Desconocido'}]` : `🚨 ANOMALÍA`;
                const insight = `${churnTag}: Crisis en ${analisisIA.categoria}. Score: ${scoreActual.toFixed(1)}. Resumen: ${analisisIA.analisis_resumen}`;
                
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
                // Actualizamos frecuencia del incidente existente
                await supabase.from("patrones_crisis").update({ frecuencia: (historico || []).length }).eq("id", incidenteActivo.id);
            }
        } 
        else if (incidenteActivo && scoreActual <= baseline && incidenteActivo.estado === 'abierto') {
            // Autocierre solo si el usuario no lo ha marcado como 'en_progreso' manualmente
            await supabase.from("patrones_crisis").update({ 
                estado: 'resuelto', 
                resuelta: true, 
                resuelta_at: ahora.toISOString() 
            }).eq("id", incidenteActivo.id);
            console.log(`✅ Incidente en ${analisisIA.categoria} normalizado y cerrado.`);
        }

        return { success: true };
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN WORKER:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;