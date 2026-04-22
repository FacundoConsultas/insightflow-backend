import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

export const crearAnalisis = async (req, res) => {
  try {
    const { texto } = req.body;

    // 1. Validación de entrada
    if (!texto) {
      return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    }

    // 2. Llamada a Groq con instrucciones específicas de respuesta automática
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Eres un asistente experto en atención al cliente y análisis de sentimientos. 
          Tu objetivo es calificar el mensaje del usuario y generar una respuesta ayuda.
          DEBES responder ÚNICAMENTE en formato JSON con la siguiente estructura:
          {
            "categoria": "Queja, Elogio, Consulta o Sugerencia",
            "sentimiento": "Positivo, Neutro o Negativo",
            "prioridad": "Alta, Media o Baja",
            "analisis_resumen": "Un resumen de 1 oración del problema",
            "respuesta_automatica": "Una respuesta profesional y empática para el cliente"
          }`
        },
        {
          role: "user",
          content: texto
        },
      ],
      model: "llama-3.1-8b-instant",
      // Esto asegura que la IA devuelva un JSON válido
      response_format: { type: "json_object" } 
    });

    // Parseamos la respuesta de la IA (convertimos el texto JSON en un objeto JS)
    const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

    // 3. Guardado en Supabase
    // Guardamos la respuesta automática en la columna 'resultado' que ya tienes creada
    const { data, error: dbError } = await supabase
      .from("analisis") 
      .insert([
        { 
          texto_original: texto, 
          resultado: analisisIA.respuesta_automatica 
        }
      ])
      .select();

    if (dbError) {
      console.error("ERROR DE BASE DE DATOS:", dbError);
      return res.status(500).json({ 
        error: "Fallo al guardar en Supabase", 
        detalles: dbError.message 
      });
    }

    // 4. Respuesta final al cliente (Frontend / Thunder Client)
    return res.status(200).json({
      mensaje: "Análisis inteligente completado",
      clasificacion: {
        categoria: analisisIA.categoria,
        sentimiento: analisisIA.sentimiento,
        prioridad: analisisIA.prioridad,
        resumen: analisisIA.analisis_resumen
      },
      respuesta_para_cliente: analisisIA.respuesta_automatica,
      registro_db: data[0]
    });

  } catch (error) {
    console.error("ERROR CRÍTICO:", error.message);
    return res.status(500).json({ 
      error: "Error interno", 
      detalles: error.message 
    });
  }
};