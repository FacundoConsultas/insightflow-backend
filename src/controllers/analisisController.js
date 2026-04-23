import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

// @desc    Crear análisis con Inteligencia de Negocio y guardar en DB vinculando al usuario
export const crearAnalisis = async (req, res) => {
  try {
    // Ahora pedimos el usuario_id que viene desde el Frontend
    const { texto, usuario_id } = req.body; 
    
    if (!texto) return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    if (!usuario_id) return res.status(400).json({ error: "El 'usuario_id' es necesario para la seguridad RLS." });

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

    // INSERTAMOS incluyendo el usuario_id
    const { data, error: dbError } = await supabase
      .from("analisis") 
      .insert([
        { 
          texto_original: texto, 
          resultado: analisisIA.respuesta_automatica,
          categoria: analisisIA.categoria,
          sentimiento: analisisIA.sentimiento,
          prioridad: analisisIA.prioridad,
          resumen: analisisIA.analisis_resumen,
          usuario_id: usuario_id // <--- VÍNCULO DE SEGURIDAD
        }
      ])
      .select();

    if (dbError) throw dbError;

    return res.status(200).json({
      mensaje: "Análisis completado y vinculado al usuario",
      clasificacion: analisisIA,
      registro_db: data[0]
    });
  } catch (error) {
    return res.status(500).json({ error: "Error en InsightFlow AI", detalles: error.message });
  }
};

// @desc    Obtener historial filtrado por el usuario logueado
export const obtenerHistorial = async (req, res) => {
  try {
    const { categoria, prioridad, sentimiento, usuario_id } = req.query;
    
    // Filtramos siempre por usuario_id primero
    let query = supabase.from("analisis").select("*").eq("usuario_id", usuario_id);

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

// @desc    Obtener estadísticas solo de los datos del usuario
export const obtenerEstadisticas = async (req, res) => {
  try {
    const { usuario_id } = req.query;
    const { data, error } = await supabase
        .from("analisis")
        .select("categoria, sentimiento, prioridad")
        .eq("usuario_id", usuario_id); // <--- SOLO MIS DATOS
        
    if (error) throw error;

    const stats = {
      total: data.length,
      categorias: { Pagos: 0, Envios: 0, Producto: 0, Soporte: 0, General: 0 },
      sentimientos: { Positivo: 0, Neutro: 0, Negativo: 0 },
      prioridades: { Critica: 0, Alta: 0, Media: 0, Baja: 0 }
    };

    data.forEach(item => {
      const normalizar = (t) => t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

      const c = normalizar(item.categoria);
      const s = normalizar(item.sentimiento);
      const p = normalizar(item.prioridad);

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

    return res.status(200).json({ mensaje: "KPIs del usuario", stats });
  } catch (error) {
    return res.status(500).json({ error: "Error en estadísticas", detalles: error.message });
  }
};

// @desc    Eliminar un registro (RLS se encargará de que sea el dueño)
export const eliminarAnalisis = async (req, res) => {
  try {
    const { id } = req.params;
    // Agregamos chequeo de usuario_id por seguridad extra en la query
    const { usuario_id } = req.body; 

    const { data, error } = await supabase
        .from("analisis")
        .delete()
        .eq("id", id)
        .eq("usuario_id", usuario_id) // Doble validación
        .select();

    if (error) throw error;
    return res.status(200).json({ mensaje: "Eliminado de InsightFlow", eliminado: data[0] });
  } catch (error) {
    return res.status(500).json({ error: "Error al eliminar", detalles: error.message });
  }
};