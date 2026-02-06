/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const { findById, updateUser, verifyPassword } = require("../models/usersModel");
const { getTransactionById, listTransactionsWithItems } = require("../models/transactionsModel");
const { calculateCashbackCents, getCashbackRateForUser } = require("../models/walletModel");
const { listNotifications, markNotificationsRead } = require("../models/notificationsModel");
const { findRefundByTransactionId } = require("../models/refundRequestsModel");

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
    address,
    contact_number,
    current_avatar_url,
    birth_date,
  } = req.body;
  const avatarUrl = req.file ? `/uploads/${req.file.filename}` : current_avatar_url || "";
  const birthDateRaw = birth_date ? String(birth_date).trim() : "";
  const normalizedBirthDate =
    birthDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw) ? birthDateRaw : null;
  const updates = {
    name: name ? String(name).trim() : "",
    email: email ? String(email).trim() : "",
    address: address ? String(address).trim() : "",
    contact_number: contact_number ? String(contact_number).trim() : "",
    avatar_url: avatarUrl,
    birth_date: normalizedBirthDate,
  };
  const updated = await updateUser(userId, updates);
  if (!updated) {
    return res.status(404).render("profile", { user: null, message: "User not found." });
  }

  req.session.name = updated.name;
  req.session.email = updated.email;

  res.render("profile", { user: updated, message: "Profile updated." });
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

async function renderChangePassword(req, res) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.redirect("/login?redirect=/profile/password&reason=profile");
  }
  return res.render("change-password", { message: "", messageType: "" });
}

async function updatePassword(req, res) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.redirect("/login?redirect=/profile/password&reason=profile");
  }

  const { current_password, new_password, confirm_password } = req.body || {};
  if (!current_password || !new_password || !confirm_password) {
    return res.status(400).render("change-password", {
      message: "All password fields are required.",
      messageType: "error",
    });
  }

  if (new_password !== confirm_password) {
    return res.status(400).render("change-password", {
      message: "New passwords do not match.",
      messageType: "error",
    });
  }

  if (current_password === new_password) {
    return res.status(400).render("change-password", {
      message: "New password must be different from the current password.",
      messageType: "error",
    });
  }

  const passwordCheck = validatePassword(new_password);
  if (!passwordCheck.ok) {
    return res.status(400).render("change-password", {
      message: passwordCheck.message,
      messageType: "error",
    });
  }

  const user = await findById(userId);
  if (!user) {
    return res.status(404).render("change-password", {
      message: "User not found.",
      messageType: "error",
    });
  }

  if (!verifyPassword(current_password, user.password)) {
    return res.status(400).render("change-password", {
      message: "Current password is incorrect.",
      messageType: "error",
    });
  }

  await updateUser(userId, { password: new_password });

  return res.render("change-password", {
    message: "Password updated successfully.",
    messageType: "success",
  });
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
  const [rate, transactionRefund] = await Promise.all([
    getCashbackRateForUser(req.session.userId),
    findRefundByTransactionId(invoiceId),
  ]);
  const invoiceCashbackCents = calculateCashbackCents(
    Math.round(Number(invoice.total_amount || 0) * 100),
    rate
  );

  return res.render("invoice", { invoice, invoiceCashbackCents, transactionRefund });
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
  renderChangePassword,
  updatePassword,
  renderInvoice,
  renderPaymentProcessing,
  renderPaymentSuccess,
  renderPurchases,
  renderNotifications,
  markAllRead,
};
