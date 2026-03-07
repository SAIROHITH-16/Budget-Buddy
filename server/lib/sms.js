"use strict";

// ---------------------------------------------------------------------------
// Twilio SMS helper
// Configure via environment variables:
//   TWILIO_ACCOUNT_SID  — from https://console.twilio.com (starts with "AC")
//   TWILIO_AUTH_TOKEN   — from https://console.twilio.com
//   TWILIO_PHONE_NUMBER — your Twilio phone number (E.164 format, e.g. +15551234567)
// ---------------------------------------------------------------------------

const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// Lazily initialise the client so missing env vars only throw at send time
let _client = null;
function getClient() {
  if (!_client) {
    if (!accountSid || !authToken) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env");
    }
    _client = twilio(accountSid, authToken);
  }
  return _client;
}

/**
 * Send a 6-digit OTP via SMS.
 * @param {string} to  - Recipient phone number in E.164 format (e.g. +911234567890)
 * @param {string} otp - 6-digit code
 */
async function sendOtpSms(to, otp) {
  await getClient().messages.create({
    from: fromNumber,
    to,
    body: `Your Budget Buddy verification code is: ${otp}. It expires in 10 minutes. Do not share this code with anyone.`,
  });
}

module.exports = { sendOtpSms };
