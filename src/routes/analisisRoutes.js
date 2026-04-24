import express from 'express';
import { 
  crearAnalisis, 
  crearAnalisisMasivo, 
  obtenerHistorial, 
  eliminarAnalisis, 
  obtenerEstadisticas,
  resolverCrisisMasiva // <-- Nueva función
} from '../controllers/analisisController.js';
import { supabase } from '../config/supabase.js'; 

const router = express.Router();

/**
 * MIDDLEWARE: checkProTier
 * Verifica que el usuario sea Tier 1 (Pro)
 */
const checkProTier = async (req, res, next) => {
  const usuario_id = req.body.usuario_id || req.query.usuario_id;

  if (!usuario_id) {
    return res.status(400).json({ error: "ID de usuario requerido." });
  }

  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('tier')
      .eq('id', usuario_id)
      .single();

    if (error || !user || user.tier < 1) {
      return res.status(403).json({ error: "Acceso denegado. Función exclusiva del Plan Pro." });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: "Error de servidor al verificar suscripción." });
  }
};

// --- RUTAS ---
router.post('/', crearAnalisis);
router.post('/masivo', checkProTier, crearAnalisisMasivo);
router.post('/resolver-crisis', resolverCrisisMasiva); // <-- Nueva ruta para la acción del banner

router.get('/', obtenerHistorial);
router.get('/stats', obtenerEstadisticas);
router.delete('/:id', eliminarAnalisis);

export default router;