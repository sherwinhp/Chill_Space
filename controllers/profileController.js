const { findById, updateUser } = require("../models/usersModel");

async function renderProfile(req, res) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.render("profile", { user: null, message: "" });
  }

  const user = await findById(userId);
  res.render("profile", { user, message: "" });
}

async function updateProfile(req, res) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.status(401).render("profile", { user: null, message: "Login required." });
  }

  const { name, email, password, address, contact_number, current_avatar_url } = req.body;
  const avatarUrl = req.file ? `/uploads/${req.file.filename}` : current_avatar_url || "";
  const updates = {
    name: name ? String(name).trim() : "",
    email: email ? String(email).trim() : "",
    address: address ? String(address).trim() : "",
    contact_number: contact_number ? String(contact_number).trim() : "",
    avatar_url: avatarUrl,
  };
  if (password) updates.password = password;

  const updated = await updateUser(userId, updates);
  if (!updated) {
    return res.status(404).render("profile", { user: null, message: "User not found." });
  }

  req.session.name = updated.name;
  req.session.email = updated.email;

  res.render("profile", { user: updated, message: "Profile updated." });
}

module.exports = {
  renderProfile,
  updateProfile,
};
