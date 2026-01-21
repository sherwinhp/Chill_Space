// Lightweight in-memory users store to keep the demo self-contained.
const users = [
  {
    id: 1,
    name: "Main Admin",
    email: "admin@chillspace.com",
    password: "Admin#123",
    role: "admin",
    isMainAdmin: true,
  },
  {
    id: 2,
    name: "Jamie Lee",
    email: "jamie@example.com",
    password: "Chill#123",
    role: "user",
  },
];

let nextUserId = users.length + 1;

function listUsers() {
  return users;
}

function findByEmail(email) {
  return users.find((u) => u.email === email) || null;
}

function findById(id) {
  return users.find((u) => u.id === Number(id)) || null;
}

function getMainAdmin() {
  return users.find((u) => u.role === "admin" && u.isMainAdmin) || null;
}

function createUser({ name, email, password, role = "user" }) {
  if (findByEmail(email)) {
    throw new Error("Email already registered");
  }
  const user = { id: nextUserId++, name, email, password, role };
  users.push(user);
  return user;
}

function updateUser(id, updates) {
  const user = findById(id);
  if (!user) return null;
  Object.assign(user, updates);
  return user;
}

function deleteUser(id) {
  const index = users.findIndex((u) => u.id === Number(id));
  if (index === -1) return false;
  users.splice(index, 1);
  return true;
}

module.exports = {
  listUsers,
  findByEmail,
  findById,
  getMainAdmin,
  createUser,
  updateUser,
  deleteUser,
};
