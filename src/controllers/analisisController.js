import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

export const crearAnalisis = async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    }

    // 1. Llamada a Groq
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "Eres un experto analista profesional." },
        { role: "user", content: texto },
      ],
      model: "llama-3.1-8b-instant",
    });

    const resultadoIA = chatCompletion.choices[0]?.message?.content;

    // 2. Intento de Guardado en Supabase
    const { data, error: dbError } = await supabase
      .from("analisis") 
      .insert([{ texto_original: texto, resultado: resultadoIA }])
      .select();

    // MODIFICACIÓN AQUÍ: Si falla la DB, devolvemos el error real
    if (dbError) {
      console.error("ERROR DE BASE DE DATOS:", dbError);
      return res.status(500).json({ 
        error: "Fallo al guardar en Supabase", 
        detalles: dbError.message,
        codigo_error: dbError.code 
      });
    }

    // 3. Si todo salió bien
    return res.status(200).json({
      mensaje: "Análisis realizado y guardado con éxito",
      analisis: resultadoIA,
      registro: data[0]
    });

  } catch (error) {
    console.error("ERROR CRÍTICO:", error.message);
    return res.status(500).json({ error: "Error interno", detalles: error.message });
  }
};