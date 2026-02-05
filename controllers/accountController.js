const { findById, updateUser } = require("../models/usersModel");
const { getTransactionById, listTransactionsWithItems } = require("../models/transactionsModel");
const { calculateCashbackCents, getCashbackRateForUser } = require("../models/walletModel");
const { listNotifications, markNotificationsRead } = require("../models/notificationsModel");

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

  const {
    name,
    email,
    password,
    address,
    contact_number,
    current_avatar_url,
    birth_date,
  } = req.body;
  const avatarUrl = req.file ? `/uploads/${req.file.filename}` : current_avatar_url || "";
  const normalizedBirthDate = birth_date
    ? new Date(String(birth_date).trim())
    : null;
  const updates = {
    name: name ? String(name).trim() : "",
    email: email ? String(email).trim() : "",
    address: address ? String(address).trim() : "",
    contact_number: contact_number ? String(contact_number).trim() : "",
    avatar_url: avatarUrl,
    birth_date:
      normalizedBirthDate && !Number.isNaN(normalizedBirthDate.getTime())
        ? normalizedBirthDate.toISOString().slice(0, 10)
        : null,
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

async function renderInvoice(req, res) {
  if (!req.session || !req.session.userId) {
    return res.redirect(`/login?redirect=/invoice/${req.params.id}&reason=checkout`);
  }

  const invoiceId = Number(req.params.id);
  if (!invoiceId) {
    return res.status(400).send("Invalid invoice.");
  }

  const invoice = await getTransactionById(invoiceId, req.session.userId);
  if (!invoice) {
    return res.status(404).send("Invoice not found.");
  }
  const rate = await getCashbackRateForUser(req.session.userId);
  const invoiceCashbackCents = calculateCashbackCents(
    Math.round(Number(invoice.total_amount || 0) * 100),
    rate
  );

  return res.render("invoice", { invoice, invoiceCashbackCents });
}

async function renderPaymentProcessing(req, res) {
  if (!req.session || !req.session.userId) {
    return res.redirect(
      `/login?redirect=/payment-processing/${req.params.id}&reason=checkout`
    );
  }

  const invoiceId = Number(req.params.id);
  if (!invoiceId) {
    return res.status(400).send("Invalid invoice.");
  }

  const invoice = await getTransactionById(invoiceId, req.session.userId);
  if (!invoice) {
    return res.status(404).send("Invoice not found.");
  }

  return res.render("payment-processing", { invoice });
}

async function renderPaymentSuccess(req, res) {
  if (!req.session || !req.session.userId) {
    return res.redirect(`/login?redirect=/payment-success/${req.params.id}&reason=checkout`);
  }

  const invoiceId = Number(req.params.id);
  if (!invoiceId) {
    return res.status(400).send("Invalid invoice.");
  }

  const invoice = await getTransactionById(invoiceId, req.session.userId);
  if (!invoice) {
    return res.status(404).send("Invoice not found.");
  }
  const rate = await getCashbackRateForUser(req.session.userId);
  const invoiceCashbackCents = calculateCashbackCents(
    Math.round(Number(invoice.total_amount || 0) * 100),
    rate
  );

  return res.render("payment-success", { invoice, invoiceCashbackCents });
}

async function renderPurchases(req, res) {
  if (!req.session || !req.session.userId) {
    return res.redirect("/login?redirect=/purchases&reason=checkout");
  }

  const { transactions, itemsByTransaction } = await listTransactionsWithItems(
    req.session.userId
  );
  return res.render("purchases", { transactions, itemsByTransaction });
}

function requireNotificationsUser(req, res) {
  if (req.session && req.session.userId) return req.session.userId;
  res.redirect("/login?redirect=/notifications&reason=checkout");
  return null;
}

async function renderNotifications(req, res) {
  const userId = requireNotificationsUser(req, res);
  if (!userId) return;
  try {
    const notifications = await listNotifications(userId, 50);
    res.render("notifications", { notifications });
  } catch (error) {
    res.status(500).send(error.message || "Unable to load notifications.");
  }
}

async function markAllRead(req, res) {
  const userId = requireNotificationsUser(req, res);
  if (!userId) return;
  try {
    await markNotificationsRead(userId);
    res.redirect("/notifications");
  } catch (error) {
    res.status(500).send(error.message || "Unable to mark notifications as read.");
  }
}

module.exports = {
  renderProfile,
  updateProfile,
  renderInvoice,
  renderPaymentProcessing,
  renderPaymentSuccess,
  renderPurchases,
  renderNotifications,
  markAllRead,
};
