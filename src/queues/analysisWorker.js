import { Worker } from 'bullmq';
import redisConnection from '../config/redisClient.js';
import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

const worker = new Worker('analisis-mensajes', async (job) => {
    const { texto, usuario_id } = job.data;
    
    console.log(`🤖 Procesando trabajo ${job.id} para usuario ${usuario_id}`);

    try {
        // 1. Llamada a la IA (Groq)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Eres InsightFlow AI, experto en Customer Experience para E-commerce.
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

        // 2. Guardado en Supabase
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

        console.log(`✅ Trabajo ${job.id} completado con éxito`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Error procesando trabajo ${job.id}:`, error.message);
        throw error; // Relevante para que BullMQ gestione el reintento
    }
}, { 
    connection: redisConnection,
    concurrency: 5 // Procesa hasta 5 tickets en paralelo
});

export default worker;