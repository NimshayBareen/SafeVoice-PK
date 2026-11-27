'use strict';
// E-mail sending (verification codes). Messages are deliberately neutral (NFR-2.3): no mention of the
// project name, crimes or cases. If SMTP is not configured, the message is printed in the server console instead.
const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;
function configured() { return !!(config.smtp.host && config.smtp.user && config.smtp.pass); }

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

// Returns true if a real e-mail was sent, false if it was only logged.
async function sendMail(to, subject, text) {
  if (!configured()) {
    console.log(`[MAIL not configured] To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return false;
  }
  await getTransport().sendMail({ from: config.smtp.from || config.smtp.user, to, subject, text });
  return true;
}

function sendOtp(to, code) {
  return sendMail(to, 'Your account code',
    `Your verification code is ${code}.\nIt expires in ${config.otpMinutes} minutes.\n\nIf you did not ask for this code, you can ignore this message.`);
}

module.exports = { sendMail, sendOtp, configured };
