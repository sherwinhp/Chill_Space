const {
  listUsers,
  findById,
  updateUser,
  deleteUser,
} = require("../models/usersModel");

function getUsers(req, res) {
  const users = listUsers().map(stripPassword);
  res.json(users);
}

function getUser(req, res) {
  const user = findById(Number(req.params.id));
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(stripPassword(user));
}

function editUser(req, res) {
  const updated = updateUser(Number(req.params.id), req.body);
  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(stripPassword(updated));
}

function removeUser(req, res) {
  const success = deleteUser(Number(req.params.id));
  if (!success) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ ok: true });
}

function stripPassword(user) {
  const { password, ...clean } = user;
  return clean;
}

module.exports = {
  getUsers,
  getUser,
  editUser,
  removeUser,
  renderUsersPage,
};

function renderUsersPage(req, res) {
  const users = listUsers().map(stripPassword);
  res.render("users", { users });
}
