"use strict";

// ---------------------------------------------------------------------------
// Nodemailer transporter
// Configure via environment variables:
//   MAIL_USER  — Gmail address used to send OTPs   (e.g. yourapp@gmail.com)
//   MAIL_PASS  — Gmail App Password (NOT your account password)
//               Generate one at: https://myaccount.google.com/apppasswords
//               (Requires 2FA to be enabled on the Gmail account)
// ---------------------------------------------------------------------------

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Send an account activation link to the given email address.
 * @param {string} to             - Recipient email
 * @param {string} name           - Recipient display name
 * @param {string} activationUrl  - Full URL the user must click to activate
 */
async function sendActivationEmail(to, name, activationUrl) {
  await transporter.sendMail({
    from: `"Budget Buddy" <${process.env.MAIL_USER}>`,
    to,
    subject: "Budget Buddy: Activate your account",
    html: `
      <div style="font-family:'Nunito Sans',Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;background:#f5f3ff;border:1px solid #ddd6fe">
        <h2 style="margin:0 0 8px;color:#4c1d95">Activate your account</h2>
        <p style="color:#374151;margin:0 0 8px">Hi ${name || "there"},</p>
        <p style="color:#374151;margin:0 0 24px">Thanks for signing up at <strong>Budget Buddy</strong>! Please click the link below to activate your account. The link expires in <strong>24 hours</strong>.</p>
        <a href="${activationUrl}"
           style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">
          Activate account
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:28px">
          If the button doesn't work, copy and paste this link into your browser:<br/>
          <a href="${activationUrl}" style="color:#2563eb;word-break:break-all">${activationUrl}</a>
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">
          If you did not sign up, please <strong>DO NOT</strong> click the link and instead ignore and delete this email.
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:8px">Best regards,<br/>Budget Buddy</p>
      </div>
    `,
  });
}

module.exports = { sendActivationEmail };
