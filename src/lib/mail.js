import nodemailer from "nodemailer";

let transporter;
let configWarned = false;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Wraps a message body in the standard Finessse branded email shell. */
function wrapEmailHtml(bodyHtml) {
  return `<table width="802" border="0" align="center" cellpadding="0" cellspacing="1" bgcolor="#1ba6f7">
  <tbody><tr>
  <td valign="top"><table width="800" border="0" align="center" cellpadding="0" cellspacing="0" bgcolor="#ffffff">
  <tbody><tr>
  <td bgcolor="#fff" colspan="3" style="height:12px"></td>
  </tr>
  <tr>
  <td align="center" valign="middle" colspan="3"><img src="https://www.finessse.digital/logo.png" alt="Finessse"></td>
  </tr>
  <tr>
  <td bgcolor="#fff" colspan="3" style="height:12px"></td>
  </tr>
  <tr>
  <td bgcolor="#1ba6f7" height="1" colspan="3" style="height:1px"></td>
  </tr>
  <tr>
  <td bgcolor="#fff" colspan="3" style="height:12px"></td>
  </tr>
  <tr>
  <td bgcolor="#fff" width="20" style="height:12px"></td>
  <td><table width="100%" border="0" cellspacing="10" cellpadding="0">
  <tbody>
  <tr><td style="font-family:Arial, sans-serif; font-size:14px; color:#222; line-height:1.6;">${bodyHtml}</td></tr>
  </tbody></table>
  </td>
  <td bgcolor="#fff" width="20" style="height:12px"></td>
  </tr>

  <tr><td bgcolor="#fff" width="20" style="height:12px"></td>
  </tr><tr>
  <td bgcolor="#1ba6f7" align="center" height="30" colspan="3"><font face="Arial" color="#fff" size="2"> Copyright ${new Date().getFullYear()} Finessse Interactive. All Rights Reserved.</font></td>
  </tr>
  </tbody></table>
  </td>
  </tr>
 </tbody></table>`;
}

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
 * Sends an email. Every message is wrapped in the standard Finessse branded
 * shell (logo header, copyright footer) — callers just pass the body. When
 * SMTP isn't configured it no-ops gracefully and returns `{ delivered: false
 * }` with the rendered body, so flows that send mail (e.g. invitations) still
 * complete in local dev.
 */
export async function sendMail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || "Finessse <no-reply@finessse.digital>";
  const bodyHtml = html || (text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : "");
  const wrappedHtml = bodyHtml ? wrapEmailHtml(bodyHtml) : undefined;
  const tx = getTransporter();

  if (!tx) {
    if (!configWarned) {
      console.warn(
        "[mail] SMTP not configured (SMTP_HOST/SMTP_PORT) — emails are logged, not sent.",
      );
      configWarned = true;
    }
    console.info(`[mail] would send to ${to}: ${subject}\n${text || ""}`);
    return { delivered: false, to, subject, text, html: wrappedHtml };
  }

  const info = await tx.sendMail({ from, to, subject, text, html: wrappedHtml });
  return { delivered: true, messageId: info.messageId, to, subject };
}
