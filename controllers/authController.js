const { findByEmail, createUser, findById } = require("../models/usersModel");

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
