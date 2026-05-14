import { logger } from '../utils/logger';

// ── Email service (uses SMTP via Nodemailer if configured, else logs) ─
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars to activate
// Free options: Gmail, Resend, Brevo (Sendinblue), Mailgun

let transporter: unknown = null;

import nodemailerLib from 'nodemailer';

async function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailerLib.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

async function send(opts: MailOptions): Promise<boolean> {
  const t = await getTransporter();
  if (!t) {
    // Fallback: log the email so admin can copy credentials manually
    logger.info(`📧 EMAIL (não enviado — configure SMTP):\nPara: ${opts.to}\nAssunto: ${opts.subject}`);
    return false;
  }
  try {
    await (t as { sendMail: (o: unknown) => Promise<unknown> }).sendMail({
      from: `"${process.env.SITE_NAME || 'Util Ferramentas'}" <${process.env.SMTP_USER}>`,
      ...opts,
    });
    logger.info(`📧 Email enviado para ${opts.to}`);
    return true;
  } catch (err) {
    logger.error(`📧 Falha ao enviar email para ${opts.to}: ${(err as Error).message}`);
    return false;
  }
}

// ── Email templates ────────────────────────────────────────────
export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  password: string;
  plan: string;
  loginUrl: string;
}): Promise<boolean> {
  const planLabel = opts.plan === 'pro' ? '⭐ Pro' : '🆓 Gratuito';
  return send({
    to: opts.to,
    subject: `Bem-vindo ao ${process.env.SITE_NAME || 'Util Ferramentas'}! Suas credenciais de acesso`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f4f4f8;margin:0;padding:2rem 1rem">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6c63ff,#00d4aa);padding:2rem;text-align:center">
      <div style="font-size:2rem;margin-bottom:.5rem">🎉</div>
      <h1 style="color:#fff;margin:0;font-size:1.3rem">Conta aprovada!</h1>
      <p style="color:rgba(255,255,255,.85);margin:.5rem 0 0;font-size:.9rem">${process.env.SITE_NAME || 'Util Ferramentas'}</p>
    </div>

    <!-- Body -->
    <div style="padding:2rem">
      <p style="color:#374151;font-size:1rem;margin:0 0 1.25rem">Olá, <strong>${opts.name}</strong>!</p>
      <p style="color:#6b7280;line-height:1.7;margin:0 0 1.5rem">
        Seu pagamento foi confirmado e sua conta foi criada com sucesso. Abaixo estão suas credenciais de acesso:
      </p>

      <!-- Credentials box -->
      <div style="background:#f8f7ff;border:1px solid #e0dcff;border-radius:10px;padding:1.25rem;margin-bottom:1.5rem">
        <div style="margin-bottom:.75rem">
          <span style="font-size:.75rem;font-weight:600;color:#8b5cf6;text-transform:uppercase;letter-spacing:.05em">Email</span><br/>
          <span style="font-size:1rem;color:#111">${opts.to}</span>
        </div>
        <div style="margin-bottom:.75rem">
          <span style="font-size:.75rem;font-weight:600;color:#8b5cf6;text-transform:uppercase;letter-spacing:.05em">Senha temporária</span><br/>
          <span style="font-size:1.1rem;font-family:monospace;background:#fff;border:1px solid #ddd;padding:.25rem .5rem;border-radius:5px;color:#111">${opts.password}</span>
        </div>
        <div>
          <span style="font-size:.75rem;font-weight:600;color:#8b5cf6;text-transform:uppercase;letter-spacing:.05em">Plano</span><br/>
          <span style="font-size:1rem;color:#111">${planLabel}</span>
        </div>
      </div>

      <p style="color:#6b7280;font-size:.875rem;margin:0 0 1.5rem">
        ⚠️ <strong style="color:#374151">Altere sua senha</strong> após o primeiro acesso nas Configurações.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:1.5rem 0">
        <a href="${opts.loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#a78bfa);color:#fff;font-weight:600;font-size:1rem;padding:.875rem 2rem;border-radius:10px;text-decoration:none">
          Acessar minha conta →
        </a>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:1rem;margin-top:1.5rem">
        <p style="color:#166534;font-size:.875rem;margin:0">
          <strong>Precisa de ajuda?</strong> Responda este email ou acesse nossa página de suporte.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f9f9fb;padding:1.25rem;text-align:center;border-top:1px solid #eee">
      <p style="color:#9ca3af;font-size:.78rem;margin:0">
        ${process.env.SITE_NAME || 'Util Ferramentas'} — ${process.env.SITE_URL || ''}<br/>
        Você está recebendo este email porque criou uma conta na plataforma.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendPaymentConfirmedEmail(opts: {
  to: string;
  name: string;
  txid: string;
}): Promise<boolean> {
  return send({
    to: opts.to,
    subject: `Pagamento recebido! Aguarde a ativação — ${process.env.SITE_NAME || 'Util Ferramentas'}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f4f4f8;margin:0;padding:2rem 1rem">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#111118;padding:1.5rem;text-align:center">
      <div style="font-size:2rem">✅</div>
      <h1 style="color:#e8e8f0;margin:.5rem 0 0;font-size:1.2rem">Pagamento registrado!</h1>
    </div>
    <div style="padding:1.75rem">
      <p style="color:#374151">Olá, <strong>${opts.name}</strong>!</p>
      <p style="color:#6b7280;line-height:1.7">
        Recebemos a confirmação do seu pagamento PIX. Nossa equipe irá verificar e ativar sua conta em até <strong>24 horas</strong>.
      </p>
      <div style="background:#f8f7ff;border:1px solid #e0dcff;border-radius:10px;padding:1rem;margin:1.25rem 0">
        <p style="font-size:.8rem;color:#8b5cf6;font-weight:600;margin:0 0 .25rem">SEU NÚMERO DE REFERÊNCIA</p>
        <p style="font-size:1.3rem;font-family:monospace;font-weight:700;color:#6c63ff;margin:0">${opts.txid}</p>
      </div>
      <p style="color:#6b7280;font-size:.875rem">
        Você receberá outro email com suas credenciais de acesso assim que a conta for ativada.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}
