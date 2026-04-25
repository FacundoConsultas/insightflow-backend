import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const enviarAlertaEmail = async (usuario_id, categoria, detalle) => {
  // En producción, aquí podrías buscar el email real del usuario en la tabla 'usuarios'
  // Por ahora, usamos el EMAIL_USER definido en las variables de entorno como destino.
  const destino = process.env.EMAIL_USER;

  console.log(`🚀 Enviando mail de crisis a: ${destino}`);
  
  const mailOptions = {
    from: `"InsightFlow AI" <${process.env.EMAIL_USER}>`,
    to: destino, 
    subject: `🚨 ALERTA CRÍTICA: ${categoria.toUpperCase()}`,
    html: `
      <div style="font-family: sans-serif; border: 2px solid #e11d48; padding: 25px; border-radius: 20px; max-width: 600px;">
        <h2 style="color: #e11d48; margin-top: 0;">Detección de Incidente</h2>
        <p style="font-size: 16px;">InsightFlow IA ha detectado un patrón de riesgo:</p>
        <div style="background: #fff1f2; padding: 20px; border-radius: 15px; border-left: 5px solid #e11d48;">
          <strong style="display: block; margin-bottom: 10px; color: #9f1239;">Detalle del Análisis:</strong>
          <span style="font-size: 15px; color: #4c0519;">${detalle}</span>
        </div>
        <p style="margin-top: 20px; font-size: 14px; color: #64748b;">Accede a tu panel para gestionar la respuesta.</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email enviado ID:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Error en Nodemailer:", error);
    return false;
  }
};