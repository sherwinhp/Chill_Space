const {
  getTransactionById,
  listTransactionsWithItems,
} = require("../models/transactionsModel");
const { calculateCashbackCents } = require("../models/walletModel");

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
  const invoiceCashbackCents = calculateCashbackCents(
    Math.round(Number(invoice.total_amount || 0) * 100)
  );

  return res.render("invoice", { invoice, invoiceCashbackCents });
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

module.exports = { renderInvoice, renderPurchases };
