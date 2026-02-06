/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const crypto = require("crypto");
const {
  findByEmail,
  createUser,
  findById,
  updateUser,
  verifyPassword,
  isPasswordHashed,
} = require("../models/usersModel");
const {
  createPasswordReset,
  findValidPasswordResetByToken,
  markPasswordResetUsed,
  markAllPasswordResetsUsedForUser,
} = require("../models/passwordResetModel");
const { sendEmail } = require("../models/emailService");

const twoFaChallenges = {};
const TWO_FA_EXPIRY_MS = 5 * 60 * 1000;
const TWO_FA_RESEND_COOLDOWN_MS = 60 * 1000;
const SUPER_ADMIN_EMAIL = "admin@admin.com";

function isSuperAdmin(user) {
  if (!user || !user.email) return false;
  return String(user.email).trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOtpEmail({ name, code }) {
  const subject = "Your Chill Space verification code";
  const text = `Hello ${name || "there"},\n\nYour verification code is ${code}. It expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #111;">
      <h2 style="margin-bottom: 8px;">Verification code</h2>
      <p>Hello ${escapeHtml(name || "there")},</p>
      <p>Your verification code is:</p>
      <p style="font-size: 22px; font-weight: 700; letter-spacing: 0.2em;">${escapeHtml(
        code
      )}</p>
      <p>This code expires in 5 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;
  return { subject, text, html };
}

function buildPasswordResetEmail({ name, resetLink }) {
  const subject = "Reset your Chill Space password";
  const text = `Hello ${name || "there"},\n\nUse this link to reset your password:\n${resetLink}\n\nThis link expires in 30 minutes. If you did not request this, please ignore this email.`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #111;">
      <h2 style="margin-bottom: 8px;">Reset your password</h2>
      <p>Hello ${escapeHtml(name || "there")},</p>
      <p>Click the button below to reset your password. This link expires in 30 minutes.</p>
      <p>
        <a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0d0f19;color:#fff;text-decoration:none;">
          Reset password
        </a>
      </p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;
  return { subject, text, html };
}

function normalizeBirthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function register(req, res) {
  const { name, email, password, confirm_password, address, contact_number, birth_date } =
    req.body;
  if (!name || !email || !password || !confirm_password || !address || !contact_number) {
    return res
      .status(400)
      .json({ error: "Name, email, password, address, and contact number are required." });
  }

  if (password !== confirm_password) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return res.status(400).json({ error: passwordCheck.message });
  }

  try {
    const user = await createUser({
      name,
      email,
      password,
      address,
      contact_number,
      role: "user",
      birth_date: normalizeBirthDate(birth_date),
    });
    if (req.setSession) {
      req.setSession(user);
    }
    res.status(201).json({ user: sanitize(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await findByEmail(email);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user && user.password && !isPasswordHashed(user.password)) {
    updateUser(user.id, { password }).catch(() => {});
  }
  if (!user.is_active) {
    return res.status(403).json({ error: "Account is deactivated." });
  }
  if (isSuperAdmin(user)) {
    if (req.setSession) {
      req.setSession(user);
    }
    return res.json({ user: sanitize(user), requires2fa: false });
  }

  const challengeId = crypto.randomBytes(16).toString("hex");
  const code = generateOtp();
  twoFaChallenges[challengeId] = {
    userId: user.id,
    code,
    expiresAt: Date.now() + TWO_FA_EXPIRY_MS,
    lastSentAt: Date.now(),
  };
  try {
    const emailContent = buildOtpEmail({ name: user.name, code });
    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Unable to send verification code. Please try again." });
  }
  return res.json({
    requires2fa: true,
    challengeId,
    message: "A verification code was sent to your email.",
    resendAfterMs: TWO_FA_RESEND_COOLDOWN_MS,
  });
  if (req.setSession) {
    req.setSession(user);
  }
  res.json({ user: sanitize(user) });
}

async function verifyTwoFactor(req, res) {
  const { challengeId, code } = req.body;
  const challenge = twoFaChallenges[challengeId];
  if (!challenge) {
    return res.status(400).json({ error: "2FA challenge not found. Please log in again." });
  }
  if (challenge.expiresAt < Date.now()) {
    delete twoFaChallenges[challengeId];
    return res.status(400).json({ error: "2FA challenge expired. Please log in again." });
  }
  if (String(code || "").trim() !== String(challenge.code)) {
    return res.status(401).json({ error: "Invalid verification code." });
  }

  const user = await findById(challenge.userId);
  delete twoFaChallenges[challengeId];
  if (!user || !user.is_active) {
    return res.status(401).json({ error: "Unable to complete login." });
  }
  if (req.setSession) {
    req.setSession(user);
  }
  res.json({ user: sanitize(user) });
}

async function resendTwoFactor(req, res) {
  const { challengeId } = req.body || {};
  if (!challengeId) {
    return res.status(400).json({ error: "Missing challenge id." });
  }

  const challenge = twoFaChallenges[challengeId];
  if (!challenge) {
    return res.status(400).json({ error: "2FA challenge not found. Please log in again." });
  }

  if (challenge.expiresAt < Date.now()) {
    delete twoFaChallenges[challengeId];
    return res.status(400).json({ error: "2FA challenge expired. Please log in again." });
  }

  const now = Date.now();
  if (challenge.lastSentAt && now - challenge.lastSentAt < TWO_FA_RESEND_COOLDOWN_MS) {
    const retryAfterMs = TWO_FA_RESEND_COOLDOWN_MS - (now - challenge.lastSentAt);
    return res
      .status(429)
      .json({ error: "Please wait before requesting another code.", retryAfterMs });
  }

  const user = await findById(challenge.userId);
  if (!user || !user.is_active) {
    delete twoFaChallenges[challengeId];
    return res.status(401).json({ error: "Unable to resend code. Please log in again." });
  }

  const code = generateOtp();
  challenge.code = code;
  challenge.expiresAt = now + TWO_FA_EXPIRY_MS;
  challenge.lastSentAt = now;

  try {
    const emailContent = buildOtpEmail({ name: user.name, code });
    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Unable to send verification code. Please try again." });
  }

  return res.json({
    ok: true,
    message: "A new verification code was sent to your email.",
    resendAfterMs: TWO_FA_RESEND_COOLDOWN_MS,
  });
}

async function me(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = await findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ user: sanitize(user) });
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  const user = await findByEmail(email);
  if (!user || !user.is_active) {
    return res.json({
      ok: true,
      message: "If an account exists, a reset link has been sent to the email.",
    });
  }

  const token = await createPasswordReset(user.id);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    const emailContent = buildPasswordResetEmail({
      name: user.name,
      resetLink,
    });
    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to send reset email. Please try again." });
  }

  return res.json({
    ok: true,
    message: "If an account exists, a reset link has been sent to the email.",
  });
}

async function resetPassword(req, res) {
  const { token, password, confirm_password } = req.body || {};
  if (!token || !password || !confirm_password) {
    return res.status(400).json({ error: "Token, password, and confirmation are required." });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return res.status(400).json({ error: passwordCheck.message });
  }

  const resetRow = await findValidPasswordResetByToken(token);
  if (!resetRow) {
    return res.status(400).json({ error: "Reset link is invalid or expired." });
  }

  const user = await findById(resetRow.user_id);
  if (!user || !user.is_active) {
    return res.status(400).json({ error: "Unable to reset password." });
  }

  await updateUser(user.id, { password });
  await markPasswordResetUsed(resetRow.id);
  await markAllPasswordResetsUsedForUser(user.id);

  return res.json({ ok: true, message: "Password reset successful. Please login." });
}

function validatePassword(pw) {
  if (!pw || pw.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (!/[A-Z]/.test(pw)) {
    return { ok: false, message: "Password must include at least one uppercase letter." };
  }
  if (!/[^\w\s]/.test(pw)) {
    return { ok: false, message: "Password must include at least one special character." };
  }
  return { ok: true };
}

function logout(req, res) {
  if (req.clearSession) {
    req.clearSession();
  }
  const acceptsJson = req.headers.accept && req.headers.accept.includes("application/json");
  if (acceptsJson) {
    res.json({ ok: true });
    return;
  }
  res.redirect("/");
}

function sanitize(user) {
  const { password, ...clean } = user;
  if (!clean.role) clean.role = "user";
  return clean;
}

module.exports = {
  register,
  login,
  verifyTwoFactor,
  resendTwoFactor,
  forgotPassword,
  resetPassword,
  logout,
  renderLoginPage,
  renderRegisterPage,
  renderForgotPasswordPage,
  renderResetPasswordPage,
  me,
};

function renderLoginPage(req, res) {
  res.render("login");
}

function renderRegisterPage(req, res) {
  res.render("register");
}

function renderForgotPasswordPage(req, res) {
  res.render("forgot-password");
}

async function renderResetPasswordPage(req, res) {
  const token = req.query ? req.query.token : "";
  if (!token) {
    return res.render("reset-password", { token: "", validToken: false });
  }
  const resetRow = await findValidPasswordResetByToken(token);
  return res.render("reset-password", { token, validToken: !!resetRow });
}
