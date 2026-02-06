/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const {
  listUsers,
  findById,
  getMainAdmin,
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
  const targetId = Number(req.params.id);
  const targetUser = await findById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }
  const mainAdmin = await getMainAdmin();
  if (mainAdmin && targetUser.id === mainAdmin.id && req.session.userId !== mainAdmin.id) {
    return res.status(403).json({ error: "Main admin cannot be edited by other admins" });
  }
  const updated = await updateUser(targetId, req.body);
  res.json(stripPassword(updated));
}

async function removeUser(req, res) {
  const targetId = Number(req.params.id);
  const targetUser = await findById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }
  const mainAdmin = await getMainAdmin();
  if (mainAdmin && targetUser.id === mainAdmin.id && req.session.userId !== mainAdmin.id) {
    return res.status(403).json({ error: "Main admin cannot be deleted by other admins" });
  }
  const success = await deleteUser(targetId);
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
