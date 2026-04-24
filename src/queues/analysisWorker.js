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

const SCORE_UMBRAL_CRISIS = 7; 

const worker = new Worker('analisis-mensajes', async (job) => {
    const { texto, usuario_id, cliente_id } = job.data; // cliente_id puede ser un email o ID de cliente
    
    console.log(`🤖 Analizando impacto total para trabajo ${job.id}...`);

    try {
        // 1. IA analiza el sentimiento y categoría
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

        // 2. Guardar el análisis
        const { data: nuevoTicket, error: dbError } = await supabase
            .from("analisis")
            .insert([{
                texto_original: texto,
                resultado: analisisIA.respuesta_automatica,
                categoria: analisisIA.categoria,
                sentimiento: analisisIA.sentimiento,
                prioridad: analisisIA.prioridad,
                resumen: analisisIA.analisis_resumen,
                usuario_id: usuario_id,
                cliente_id: cliente_id || 'anónimo' // Agrupamos por cliente
            }])
            .select()
            .single();

        if (dbError) throw dbError;

        // --- 👤 LÓGICA DE CLIENTE EN RIESGO (CHURN) ---
        // Si un mismo cliente tiene 3 o más quejas, es una alerta roja individual
        const { count: quejasCliente } = await supabase
            .from("analisis")
            .select("*", { count: 'exact', head: true })
            .eq("cliente_id", cliente_id || 'anónimo')
            .in("sentimiento", ["Negativo", "Irritado"]);

        if (quejasCliente >= 3) {
            console.log(`🔥 CLIENTE EN RIESGO: ${cliente_id}`);
            // Opcional: Podrías mandar un mail específico avisando que "X" cliente está por irse
        }

        // --- 🧠 LÓGICA DE CRISIS GENERAL (SEVERIDAD) ---
        const haceTresHoras = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
        const { data: recientes } = await supabase
            .from("analisis")
            .select("prioridad")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .in("sentimiento", ["Negativo", "Irritado"])
            .gt("created_at", haceTresHoras);

        if (recientes && recientes.length > 0) {
            const scoreTotal = recientes.reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
            
            if (scoreTotal >= SCORE_UMBRAL_CRISIS) {
                const { data: crisisExistente } = await supabase
                    .from("patrones_crisis")
                    .select("id")
                    .eq("usuario_id", usuario_id)
                    .eq("categoria", analisisIA.categoria)
                    .eq("resuelta", false)
                    .single();

                if (!crisisExistente) {
                    const insight = `CRISIS EN ${analisisIA.categoria.toUpperCase()}: Score ${scoreTotal}.`;
                    
                    await supabase.from("patrones_crisis").insert([{
                        usuario_id,
                        categoria: analisisIA.categoria,
                        insight,
                        frecuencia: recientes.length,
                        nivel_critico: scoreTotal > 12 ? 'alto' : 'medio'
                    }]);

                    // ENVIAR EMAIL REAL
                    await enviarAlertaEmail(usuario_id, analisisIA.categoria, insight);
                }
            }
        }

        return { success: true };
    } catch (error) {
        console.error("❌ Error:", error.message);
        throw error;
    }
}, { connection: redisConnection, concurrency: 5 });

export default worker;