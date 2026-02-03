const crypto = require("crypto");
const { findByEmail, createUser, findById, updateUser } = require("../models/usersModel");
const {
  createPasswordReset,
  findValidPasswordResetByToken,
  markPasswordResetUsed,
  markAllPasswordResetsUsedForUser,
} = require("../models/passwordResetModel");

const mock2faChallenges = {};
const MOCK_2FA_CODE = "123456";
const MOCK_2FA_EXPIRY_MS = 5 * 60 * 1000;
const MOCK_PASSWORD_RESET_MODE = true;

async function register(req, res) {
  const { name, email, password, confirm_password, address, contact_number } = req.body;
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
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: "Account is deactivated." });
  }
  if (user.role === "user") {
    const challengeId = crypto.randomBytes(16).toString("hex");
    mock2faChallenges[challengeId] = {
      userId: user.id,
      expiresAt: Date.now() + MOCK_2FA_EXPIRY_MS,
    };
    return res.json({
      requires2fa: true,
      challengeId,
      message: "Mock 2FA enabled. Use code 123456 to continue.",
    });
  }
  if (req.setSession) {
    req.setSession(user);
  }
  res.json({ user: sanitize(user) });
}

async function verifyTwoFactor(req, res) {
  const { challengeId, code } = req.body;
  const challenge = mock2faChallenges[challengeId];
  if (!challenge) {
    return res.status(400).json({ error: "2FA challenge not found. Please log in again." });
  }
  if (challenge.expiresAt < Date.now()) {
    delete mock2faChallenges[challengeId];
    return res.status(400).json({ error: "2FA challenge expired. Please log in again." });
  }
  if (String(code || "").trim() !== MOCK_2FA_CODE) {
    return res.status(401).json({ error: "Invalid verification code." });
  }

  const user = await findById(challenge.userId);
  delete mock2faChallenges[challengeId];
  if (!user || !user.is_active) {
    return res.status(401).json({ error: "Unable to complete login." });
  }
  if (req.setSession) {
    req.setSession(user);
  }
  res.json({ user: sanitize(user) });
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
      message: "Demo mode: if account exists, reset link will be shown here.",
    });
  }

  const token = await createPasswordReset(user.id);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  if (MOCK_PASSWORD_RESET_MODE) {
    console.log(`[MOCK Password Reset] ${user.email}: ${resetLink}`);
  }

  return res.json({
    ok: true,
    message: MOCK_PASSWORD_RESET_MODE
      ? "Mock reset link generated (no email sent)."
      : "Reset link generated.",
    resetLink: MOCK_PASSWORD_RESET_MODE ? resetLink : undefined,
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
