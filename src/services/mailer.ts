import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

export function getMailer() {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        throw new Error("SMTP env is missing (SMTP_HOST/SMTP_USER/SMTP_PASS)");
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

export async function sendNotificationEmail(params: {
    to: string;
    subject: string;
    title: string;
    description?: string | null;
    actionUrl?: string | null;
}) {
    const transporter = getMailer();

    const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5">
      <h2>${escapeHtml(params.title)}</h2>
      ${params.description ? `<p>${escapeHtml(params.description)}</p>` : ""}
      ${params.actionUrl
            ? `<p><a href="${params.actionUrl}">Open</a></p>`
            : ""
        }
    </div>
  `;

    await transporter.sendMail({
        from: SMTP_FROM,
        to: params.to,
        subject: params.subject,
        html,
    });
}

function escapeHtml(s: string) {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}