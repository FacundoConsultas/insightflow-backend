import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

// @desc    Crear análisis con Inteligencia de Negocio y guardar en DB
export const crearAnalisis = async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: "El campo 'texto' es obligatorio." });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Eres InsightFlow AI, un motor avanzado de inteligencia de negocio para atención al cliente.
          Analiza el mensaje y responde ÚNICAMENTE en formato JSON con esta estructura:
          {
            "categoria": "Pagos, Envíos, Producto, Soporte Técnico o General",
            "sentimiento": "Positivo, Neutro o Negativo",
            "prioridad": "Crítica, Alta, Media o Baja",
            "analisis_resumen": "Resumen de 1 oración enfocada en el problema de negocio",
            "respuesta_automatica": "Respuesta profesional, empática y resolutiva"
          }
          REGLA DE ORO: Si el texto menciona 'denuncia', 'abogado', 'estafa', 'fraude' o 'nunca más', la prioridad DEBE ser Crítica.`
        },
        { role: "user", content: texto },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" } 
    });

    const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

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

    if (dbError) throw dbError;

    return res.status(200).json({
      mensaje: "Análisis de InsightFlow AI completado",
      clasificacion: analisisIA,
      registro_db: data[0]
    });
  } catch (error) {
    return res.status(500).json({ error: "Error en InsightFlow AI", detalles: error.message });
  }
};

// @desc    Obtener historial con filtros de negocio
export const obtenerHistorial = async (req, res) => {
  try {
    const { categoria, prioridad, sentimiento } = req.query;
    let query = supabase.from("analisis").select("*");

    if (categoria) query = query.eq("categoria", categoria);
    if (prioridad) query = query.eq("prioridad", prioridad);
    if (sentimiento) query = query.eq("sentimiento", sentimiento);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    return res.status(200).json({ mensaje: "Historial recuperado", registros: data });
  } catch (error) {
    return res.status(500).json({ error: "Error de servidor", detalles: error.message });
  }
};

// @desc    Obtener estadísticas para Dashboard (Normalizadas)
export const obtenerEstadisticas = async (req, res) => {
  try {
    const { data, error } = await supabase.from("analisis").select("categoria, sentimiento, prioridad");
    if (error) throw error;

    const stats = {
      total: data.length,
      categorias: { Pagos: 0, Envios: 0, Producto: 0, Soporte: 0, General: 0 },
      sentimientos: { Positivo: 0, Neutro: 0, Negativo: 0 },
      prioridades: { Critica: 0, Alta: 0, Media: 0, Baja: 0 }
    };

    data.forEach(item => {
      // Función para quitar tildes y dejar todo en minúsculas
      const normalizar = (t) => t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

      const c = normalizar(item.categoria);
      const s = normalizar(item.sentimiento);
      const p = normalizar(item.prioridad);

      // Conteo con lógica flexible
      if (c.includes("pago")) stats.categorias.Pagos++;
      else if (c.includes("envi")) stats.categorias.Envios++;
      else if (c.includes("prod")) stats.categorias.Producto++;
      else if (c.includes("sopor") || c.includes("tecnic")) stats.categorias.Soporte++;
      else stats.categorias.General++;

      if (s.includes("positi")) stats.sentimientos.Positivo++;
      else if (s.includes("neutr")) stats.sentimientos.Neutro++;
      else if (s.includes("negati")) stats.sentimientos.Negativo++;

      if (p.includes("criti")) stats.prioridades.Critica++;
      else if (p.includes("alt")) stats.prioridades.Alta++;
      else if (p.includes("medi")) stats.prioridades.Media++;
      else if (p.includes("baj")) stats.prioridades.Baja++;
    });

    return res.status(200).json({ mensaje: "KPIs normalizados", stats });
  } catch (error) {
    return res.status(500).json({ error: "Error en estadísticas", detalles: error.message });
  }
};

// @desc    Eliminar un registro
export const eliminarAnalisis = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("analisis").delete().eq("id", id).select();
    if (error) throw error;
    return res.status(200).json({ mensaje: "Eliminado de InsightFlow", eliminado: data[0] });
  } catch (error) {
    return res.status(500).json({ error: "Error al eliminar", detalles: error.message });
  }
};