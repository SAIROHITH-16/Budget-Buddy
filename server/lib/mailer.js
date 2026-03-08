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
 * Send a 6-digit OTP to the given email address.
 * @param {string} to    - Recipient email
 * @param {string} otp   - 6-digit code
 */
async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: `"Budget Buddy" <${process.env.MAIL_USER}>`,
    to,
    subject: "Your Budget Buddy verification code",
    html: `
      <div style="font-family:'Nunito Sans',Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;background:#f5f3ff;border:1px solid #ddd6fe">
        <h2 style="margin:0 0 8px;color:#4c1d95">Verify your email</h2>
        <p style="color:#374151;margin:0 0 24px">Use the code below to complete your Budget Buddy sign-up. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:12px;color:#2563eb;background:#fff;border:2px dashed #93c5fd;border-radius:8px;padding:16px;text-align:center">${otp}</div>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

/**
 * Send an account activation link email.
 * @param {string} to          - Recipient email
 * @param {string} name        - Recipient display name
 * @param {string} activationUrl - Full URL the user should click
 */
async function sendActivationEmail(to, name, activationUrl) {
  await transporter.sendMail({
    from: `"Budget Buddy" <${process.env.MAIL_USER}>`,
    to,
    subject: "Activate your Budget Buddy account",
    html: `
      <div style="font-family:'Nunito Sans',Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border-radius:12px;background:#f5f3ff;border:1px solid #ddd6fe">
        <h2 style="margin:0 0 8px;color:#4c1d95">Activate your account</h2>
        <p style="color:#374151;margin:0 0 24px">Hi ${name}, click the button below to verify your email address. The link expires in <strong>24 hours</strong>.</p>
        <a href="${activationUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px">Activate account</a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px">If you didn't create a Budget Buddy account, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail, sendActivationEmail };
