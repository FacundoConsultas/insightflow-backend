import { Worker } from 'bullmq';
import redisConnection from '../config/redisClient.js';
import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";
import { enviarAlertaEmail } from "../services/emailService.js"; // Lo crearemos en el siguiente paso

// Configuración de Pesos para el "Cerebro" de Severidad
const PESOS_PRIORIDAD = {
  "Crítica": 4,
  "Alta": 2,
  "Media": 1,
  "Baja": 0.5
};

const SCORE_UMBRAL_CRISIS = 7; // Ej: 2 Críticas (8 pts) o 4 Altas (8 pts) disparan crisis

const worker = new Worker('analisis-mensajes', async (job) => {
    const { texto, usuario_id } = job.data;
    
    console.log(`🤖 Analizando riesgo para trabajo ${job.id}...`);

    try {
        // 1. Llamada a la IA (Groq) - Mantenemos el prompt profesional
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI, experto en CX. 
                    Analiza y responde ÚNICAMENTE en JSON:
                    {
                      "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                      "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                      "prioridad": "Crítica, Alta, Media o Baja",
                      "analisis_resumen": "Resumen técnico de 1 oración",
                      "respuesta_automatica": "Respuesta profesional y empática"
                    }
                    REGLAS:
                    1. Prioridad CRÍTICA si menciona: 'abogado', 'estafa', 'defensa al consumidor', o demoras > 10 días.
                    2. Categoria 'Logística' si habla de: envíos, Andreani, Correo Argentino, tracking.`
                },
                { role: "user", content: texto },
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

        // 2. Guardado del Análisis Individual
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

        // --- 🧠 3. EL CEREBRO: LÓGICA DE SEVERIDAD PONDERADA ---
        
        const haceTresHoras = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

        // Traemos los tickets negativos recientes de esta categoría
        const { data: recientes, error: errorConteo } = await supabase
            .from("analisis")
            .select("prioridad")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .in("sentimiento", ["Negativo", "Irritado"])
            .gt("created_at", haceTresHoras);

        if (!errorConteo && recientes.length > 0) {
            // Calculamos el score acumulado de severidad
            const scoreTotal = recientes.reduce((acc, t) => acc + (PESOS_PRIORIDAD[t.prioridad] || 0), 0);
            
            console.log(`📈 Score de severidad en ${analisisIA.categoria}: ${scoreTotal}`);

            if (scoreTotal >= SCORE_UMBRAL_CRISIS) {
                // Verificar si ya existe una crisis activa para evitar spam de alertas
                const { data: crisisExistente } = await supabase
                    .from("patrones_crisis")
                    .select("id")
                    .eq("usuario_id", usuario_id)
                    .eq("categoria", analisisIA.categoria)
                    .eq("resuelta", false)
                    .single();

                if (!crisisExistente) {
                    const insight = `ALERTA CRÍTICA: La categoría ${analisisIA.categoria} alcanzó un score de severidad de ${scoreTotal}. Hay múltiples reclamos de alta prioridad.`;
                    
                    // a. Insertar crisis (esto activa el Realtime en el Front)
                    const { data: nuevaCrisis } = await supabase
                        .from("patrones_crisis")
                        .insert([{
                            usuario_id,
                            categoria: analisisIA.categoria,
                            insight,
                            frecuencia: recientes.length,
                            nivel_critico: scoreTotal > 12 ? 'alto' : 'medio'
                        }])
                        .select()
                        .single();

                    // b. DISPARAR EMAIL (Fase 2)
                    // Llamamos a la función aunque todavía no hayamos configurado Nodemailer del todo
                    await enviarAlertaEmail(usuario_id, analisisIA.categoria, insight);
                }
            }
        }

        console.log(`✅ Trabajo ${job.id} completado.`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Error en worker ${job.id}:`, error.message);
        throw error; 
    }
}, { 
    connection: redisConnection,
    concurrency: 5 
});

export default worker;