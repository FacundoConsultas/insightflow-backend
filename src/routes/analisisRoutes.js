import express from 'express';
import { 
  crearAnalisis, 
  crearAnalisisMasivo, 
  obtenerHistorial, 
  eliminarAnalisis, 
  obtenerEstadisticas 
} from '../controllers/analisisController.js';
import { supabase } from '../config/supabase.js'; 

const router = express.Router();

/**
 * MIDDLEWARE: checkProTier
 * Este guardia verifica que el usuario sea Tier 1 (Pro) 
 * antes de dejarlo pasar a las rutas masivas.
 */
const checkProTier = async (req, res, next) => {
  // En GET usamos query, en POST usamos body
  const usuario_id = req.body.usuario_id || req.query.usuario_id;

  if (!usuario_id) {
    return res.status(400).json({ error: "ID de usuario requerido para verificar plan." });
  }

  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('tier')
      .eq('id', usuario_id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "Usuario no encontrado en la base de datos." });
    }

    if (user.tier < 1) {
      return res.status(403).json({ 
        error: "Acceso denegado. La carga masiva es una función exclusiva del Plan Pro." 
      });
    }

    // Si llegó acá, es PRO. Lo dejamos pasar.
    next();
  } catch (e) {
    console.error("Error en middleware:", e);
    res.status(500).json({ error: "Error de servidor al verificar el nivel de suscripción." });
  }
};

// --- RUTAS ---

// Análisis individual (Disponible para todos, el límite se controla en el controller o front)
router.post('/', crearAnalisis);

// Análisis masivo (Protegido: Solo Tier 1+)
router.post('/masivo', checkProTier, crearAnalisisMasivo);

router.get('/', obtenerHistorial);
router.get('/stats', obtenerEstadisticas);
router.delete('/:id', eliminarAnalisis);

export default router;