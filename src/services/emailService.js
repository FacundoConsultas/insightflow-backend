import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const enviarAlertaEmail = async (usuario_id, categoria, detalle) => {
  console.log(`🚀 Intentando enviar mail real a ${process.env.EMAIL_USER}...`);
  
  const mailOptions = {
    from: '"InsightFlow AI" <mazuquinconsultas@gmail.com>',
    to: process.env.EMAIL_USER, 
    subject: `🚨 CRISIS DETECTADA: ${categoria.toUpperCase()}`,
    html: `
      <div style="font-family: sans-serif; border: 1px solid #fee2e2; padding: 20px; border-radius: 12px;">
        <h2 style="color: #e11d48;">Alerta de Sistema</h2>
        <p>Se ha detectado una crisis de <strong>${categoria}</strong>.</p>
        <p style="background: #fef2f2; padding: 15px; border-left: 4px solid #e11d48;">${detalle}</p>
        <p>Revisa el dashboard de inmediato.</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Mail enviado con éxito: ", info.messageId);
  } catch (error) {
    console.error("❌ ERROR REAL EN NODEMAILER:", error);
  }
};