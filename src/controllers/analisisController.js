import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

export const crearAnalisis = async (req, res) => {
  try {
    const { texto } = req.body;

    // 1. Validación de entrada
    if (!texto) {
      return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    }

    console.log("Iniciando análisis para el texto:", texto.substring(0, 50) + "...");

    // 2. Llamada a Groq (IA)
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Eres un experto analista. Analiza el siguiente texto de forma breve y profesional."
        },
        {
          role: "user",
          content: texto
        },
      ],
     model: "llama-3.1-8b-instant", // El reemplazo oficial
    });

    // 3. Log de depuración (Vital para ver en Render)
    console.log("Respuesta completa de Groq recibida.");

    // 4. Validación de la respuesta de la IA (Evita el error del '0')
    if (!chatCompletion.choices || chatCompletion.choices.length === 0) {
      console.error("Groq devolvió un objeto sin opciones (choices)");
      return res.status(500).json({ error: "La IA no devolvió una respuesta válida." });
    }

    const resultadoIA = chatCompletion.choices[0]?.message?.content;

    if (!resultadoIA) {
      return res.status(500).json({ error: "El contenido de la respuesta de la IA está vacío." });
    }

    // 5. Guardar en Supabase (Opcional, según tu lógica)
    const { data, error: dbError } = await supabase
      .from("analisis") // Asegúrate que tu tabla se llame así
      .insert([{ texto_original: texto, resultado: resultadoIA }])
      .select();

    if (dbError) {
      console.error("Error al guardar en Supabase:", dbError);
      // No cortamos el flujo aquí para que al menos devuelva el análisis de la IA
    }

    // 6. Respuesta final exitosa
    return res.status(200).json({
      mensaje: "Análisis realizado con éxito",
      analisis: resultadoIA,
      datos_guardados: data ? data[0] : "No se guardó en DB"
    });

  } catch (error) {
    console.error("ERROR CRÍTICO EN EL CONTROLADOR:", error.message);
    return res.status(500).json({
      error: "Error interno del servidor",
      detalles: error.message
    });
  }
};