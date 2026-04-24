import groq from "../config/groq.js";
import { supabase } from "../config/supabase.js";

// @desc    Crear análisis experto en E-commerce y guardar en DB
export const crearAnalisis = async (req, res) => {
  try {
    const { texto, usuario_id } = req.body; 
    
    if (!texto) return res.status(400).json({ error: "El campo 'texto' es obligatorio." });
    if (!usuario_id) return res.status(400).json({ error: "El 'usuario_id' es necesario para la seguridad RLS." });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Eres InsightFlow AI, un analista senior de operaciones para E-commerce. 
          Tu objetivo es procesar tickets de soporte y convertirlos en datos accionables.

          Analiza el mensaje y responde ÚNICAMENTE en JSON con esta estructura:
          {
            "categoria": "Logística, Pagos, Calidad de Producto, Error de Sistema o Preventa",
            "sentimiento": "Positivo, Neutro, Negativo o Irritado",
            "prioridad": "Crítica, Alta, Media o Baja",
            "analisis_resumen": "Resumen técnico de 1 oración indicando el problema central",
            "respuesta_automatica": "Respuesta profesional, empática y resolutiva para el cliente",
            "detecto_pedido": true
          }

          REGLAS DE NEGOCIO:
          - Si menciona 'estafa', 'denuncia', 'abogado' o 'redes sociales', prioridad CRÍTICA.
          - Si el sentimiento es 'Irritado', la respuesta_automatica debe ser conciliadora y escalar el caso.
          - Si menciona un número (ej: #1234), detecto_pedido debe ser true.`
        },
        { role: "user", content: texto },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" } 
    });

    const analisisIA = JSON.parse(chatCompletion.choices[0]?.message?.content);

    // INSERTAMOS en Supabase mapeando los campos del JSON de la IA a las columnas de la DB
    const { data, error: dbError } = await supabase
      .from("analisis") 
      .insert([
        { 
          texto_original: texto, 
          resultado: analisisIA.respuesta_automatica, // Guardamos la respuesta para el botón de copiar
          categoria: analisisIA.categoria,
          sentimiento: analisisIA.sentimiento,
          prioridad: analisisIA.prioridad,
          resumen: analisisIA.analisis_resumen,
          usuario_id: usuario_id 
        }
      ])
      .select();

    if (dbError) throw dbError;

    return res.status(200).json({
      mensaje: "Análisis de E-commerce completado",
      clasificacion: analisisIA,
      registro_db: data[0]
    });
  } catch (error) {
    return res.status(500).json({ error: "Error en motor de IA", detalles: error.message });
  }
};

// @desc    Obtener historial filtrado por el usuario logueado
export const obtenerHistorial = async (req, res) => {
  try {
    const { categoria, prioridad, sentimiento, usuario_id } = req.query;
    
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

// @desc    Obtener estadísticas (KPIs)
export const obtenerEstadisticas = async (req, res) => {
  try {
    const { usuario_id } = req.query;
    const { data, error } = await supabase
        .from("analisis")
        .select("categoria, sentimiento, prioridad")
        .eq("usuario_id", usuario_id);
        
    if (error) throw error;

    const stats = {
      total: data.length,
      categorias: { Logistica: 0, Pagos: 0, Producto: 0, Sistema: 0, Preventa: 0 },
      sentimientos: { Positivo: 0, Neutro: 0, Negativo: 0, Irritado: 0 },
      prioridades: { Critica: 0, Alta: 0, Media: 0, Baja: 0 }
    };

    data.forEach(item => {
      const normalizar = (t) => t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

      const c = normalizar(item.categoria);
      const s = normalizar(item.sentimiento);
      const p = normalizar(item.prioridad);

      // Lógica de conteo por categorías de E-commerce
      if (c.includes("logist")) stats.categorias.Logistica++;
      else if (c.includes("pago")) stats.categorias.Pagos++;
      else if (c.includes("prod")) stats.categorias.Producto++;
      else if (c.includes("sistem") || c.includes("error")) stats.categorias.Sistema++;
      else stats.categorias.Preventa++;

      if (s.includes("positi")) stats.sentimientos.Positivo++;
      else if (s.includes("neutr")) stats.sentimientos.Neutro++;
      else if (s.includes("negati")) stats.sentimientos.Negativo++;
      else if (s.includes("irrit")) stats.sentimientos.Irritado++;

      if (p.includes("criti")) stats.prioridades.Critica++;
      else if (p.includes("alt")) stats.prioridades.Alta++;
      else if (p.includes("medi")) stats.prioridades.Media++;
      else if (p.includes("baj")) stats.prioridades.Baja++;
    });

    return res.status(200).json({ mensaje: "KPIs actualizados", stats });
  } catch (error) {
    return res.status(500).json({ error: "Error en estadísticas", detalles: error.message });
  }
};

// @desc    Eliminar un registro
export const eliminarAnalisis = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario_id } = req.body; 

    const { data, error } = await supabase
        .from("analisis")
        .delete()
        .eq("id", id)
        .eq("usuario_id", usuario_id) 
        .select();

    if (error) throw error;
    return res.status(200).json({ mensaje: "Registro eliminado", eliminado: data[0] });
  } catch (error) {
    return res.status(500).json({ error: "Error al eliminar", detalles: error.message });
  }
};