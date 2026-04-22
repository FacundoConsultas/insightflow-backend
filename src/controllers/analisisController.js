import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

// @desc    Crear análisis con IA y guardar en columnas específicas
// @route   POST /api/analisis
export const crearAnalisis = async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    }

    // 1. Llamada a Groq (IA) con formato JSON estricto
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Eres un asistente experto en atención al cliente. 
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

    // 2. Guardado en Supabase (Mapeando a las nuevas columnas)
    const { data, error: dbError } = await supabase
      .from("analisis") 
      .insert([
        { 
          texto_original: texto, 
          resultado: analisisIA.respuesta_automatica,
          categoria: analisisIA.categoria,
          sentimiento: analisisIA.sentimiento,
          prioridad: analisisIA.prioridad,
          resumen: analisisIA.analisis_resumen
        }
      ])
      .select();

    if (dbError) {
      console.error("ERROR DE BASE DE DATOS:", dbError);
      return res.status(500).json({ error: "Fallo al guardar en Supabase", detalles: dbError.message });
    }

    return res.status(200).json({
      mensaje: "Análisis inteligente completado y guardado",
      clasificacion: analisisIA,
      registro_db: data[0]
    });

  } catch (error) {
    console.error("ERROR CRÍTICO:", error.message);
    return res.status(500).json({ error: "Error interno", detalles: error.message });
  }
};

// @desc    Obtener historial con filtros inteligentes
// @route   GET /api/analisis?prioridad=Alta
export const obtenerHistorial = async (req, res) => {
  try {
    const { categoria, prioridad, sentimiento } = req.query;
    
    let query = supabase.from("analisis").select("*");

    // Filtros exactos gracias a las nuevas columnas
    if (categoria) query = query.eq("categoria", categoria);
    if (prioridad) query = query.eq("prioridad", prioridad);
    if (sentimiento) query = query.eq("sentimiento", sentimiento);

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      mensaje: "Historial recuperado",
      cantidad: data.length,
      registros: data
    });
  } catch (error) {
    return res.status(500).json({ error: "Error de servidor", detalles: error.message });
  }
};

// @desc    Eliminar un registro por ID
// @route   DELETE /api/analisis/:id
export const eliminarAnalisis = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("analisis").delete().eq("id", id).select();
    
    if (error) throw error;
    if (data.length === 0) return res.status(404).json({ error: "ID no encontrado" });

    return res.status(200).json({ mensaje: "Registro eliminado", eliminado: data[0] });
  } catch (error) {
    return res.status(500).json({ error: "Error al eliminar", detalles: error.message });
  }
};