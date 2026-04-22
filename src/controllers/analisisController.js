const groqConfig = require('../config/groq');
const Analisis = require('../models/Analisis');

exports.analizarTexto = async (req, res) => {
    try {
        const { contenido, user_id } = req.body;
        
        const response = await fetch(groqConfig.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqConfig.apiKey}`
            },
            body: JSON.stringify({
                model: groqConfig.model,
                messages: [
                    { role: "system", content: "Devuelve un JSON con: sentimiento, prioridad, categoria, resumen, respuesta_cliente." },
                    { role: "user", content: contenido }
                ],
                response_format: { type: "json_object" }
            })
        });

        const dataIA = await response.json();
        const resultadoIA = JSON.parse(dataIA.choices[0].message.content);

        await Analisis.crear({
            contenido,
            resultado_ia: resultadoIA,
            user_id
        });

        res.json({ datos: resultadoIA });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.obtenerHistorial = async (req, res) => {
    try {
        const { user_id } = req.query;
        const { data, error } = await Analisis.obtenerTodos(user_id);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};