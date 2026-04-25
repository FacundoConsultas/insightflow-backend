import { supabase } from "../config/supabase.js";

export const getDecisionPanel = async (req, res) => {
    const { usuario_id } = req.query; // O sacarlo del token de auth

    try {
        // 1. Obtener la Crisis más crítica y reciente
        const { data: crisis } = await supabase
            .from("patrones_crisis")
            .select("*")
            .eq("usuario_id", usuario_id)
            .eq("estado", "abierto")
            .order("nivel_critico", { ascending: false })
            .limit(1)
            .maybeSingle();

        // 2. Obtener Top 3 Clientes en Riesgo (Churn)
        const { data: atRiskCustomers } = await supabase
            .from("analisis")
            .select("id, cliente_id, texto_original, resumen, categoria, prioridad, created_at")
            .eq("usuario_id", usuario_id)
            .eq("riesgo_churn", true)
            .order("created_at", { ascending: false })
            .limit(3);

        // 3. Consolidar la Acción Sugerida
        // Si hay crisis, la acción viene de la crisis. Si no, del cliente con más prioridad.
        let suggestedAction = {
            tipo: "MANTENIMIENTO",
            mensaje: "Sistemas estables. Monitoreo preventivo activo.",
            botonLabel: "Ver Reportes"
        };

        if (crisis) {
            suggestedAction = {
                tipo: "CRISIS",
                mensaje: crisis.insight,
                botonLabel: "Gestionar Incidente"
            };
        } else if (atRiskCustomers && atRiskCustomers.length > 0) {
            suggestedAction = {
                tipo: "CHURN",
                mensaje: `Retener a cliente ${atRiskCustomers[0].cliente_id}: ${atRiskCustomers[0].resumen}`,
                botonLabel: "Enviar Cupón de Retención"
            };
        }

        // Respuesta consolidada "masticada"
        res.json({
            success: true,
            data: {
                crisis: crisis || null,
                atRiskCustomers: atRiskCustomers || [],
                suggestedAction
            }
        });

    } catch (error) {
        console.error("❌ Error en Decision Panel:", error);
        res.status(500).json({ error: "Error al consolidar panel de decisiones" });
    }
};