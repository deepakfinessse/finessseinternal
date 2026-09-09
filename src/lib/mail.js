import nodemailer from "nodemailer";

let transporter;
let configWarned = false;

function getTransporter() {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true" || Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Sends an email. When SMTP isn't configured it no-ops gracefully and returns
 * `{ delivered: false }` with the rendered body, so flows that send mail (e.g.
 * invitations) still complete in local dev.
 */
export async function sendMail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || "Finessse <no-reply@finessse.digital>";
  const tx = getTransporter();

  if (!tx) {
    if (!configWarned) {
      console.warn(
        "[mail] SMTP not configured (SMTP_HOST/SMTP_PORT) — emails are logged, not sent.",
      );
      configWarned = true;
    }
    console.info(`[mail] would send to ${to}: ${subject}\n${text || ""}`);
    return { delivered: false, to, subject, text, html };
  }

  const info = await tx.sendMail({ from, to, subject, text, html });
  return { delivered: true, messageId: info.messageId, to, subject };
}
