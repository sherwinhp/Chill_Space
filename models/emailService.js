require("dotenv").config();
let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 0);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

function isEmailConfigured() {
  return Boolean(EMAIL_HOST && EMAIL_PORT && EMAIL_USER && EMAIL_PASS && nodemailer);
}

function getFromAddress() {
  return EMAIL_FROM || EMAIL_USER || "";
}

let cachedTransporter = null;

function getTransporter() {
  if (!cachedTransporter) {
    if (!isEmailConfigured()) {
      return null;
    }
    cachedTransporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_PORT === 465,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });
  }
  return cachedTransporter;
}

async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("Email is not configured.");
  }
  if (!to) {
    throw new Error("Missing recipient email.");
  }
  return transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendEmail,
  isEmailConfigured,
  getFromAddress,
};
