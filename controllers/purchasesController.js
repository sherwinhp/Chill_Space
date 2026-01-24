const {
  getTransactionById,
  listTransactionsWithItems,
} = require("../models/transactionsModel");

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

  return res.render("invoice", { invoice });
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
