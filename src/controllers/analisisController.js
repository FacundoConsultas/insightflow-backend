import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

// @desc    Crear análisis con IA y guardar en DB
// @route   POST /api/analisis
export const crearAnalisis = async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    }

    // 1. Llamada a Groq (IA)
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
        { role: "user", content: texto },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" } 
    });

    const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

    // 2. Guardado en Supabase
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
      return res.status(500).json({ error: "Fallo al guardar en Supabase", detalles: dbError.message });
    }

    return res.status(200).json({
      mensaje: "Análisis inteligente completado",
      clasificacion: analisisIA,
      registro_db: data[0]
    });

  } catch (error) {
    console.error("ERROR CRÍTICO:", error.message);
    return res.status(500).json({ error: "Error interno", detalles: error.message });
  }
};

// @desc    Obtener todos los registros de la DB
// @route   GET /api/analisis
export const obtenerHistorial = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("analisis")
      .select("*")
      .order("created_at", { ascending: false }); // Orden descendente (más recientes arriba)

    if (error) {
      console.error("ERROR AL RECUPERAR HISTORIAL:", error);
      return res.status(500).json({ error: "No se pudo obtener el historial", detalles: error.message });
    }

    return res.status(200).json({
      mensaje: "Historial recuperado con éxito",
      cantidad: data.length,
      registros: data
    });
  } catch (error) {
    return res.status(500).json({ error: "Error de servidor", detalles: error.message });
  }
};