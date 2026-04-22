import express from 'express';
import { 
  crearAnalisis, 
  obtenerHistorial, 
  eliminarAnalisis, 
  obtenerEstadisticas 
} from '../controllers/analisisController.js';

const router = express.Router();

// POST: Analiza y guarda en la DB
router.post('/', crearAnalisis);

// GET: Lista de historial con filtros (?categoria=...)
router.get('/', obtenerHistorial);

// GET: Resumen estadístico para el Dashboard (Debe ir antes de /:id)
router.get('/stats', obtenerEstadisticas);

// DELETE: Borra un registro por su ID
router.delete('/:id', eliminarAnalisis);

export default router;