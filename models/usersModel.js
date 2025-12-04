// In-memory users store (demo only). Replace with a real DB later.
// Primary admin seed
const users = [
  {
    id: 1,
    name: "Primary Admin",
    email: "surewin888@gmail.com",
    password: "88surewin88$",
    role: "admin",
  },
];

let nextUserId = users.length + 1;

function listUsers() {
  return users;
}

function findByEmail(email) {
  return users.find((u) => u.email === email);
}

function findById(id) {
  return users.find((u) => u.id === id);
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
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return false;
  users.splice(index, 1);
  return true;
}

module.exports = {
  listUsers,
  findByEmail,
  findById,
  createUser,
  updateUser,
  deleteUser,
};
