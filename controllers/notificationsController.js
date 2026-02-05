const { listNotifications, markNotificationsRead } = require("../models/notificationsModel");

function requireUser(req, res) {
  if (req.session && req.session.userId) return req.session.userId;
  res.redirect("/login?redirect=/notifications&reason=checkout");
  return null;
}

async function renderNotifications(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const notifications = await listNotifications(userId, 50);
    res.render("notifications", { notifications });
  } catch (error) {
    res.status(500).send(error.message || "Unable to load notifications.");
  }
}

async function markAllRead(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await markNotificationsRead(userId);
    res.redirect("/notifications");
  } catch (error) {
    res.status(500).send(error.message || "Unable to mark notifications as read.");
  }
}

module.exports = {
  renderNotifications,
  markAllRead,
};
