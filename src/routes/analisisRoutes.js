import express from 'express';
const router = express.Router();

// Importamos los controladores desde sus respectivos archivos
import { 
    crearAnalisis, 
    obtenerHistorial, 
    eliminarAnalisis 
} from '../controllers/analisisController.js';

import { getDecisionPanel } from '../controllers/decisionController.js';

// --- RUTAS DE INSIGHTFLOW ---

// GET /api/analisis -> Para cargar la tabla principal
router.get('/', obtenerHistorial);

// POST /api/analisis -> Para el botón de "Analizar"
router.post('/', crearAnalisis);

// DELETE /api/analisis/:id -> Para borrar registros de la tabla
router.delete('/:id', eliminarAnalisis);

// GET /api/analisis/decision-panel -> Para el banner de crisis y churn
router.get('/decision-panel', getDecisionPanel);

// Ruta de test para verificar que el backend vive
router.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'API de InsightFlow conectada y rutas configuradas' 
    });
});

export default router;