import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendMemberInviteEmail(opts: {
  to: string;
  memberName: string;
  orgName?: string | null;
  tempPassword: string;
}) {
  const loginUrl = `${env.FRONTEND_URL}/login`;
  const orgName = opts.orgName ?? "your organization";

  const text = `
Hi ${opts.memberName},

You’ve been invited to join ${orgName} on Accuraai.

Login details:
  Email: ${opts.to}
  Temporary password: ${opts.tempPassword}

Login here: ${loginUrl}

For security:
- Please login as soon as possible.
- After you login, change your password from your profile page.

Thanks!
Accuraai team
`.trim();

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: opts.to,
    subject: `You’ve been invited to ${orgName}`,
    text,
  });
}

export async function sendEmailVerificationEmail(opts: {
  to: string;
  name: string;
  code: string;
}) {
  const text = `
Hi ${opts.name},

Your Accuraai verification code is: ${opts.code}

This code expires in 15 minutes.

If you did not request this email, you can ignore it.

Thanks!
Accuraai team
`.trim();

  const html = `
    <p>Hi ${escapeHtml(opts.name)},</p>
    <p>Your Accuraai verification code is:</p>

    <p style="
      font-size:24px;
      font-weight:700;
      letter-spacing:2px;
      margin:16px 0;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    ">
      ${escapeHtml(opts.code)}
    </p>

    <p style="font-size:12px;color:#6b7280;">
      This code expires in 15 minutes.
    </p>

    <p>Thanks!<br/>Accuraai team</p>
  `.trim();

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: opts.to,
    subject: "Your Accuraai verification code",
    text,
    html,
  });
}


export async function sendContactFormEmail(opts: {
  name: string;
  email: string;
  message: string;
}) {
  const supportTo = env.SUPPORT_INBOX ?? env.MAIL_FROM;

  const text = `
Contact form message

Name: ${opts.name}
Email: ${opts.email}

Message:
${opts.message}
`.trim();

  const html = `
    <h3>Contact form message</h3>

    <p><b>Name:</b> ${escapeHtml(opts.name)}</p>
    <p><b>Email:</b> ${escapeHtml(opts.email)}</p>

    <hr />

    <p style="white-space:pre-wrap">
      ${escapeHtml(opts.message)}
    </p>
  `.trim();

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: supportTo,
    subject: `Contact form: ${opts.name}`,
    text,
    html,
    replyTo: opts.email,
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
