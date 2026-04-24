import express from 'express';
import { 
  crearAnalisis, 
  crearAnalisisMasivo, 
  obtenerHistorial, 
  eliminarAnalisis, 
  obtenerEstadisticas 
} from '../controllers/analisisController.js';
import { supabase } from '../config/supabase.js'; // Asegúrate de tener acceso a supabase aquí

const router = express.Router();

// Middleware sencillo para verificar el Tier Pro
const checkProTier = async (req, res, next) => {
  const { usuario_id } = req.body;
  if (!usuario_id) return res.status(400).json({ error: "ID de usuario requerido" });

  try {
    const { data: user, error } = await supabase
      .from('usuarios') // Tu tabla de usuarios
      .select('tier')
      .eq('id', usuario_id)
      .single();

    if (error || !user || user.tier < 1) {
      return res.status(403).json({ 
        error: "Acceso denegado. Esta función requiere el Plan Pro." 
      });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: "Error de servidor al verificar plan" });
  }
};

router.post('/', crearAnalisis);
router.post('/masivo', checkProTier, crearAnalisisMasivo); // <--- Blindada con el middleware
router.get('/', obtenerHistorial);
router.get('/stats', obtenerEstadisticas);
router.delete('/:id', eliminarAnalisis);

export default router;