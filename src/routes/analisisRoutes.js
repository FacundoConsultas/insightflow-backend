import express from 'express';
const router = express.Router();

// Imports de controladores
import { getDecisionPanel } from '../controllers/decisionController.js';
// (Asumo que tienes estos otros controladores por lo que hablamos antes)
// import { getAnalisis, crearAnalisis } from '../controllers/analisisController.js'; 

// --- RUTAS DE INSIGHTFLOW ---

/**
 * @route   GET /api/decision-panel
 * @desc    Obtiene el resumen consolidado (Crisis, Churn y Acción Sugerida)
 * @access  Privado (requiere usuario_id)
 */
router.get('/decision-panel', getDecisionPanel);

/**
 * @route   POST /api/analizar
 * @desc    Encola un nuevo mensaje para ser analizado por la IA
 */
// router.post('/analizar', crearAnalisis);

/**
 * @route   GET /api/historial
 * @desc    Obtiene todos los registros de la tabla analisis
 */
// router.get('/historial', getAnalisis);

// Ruta de test para verificar que la API responde
router.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'API de InsightFlow funcionando correctamente' });
});

export default router;