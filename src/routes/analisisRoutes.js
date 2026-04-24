import express from 'express';
import { 
  crearAnalisis, 
  crearAnalisisMasivo, // <--- Importamos la nueva función
  obtenerHistorial, 
  eliminarAnalisis, 
  obtenerEstadisticas 
} from '../controllers/analisisController.js';

const router = express.Router();

router.post('/', crearAnalisis);
router.post('/masivo', crearAnalisisMasivo); // <--- NUEVA RUTA
router.get('/', obtenerHistorial);
router.get('/stats', obtenerEstadisticas);
router.delete('/:id', eliminarAnalisis);

export default router;