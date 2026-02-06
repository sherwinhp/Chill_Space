const { findBookingDbById } = require("../models/bookingsModel");
const { getTransactionById } = require("../models/transactionsModel");
const {
  findRefundByBookingId,
  findRefundByTransactionId,
  createRefundRequest,
} = require("../models/refundRequestsModel");

async function renderRefundForm(req, res) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect("/login?redirect=/bookings&reason=refund");
    }

    const bookingId = Number(req.params.id);
    if (!Number.isFinite(bookingId)) {
      return res.status(400).send("Invalid booking selected.");
    }

    const booking = await findBookingDbById(bookingId);
    if (!booking || booking.userId !== req.session.userId) {
      return res.status(404).send("Booking not found.");
    }

    const existingRefund = await findRefundByBookingId(bookingId);

    res.render("refundRequest", {
      booking,
      refund: existingRefund,
    });
  } catch (error) {
    console.error("Refund form error:", error.message);
    res.status(500).send("Unable to load refund form.");
  }
}

async function submitRefundRequest(req, res) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect("/login?redirect=/bookings&reason=refund");
    }

    const bookingId = Number(req.params.id);
    if (!Number.isFinite(bookingId)) {
      return res.status(400).send("Invalid booking selected.");
    }

    const booking = await findBookingDbById(bookingId);
    if (!booking || booking.userId !== req.session.userId) {
      return res.status(404).send("Booking not found.");
    }

    if (booking.paymentStatus !== "paid") {
      return res.status(400).send("Refunds are only available for paid bookings.");
    }

    const existingRefund = await findRefundByBookingId(bookingId);
    if (existingRefund) {
      return res.redirect(`/bookings/${bookingId}/refund`);
    }

    const reasonCode = String(req.body.reason || "other").trim().toLowerCase();
    const userMessage = String(req.body.message || "").trim();
    const requestedAmountRaw = String(req.body.requested_amount || "").trim();
    const total = Number(booking.totalPrice || 0);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const reasonMap = {
      schedule_change: "Schedule change",
      booking_mistake: "Booking made by mistake",
      room_issue: "Room or facility issue",
      other: "Other",
    };
    const refundPercentMap = {
      schedule_change: 0.2,
      booking_mistake: 0.3,
      room_issue: 0.8,
    };

    const reasonText = reasonMap[reasonCode] || reasonMap.other;
    if (reasonCode === "other" && !userMessage) {
      return res.status(400).send("Please provide details for the refund request.");
    }

    let requestedAmount = total;
    if (Object.prototype.hasOwnProperty.call(refundPercentMap, reasonCode)) {
      requestedAmount = Number((total * refundPercentMap[reasonCode]).toFixed(2));
    } else if (reasonCode === "other" && requestedAmountRaw) {
      const parsed = Number(requestedAmountRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).send("Enter a valid refund amount.");
      }
      if (parsed > total) {
        return res.status(400).send("Requested amount cannot exceed booking total.");
      }
      requestedAmount = parsed;
    }

    await createRefundRequest({
      bookingId,
      userId: req.session.userId,
      reasonText,
      userMessage,
      requestedAmount,
      imageUrl,
    });

    res.redirect(`/bookings/${bookingId}/refund`);
  } catch (error) {
    console.error("Refund submission error:", error.message);
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.redirect(`/bookings/${req.params.id}/refund`);
    }
    res.status(500).send("Unable to submit refund request.");
  }
}

module.exports = {
  renderRefundForm,
  submitRefundRequest,
  renderTransactionRefundForm,
  submitTransactionRefundRequest,
};

async function renderTransactionRefundForm(req, res) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect(`/login?redirect=/invoice/${req.params.id}/refund&reason=refund`);
    }

    const transactionId = Number(req.params.id);
    if (!Number.isFinite(transactionId)) {
      return res.status(400).send("Invalid order selected.");
    }

    const invoice = await getTransactionById(transactionId, req.session.userId);
    if (!invoice) {
      return res.status(404).send("Order not found.");
    }

    const existingRefund = await findRefundByTransactionId(transactionId);

    return res.render("refundTransaction", {
      invoice,
      refund: existingRefund,
    });
  } catch (error) {
    console.error("Refund transaction form error:", error.message);
    return res.status(500).send("Unable to load refund form.");
  }
}

async function submitTransactionRefundRequest(req, res) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect(`/login?redirect=/invoice/${req.params.id}/refund&reason=refund`);
    }

    const transactionId = Number(req.params.id);
    if (!Number.isFinite(transactionId)) {
      return res.status(400).send("Invalid order selected.");
    }

    const invoice = await getTransactionById(transactionId, req.session.userId);
    if (!invoice) {
      return res.status(404).send("Order not found.");
    }

    if (invoice.status && String(invoice.status).toUpperCase() !== "COMPLETED") {
      return res.status(400).send("Refunds are only available for completed orders.");
    }

    const existingRefund = await findRefundByTransactionId(transactionId);
    if (existingRefund) {
      return res.redirect(`/invoice/${transactionId}/refund`);
    }

    const reasonCode = String(req.body.reason || "other").trim().toLowerCase();
    const userMessage = String(req.body.message || "").trim();
    const requestedAmountRaw = String(req.body.requested_amount || "").trim();
    const total = Number(invoice.total_amount || 0);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const reasonMap = {
      schedule_change: "Schedule change",
      booking_mistake: "Booking made by mistake",
      room_issue: "Room or facility issue",
      food_issue: "Food issue (quality/temperature)",
      beverage_issue: "Beverage issue",
      theme_issue: "Theme add-on issue",
      wrong_item: "Wrong item delivered",
      delivery_issue: "Late delivery",
      other: "Other",
    };
    const refundPercentMap = {
      schedule_change: 0.2,
      booking_mistake: 0.3,
      room_issue: 0.8,
      food_issue: 0.5,
      beverage_issue: 0.3,
      theme_issue: 0.4,
      wrong_item: 0.7,
      delivery_issue: 0.2,
    };
    const customReasons = new Set(["other"]);

    const reasonText = reasonMap[reasonCode] || reasonMap.other;
    const requiresCustom = customReasons.has(reasonCode);
    if (requiresCustom && !userMessage) {
      return res.status(400).send("Please provide details for the refund request.");
    }

    let requestedAmount = total;
    if (Object.prototype.hasOwnProperty.call(refundPercentMap, reasonCode)) {
      requestedAmount = Number((total * refundPercentMap[reasonCode]).toFixed(2));
    } else if (requiresCustom) {
      const parsed = Number(requestedAmountRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).send("Enter a valid refund amount.");
      }
      if (parsed > total) {
        return res.status(400).send("Requested amount cannot exceed order total.");
      }
      requestedAmount = parsed;
    }

    await createRefundRequest({
      transactionId,
      userId: req.session.userId,
      reasonText,
      userMessage,
      requestedAmount,
      imageUrl,
    });

    return res.redirect(`/invoice/${transactionId}/refund`);
  } catch (error) {
    console.error("Refund transaction submission error:", error.message);
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.redirect(`/invoice/${req.params.id}/refund`);
    }
    return res.status(500).send("Unable to submit refund request.");
  }
}
