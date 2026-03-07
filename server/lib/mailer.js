// server/lib/mailer.js
// Nodemailer transporter — configured via environment variables.
//
// Required env vars (set in Render dashboard):
//   SMTP_HOST   e.g. smtp.gmail.com
//   SMTP_PORT   e.g. 587
//   SMTP_USER   your SMTP username / Gmail address
//   SMTP_PASS   your SMTP password / Gmail App Password
//   SMTP_FROM   (optional) display address, defaults to SMTP_USER

"use strict";

const nodemailer = require("nodemailer");

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null; // not configured
  }
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

/**
 * Send an email.
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 * @throws if SMTP is not configured or sending fails
 */
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  await t.sendMail({
    from:    process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: html || text,
  });
}

module.exports = { sendMail };
