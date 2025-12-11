const {
  listUsers,
  findById,
  updateUser,
  deleteUser,
} = require("../models/usersModel");

async function getUsers(req, res) {
  const users = await listUsers();
  res.json(users.map(stripPassword));
}

async function getUser(req, res) {
  const user = await findById(Number(req.params.id));
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(stripPassword(user));
}

async function editUser(req, res) {
  const updated = await updateUser(Number(req.params.id), req.body);
  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(stripPassword(updated));
}

async function removeUser(req, res) {
  const success = await deleteUser(Number(req.params.id));
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

async function renderUsersPage(req, res) {
  const users = (await listUsers()).map(stripPassword);
  res.render("users", { users });
}
