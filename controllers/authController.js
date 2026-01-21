const { findByEmail, createUser, findById } = require("../models/usersModel");

async function register(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.ok) {
    return res.status(400).json({ error: passwordCheck.message });
  }

  try {
    const user = await createUser({ name, email, password, role: "user" });
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

function validatePassword(pw) {
  if (!pw || pw.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters." };
  }
  if (!/[0-9]/.test(pw)) {
    return { ok: false, message: "Password must include a number." };
  }
  if (!/[^\w\s]/.test(pw)) {
    return { ok: false, message: "Password must include a special character." };
  }
  return { ok: true };
}

function logout(req, res) {
  if (req.clearSession) {
    req.clearSession();
  }
  res.json({ ok: true });
}

function sanitize(user) {
  const { password, ...clean } = user;
  if (!clean.role) clean.role = "user";
  return clean;
}

module.exports = {
  register,
  login,
  logout,
  renderLoginPage,
  renderRegisterPage,
  me,
};

function renderLoginPage(req, res) {
  res.render("login");
}

function renderRegisterPage(req, res) {
  res.render("register");
}
