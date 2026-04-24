import { Worker } from 'bullmq';
import redisConnection from '../config/redisClient.js';
import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

const UMBRAL_CRISIS = 3; // Si hay 3 o más tickets similares, es una crisis

const worker = new Worker('analisis-mensajes', async (job) => {
    const { texto, usuario_id } = job.data;
    
    console.log(`🤖 Procesando trabajo ${job.id} para usuario ${usuario_id}`);

    try {
        // 1. Llamada a la IA (Groq)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI, experto en CX para E-commerce.
                    Analiza el mensaje y responde ÚNICAMENTE en JSON:
                    {
                      "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
                      "sentimiento": "Positivo, Neutro, Negativo o Irritado",
                      "prioridad": "Crítica, Alta, Media o Baja",
                      "analisis_resumen": "Resumen técnico de 1 oración",
                      "respuesta_automatica": "Respuesta profesional y empática",
                      "alerta_operativa": "Breve nota interna"
                    }
                    REGLAS:
                    1. Prioridad CRÍTICA si menciona: 'abogado', 'estafa', 'defensa al consumidor', o demoras > 10 días.
                    2. Categoria 'Logística' si habla de: envíos, Andreani, Correo Argentino, tracking.
                    3. Categoria 'Error de Sistema' si habla de: web tilda, carrito, fallas cupones.`
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
            ]);

        if (dbError) throw dbError;

        // --- 🧠 3. LÓGICA DE DETECCIÓN DE PATRONES (EL CEREBRO) ---
        
        // Buscamos tickets similares en las últimas 2 horas para este usuario
        const haceDosHoras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        const { data: recientes, error: errorConteo } = await supabase
            .from("analisis")
            .select("id")
            .eq("usuario_id", usuario_id)
            .eq("categoria", analisisIA.categoria)
            .in("sentimiento", ["Negativo", "Irritado"])
            .gt("created_at", haceDosHoras);

        if (!errorConteo && recientes.length >= UMBRAL_CRISIS) {
            console.log(`⚠️ PATRÓN DETECTADO: ${recientes.length} quejas de ${analisisIA.categoria}`);
            
            // Insertamos la alerta de crisis
            await supabase
                .from("patrones_crisis")
                .insert([{
                    usuario_id,
                    categoria: analisisIA.categoria,
                    insight: `Se detectó un pico de ${recientes.length} quejas sobre ${analisisIA.categoria} en las últimas 2 horas.`,
                    frecuencia: recientes.length,
                    nivel_critico: recientes.length > 5 ? 'alto' : 'medio'
                }]);
        }
        // -------------------------------------------------------

        console.log(`✅ Trabajo ${job.id} completado con éxito`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Error procesando trabajo ${job.id}:`, error.message);
        throw error; 
    }
}, { 
    connection: redisConnection,
    concurrency: 5 
});

export default worker;