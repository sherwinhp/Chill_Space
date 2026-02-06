const crypto = require("crypto");
const {
  listCartItems,
  removeExpiredRoomBookings,
} = require("../models/cartModel");
const { createOrder, captureOrder } = require("../services/paypalService");
const { createNetsQr, getTxnStatus } = require("../services/netService");
const {
  createTransactionFromCart,
  findTransactionByProviderOrderId,
  listBookingItemsForTransaction,
  getTransactionById,
} = require("../models/transactionsModel");
const { releaseBookingHold } = require("../models/bookingsModel");
const { payWithWallet, issueTransactionCashbackIfEligible } = require("../models/walletModel");
const {
  createPayNowPaymentRequest,
  getPaymentRequestStatus,
} = require("../services/hitpayService");
const { upsertPaymentMethod } = require("../models/paymentMethodsModel");
const { createComplianceFlag } = require("../models/complianceModel");
const {
  createCardPaymentIntent,
  createCardPaymentIntentWithPaymentMethod,
  confirmCardPaymentIntent,
  createGrabPayCheckoutSession,
  retrieveCheckoutSession,
  constructWebhookEvent,
  refundPaymentIntent,
} = require("../services/stripe");
const { sendEmail } = require("../models/emailService");
const { runComplianceChecks } = require("../services/complianceService");
const { getIp } = require("../services/auditService");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function calculateNights(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }
  const diff = endDate - startDate;
  if (diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / 86400000));
}

function formatCurrency(amount, currency = "SGD") {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  return `${currency.toUpperCase()} ${safe.toFixed(2)}`;
}

function resolveHitpayRequestId(req) {
  const direct = req.query.request_id || req.query.id;
  if (direct) return String(direct);
  if (req.session?.hitpay?.requestId) {
    return String(req.session.hitpay.requestId);
  }
  const reference = req.query.reference;
  return reference ? String(reference) : null;
}

function resolveHitpayPaymentId(paymentRequest) {
  if (!paymentRequest || !Array.isArray(paymentRequest.payments)) return null;
  const succeeded = paymentRequest.payments.find(
    (payment) => String(payment.status || "").toLowerCase() === "succeeded"
  );
  const target = succeeded || paymentRequest.payments[0];
  return target?.id || null;
}

function isStripeRiskBlocked(risk) {
  if (!risk) return false;
  const flags = Array.isArray(risk.flags) ? risk.flags : [];
  const blockingFlags = new Set([
    "cvc_mismatch",
    "avs_mismatch",
    "ip_billing_country_mismatch",
    "velocity_limit_exceeded",
    "repeated_failed_attempts",
  ]);
  if (flags.some((flag) => blockingFlags.has(flag))) return true;
  const level = String(risk.outcome?.risk_level || "").toLowerCase();
  if (["highest", "high", "elevated"].includes(level)) return true;
  const score = Number(risk.outcome?.risk_score);
  if (Number.isFinite(score) && score >= 70) return true;
  return false;
}

async function recordStripeRiskFlag({ userId, paymentIntentId, risk, amount, context }) {
  const flags = Array.isArray(risk?.flags) ? risk.flags : [];
  const level = String(risk?.outcome?.risk_level || "unknown").toLowerCase();
  const score = Number(risk?.outcome?.risk_score);
  const details = [
    `intent=${paymentIntentId || "n/a"}`,
    `level=${level || "n/a"}`,
    Number.isFinite(score) ? `score=${score}` : "score=n/a",
    flags.length ? `flags=${flags.join(",")}` : "flags=none",
    Number.isFinite(Number(amount)) ? `amount=${Number(amount).toFixed(2)}` : null,
    context ? `context=${context}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  try {
    await createComplianceFlag({
      userId: userId || null,
      relatedType: "payment",
      relatedId: null,
      severity: "high",
      reason: "Stripe risk blocked",
      details,
    });
  } catch (error) {
    if (error && error.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
  }
}

function calculateCartTotal(items) {
  return (items || []).reduce((sum, item) => {
    const price = Number(item.price);
    const qty = Number(item.qty || 1);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return sum;
    return sum + price * qty;
  }, 0);
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Number(amount.toFixed(2));
}

function amountsMatch(expected, actual, tolerance = 0.01) {
  if (expected === null || actual === null) return false;
  return Math.abs(expected - actual) <= tolerance;
}

async function enforceCompliance(req, totalAmount, context = "checkout") {
  const userId = req.session ? req.session.userId : null;
  const ipAddress = getIp(req);
  const result = await runComplianceChecks({
    userId,
    amount: totalAmount,
    currency: "SGD",
    context,
    relatedType: "payment",
    relatedId: null,
    ipAddress,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.blockReason || "Payment requires compliance review.",
    };
  }
  return { ok: true };
}

function extractEmail(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  if (match) return match[1];
  return text;
}

function getSupportContact() {
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    extractEmail(process.env.EMAIL_FROM) ||
    process.env.EMAIL_USER ||
    "";
  const supportPhone = process.env.SUPPORT_PHONE || "";
  return { supportEmail, supportPhone };
}

function buildBookingConfirmationEmail({ booking }) {
  const propertyName = process.env.PROPERTY_NAME || "Chill Space";
  const { supportEmail, supportPhone } = getSupportContact();
  const checkIn = formatDate(booking.startTime);
  const checkOut = formatDate(booking.endTime);
  const nights = calculateNights(booking.startTime, booking.endTime);
  const guests = booking.pax || 1;
  const totalPaid = formatCurrency(
    booking.totalPrice || booking.transactionTotal || 0,
    booking.currency || "SGD"
  );
  const supportLines = [];
  if (supportEmail) supportLines.push(`Email: ${supportEmail}`);
  if (supportPhone) supportLines.push(`Phone: ${supportPhone}`);

  const subject = `Booking Confirmed: ${booking.bookingId}`;
  const textParts = [
    `Hello ${booking.userName || "Guest"},`,
    "",
    `Your booking is confirmed.`,
    "",
    `Booking ID: ${booking.bookingId}`,
    `Property: ${propertyName}`,
    `Room: ${booking.roomName || "-"}`,
    `Check-in: ${checkIn}`,
    `Check-out: ${checkOut}`,
    `Nights: ${nights}`,
    `Guests: ${guests}`,
    `Total paid: ${totalPaid}`,
    `Booking status: Confirmed`,
  ];

  if (supportLines.length) {
    textParts.push("", "Support:", ...supportLines);
  }

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #111;">
      <h2 style="margin-bottom: 8px;">Booking Confirmed</h2>
      <p style="margin-top: 0;">Hello ${escapeHtml(booking.userName || "Guest")},</p>
      <p>Your booking is confirmed.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
        <tr><td style="padding: 6px 0;">Booking ID</td><td style="padding: 6px 0;"><strong>${escapeHtml(
          booking.bookingId
        )}</strong></td></tr>
        <tr><td style="padding: 6px 0;">Property</td><td style="padding: 6px 0;"><strong>${escapeHtml(
          propertyName
        )}</strong></td></tr>
        <tr><td style="padding: 6px 0;">Room</td><td style="padding: 6px 0;"><strong>${escapeHtml(
          booking.roomName || "-"
        )}</strong></td></tr>
        <tr><td style="padding: 6px 0;">Check-in</td><td style="padding: 6px 0;">${escapeHtml(
          checkIn
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Check-out</td><td style="padding: 6px 0;">${escapeHtml(
          checkOut
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Nights</td><td style="padding: 6px 0;">${escapeHtml(
          nights
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Guests</td><td style="padding: 6px 0;">${escapeHtml(
          guests
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Total paid</td><td style="padding: 6px 0;">${escapeHtml(
          totalPaid
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Booking status</td><td style="padding: 6px 0;"><strong>Confirmed</strong></td></tr>
      </table>
      ${
        supportLines.length
          ? `<p><strong>Support:</strong> ${escapeHtml(supportLines.join(" | "))}</p>`
          : ""
      }
    </div>
  `;

  return { subject, text: textParts.join("\n"), html };
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function buildInvoiceEmail({ invoice }) {
  const propertyName = process.env.PROPERTY_NAME || "Chill Space";
  const { supportEmail, supportPhone } = getSupportContact();
  const totalPaid = formatCurrency(invoice.total_amount || 0, invoice.currency || "SGD");
  const issuedOn = formatDate(invoice.created_at);
  const providerLabel = String(invoice.provider || "payment").replace("_", " ").toUpperCase();
  const supportLines = [];
  if (supportEmail) supportLines.push(`Email: ${supportEmail}`);
  if (supportPhone) supportLines.push(`Phone: ${supportPhone}`);

  const subject = `Invoice #${invoice.transaction_id} - ${propertyName}`;
  const itemLines = (invoice.items || []).map((item) => {
    const base = `${item.item_name} x${item.qty} @ ${formatCurrency(
      item.price,
      invoice.currency
    )} = ${formatCurrency(item.subtotal, invoice.currency)}`;
    if (item.item_type === "room_booking" && item.start_time && item.end_time) {
      return `${base} (From ${formatDateTime(item.start_time)} to ${formatDateTime(
        item.end_time
      )})`;
    }
    return base;
  });

  const textParts = [
    `Hello ${invoice.user_name || "Guest"},`,
    "",
    `Thank you for your purchase at ${propertyName}.`,
    "",
    `Invoice ID: ${invoice.transaction_id}`,
    `Date: ${issuedOn}`,
    `Status: ${invoice.status || "COMPLETED"}`,
    `Payment method: ${providerLabel}`,
    "",
    "Items:",
    ...(itemLines.length ? itemLines.map((line) => `- ${line}`) : ["- No items found"]),
    "",
    `Total paid: ${totalPaid}`,
  ];

  if (supportLines.length) {
    textParts.push("", "Support:", ...supportLines);
  }

  const htmlItems =
    itemLines.length > 0
      ? invoice.items
          .map((item) => {
            const detail =
              item.item_type === "room_booking" && item.start_time && item.end_time
                ? `<div style="color:#6b7280;font-size:12px;">${escapeHtml(
                    formatDateTime(item.start_time)
                  )} to ${escapeHtml(formatDateTime(item.end_time))}</div>`
                : "";
            return `
              <tr>
                <td style="padding:8px 0;">
                  <strong>${escapeHtml(item.item_name)}</strong>
                  ${detail}
                </td>
                <td style="padding:8px 0; text-align:center;">${escapeHtml(item.qty)}</td>
                <td style="padding:8px 0; text-align:right;">${escapeHtml(
                  formatCurrency(item.price, invoice.currency)
                )}</td>
                <td style="padding:8px 0; text-align:right;">${escapeHtml(
                  formatCurrency(item.subtotal, invoice.currency)
                )}</td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="4" style="padding:8px 0; color:#6b7280;">No items found.</td>
        </tr>
      `;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #111;">
      <h2 style="margin-bottom: 8px;">Invoice</h2>
      <p style="margin-top: 0;">Hello ${escapeHtml(invoice.user_name || "Guest")},</p>
      <p>Thank you for your purchase at ${escapeHtml(propertyName)}.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tr><td style="padding: 6px 0;">Invoice ID</td><td style="padding: 6px 0;"><strong>${escapeHtml(
          invoice.transaction_id
        )}</strong></td></tr>
        <tr><td style="padding: 6px 0;">Date</td><td style="padding: 6px 0;">${escapeHtml(
          issuedOn
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Status</td><td style="padding: 6px 0;">${escapeHtml(
          invoice.status || "COMPLETED"
        )}</td></tr>
        <tr><td style="padding: 6px 0;">Payment method</td><td style="padding: 6px 0;">${escapeHtml(
          providerLabel
        )}</td></tr>
      </table>
      <h3 style="margin: 18px 0 8px;">Items</h3>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:6px 0; border-bottom:1px solid #eee;">Item</th>
            <th style="text-align:center; padding:6px 0; border-bottom:1px solid #eee;">Qty</th>
            <th style="text-align:right; padding:6px 0; border-bottom:1px solid #eee;">Price</th>
            <th style="text-align:right; padding:6px 0; border-bottom:1px solid #eee;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${htmlItems}</tbody>
      </table>
      <p style="margin-top: 16px;"><strong>Total paid:</strong> ${escapeHtml(totalPaid)}</p>
      ${
        supportLines.length
          ? `<p><strong>Support:</strong> ${escapeHtml(supportLines.join(" | "))}</p>`
          : ""
      }
    </div>
  `;

  return { subject, text: textParts.join("\n"), html };
}

async function sendBookingConfirmationEmails(transactionId) {
  if (!transactionId) return;
  try {
    const bookings = await listBookingItemsForTransaction(transactionId);
    if (!bookings.length) return;
    for (const booking of bookings) {
      if (!booking.userEmail) continue;
      const emailContent = buildBookingConfirmationEmail({ booking });
      try {
        await sendEmail({
          to: booking.userEmail,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        });
      } catch (error) {
        console.error("Booking confirmation email failed:", error.message);
      }
    }
  } catch (error) {
    console.error("Booking confirmation email lookup failed:", error.message);
  }
}

async function sendInvoiceEmail(transactionId, userId) {
  if (!transactionId || !userId) return;
  try {
    const invoice = await getTransactionById(transactionId, userId);
    if (!invoice || !invoice.user_email) return;
    const emailContent = buildInvoiceEmail({ invoice });
    await sendEmail({
      to: invoice.user_email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (error) {
    console.error("Invoice email failed:", error.message);
  }
}

function isNetsPaymentSuccessful(status) {
  const responseCode =
    status?.response_code ?? status?.result?.response_code ?? status?.result?.responseCode;
  const txnStatus =
    status?.txn_status ?? status?.result?.txn_status ?? status?.result?.txnStatus;
  const normalizedTxnStatus =
    typeof txnStatus === "string" ? txnStatus.trim().toLowerCase() : txnStatus;

  return (
    String(responseCode) === "00" &&
    (Number(normalizedTxnStatus) === 1 ||
      normalizedTxnStatus === "success" ||
      normalizedTxnStatus === "completed")
  );
}

function getOwner(req) {
  const userId = req.session ? req.session.userId : null;
  const sessionId = req.cartSid || null;
  return { userId, sessionId };
}

async function createPaypalOrder(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }
    const compliance = await enforceCompliance(req, total, "paypal_create");
    if (!compliance.ok) {
      return res.status(403).json({ error: compliance.error });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const order = await createOrder(total.toFixed(2), "SGD", {
      returnUrl: `${baseUrl}/checkout?paypal=success`,
      cancelUrl: `${baseUrl}/checkout?paypal=cancel`,
    });

    const approveLink =
      Array.isArray(order.links) &&
      order.links.find((link) => link.rel === "approve");
    if (!approveLink) {
      return res.status(500).json({ error: "Missing PayPal approval link." });
    }

    return res.json({ approvalUrl: approveLink.href });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal error." });
  }
}

async function createPaypalButtonOrder(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }
    const compliance = await enforceCompliance(req, total, "paypal_button_create");
    if (!compliance.ok) {
      return res.status(403).json({ error: compliance.error });
    }

    const order = await createOrder(total.toFixed(2), "SGD");
    return res.json({ id: order.id });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal error." });
  }
}

async function capturePaypalButtonOrder(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }
    const { orderID } = req.body || {};
    if (!orderID) {
      return res.status(400).json({ error: "Missing order ID." });
    }
    const capture = await captureOrder(orderID);
    if (capture.status !== "COMPLETED") {
      return res.json({
        status: capture.status,
        success: false,
        details: capture,
      });
    }

    const existing = await findTransactionByProviderOrderId(orderID, userId);
    if (existing) {
      return res.json({
        status: capture.status,
        success: true,
        transactionId: existing.transaction_id,
      });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({
        error: "Cart is empty. Payment captured but no invoice was created.",
      });
    }
    const cartTotal = normalizeAmount(calculateCartTotal(items));
    const captureUnit = Array.isArray(capture.purchase_units) ? capture.purchase_units[0] : null;
    const captureAmountRaw =
      captureUnit?.payments?.captures?.[0]?.amount?.value || captureUnit?.amount?.value;
    const captureCurrency =
      captureUnit?.payments?.captures?.[0]?.amount?.currency_code ||
      captureUnit?.amount?.currency_code ||
      "SGD";
    const captureAmount = normalizeAmount(captureAmountRaw);
    if (String(captureCurrency).toUpperCase() !== "SGD") {
      return res.status(400).json({ error: "Unsupported currency." });
    }
    if (!amountsMatch(cartTotal, captureAmount)) {
      return res.status(400).json({
        error: "Payment amount mismatch. Please contact support.",
      });
    }
    const compliance = await enforceCompliance(req, cartTotal, "paypal_capture");
    if (!compliance.ok) {
      return res.status(403).json({ error: compliance.error });
    }
    const payerId = capture.payer ? capture.payer.payer_id : "unknown";
    const payerEmail = capture.payer
      ? capture.payer.email_address || req.session.email
      : req.session.email;
    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId: orderID,
      items,
      payerId,
      payerEmail,
      status: capture.status,
    });
    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });
    sendBookingConfirmationEmails(transaction.transactionId).catch((error) => {
      console.error("Booking confirmation email failed:", error.message);
    });
    sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
      console.error("Invoice email failed:", error.message);
    });
    sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
      console.error("Invoice email failed:", error.message);
    });

    return res.json({
      status: capture.status,
      success: true,
      transactionId: transaction.transactionId,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal error." });
  }
}

async function payCheckoutWithWallet(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = calculateCartTotal(items);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }
    const compliance = await enforceCompliance(req, total, "wallet_checkout");
    if (!compliance.ok) {
      return res.status(403).json({ error: compliance.error });
    }

    const result = await payWithWallet({ userId, sessionId, items });
    issueTransactionCashbackIfEligible(result.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });
    sendBookingConfirmationEmails(result.transactionId).catch((error) => {
      console.error("Booking confirmation email failed:", error.message);
    });
    sendInvoiceEmail(result.transactionId, userId).catch((error) => {
      console.error("Invoice email failed:", error.message);
    });
    return res.json({
      success: true,
      transactionId: result.transactionId,
      balanceCents: result.balanceCents,
    });
  } catch (error) {
    if (error.message === "Insufficient wallet balance.") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || "Wallet payment failed." });
  }
}

async function createHitpayPayNowPayment(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }
    const compliance = await enforceCompliance(req, total, "hitpay_create");
    if (!compliance.ok) {
      return res.status(403).json({ error: compliance.error });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const referenceNumber = `user-${userId}-${Date.now()}`;
    const payment = await createPayNowPaymentRequest({
      amount: total.toFixed(2),
      currency: "SGD",
      email: req.session.email,
      name: req.session.name || "Customer",
      referenceNumber,
      redirectUrl: `${baseUrl}/payments/hitpay/return`,
    });

    if (req.session) {
      req.session.hitpay = {
        requestId: payment.id,
        amount: total.toFixed(2),
        reference: referenceNumber,
        createdAt: Date.now(),
      };
    }

    return res.json({
      id: payment.id,
      paymentUrl: payment.url,
    });
  } catch (error) {
    console.error("HitPay create payment failed:", error.message);
    return res.status(500).json({ error: error.message || "HitPay error." });
  }
}

async function handleHitpayReturn(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.redirect("/login?redirect=/checkout&reason=checkout");
    }

    let requestId = resolveHitpayRequestId(req);
    if (!requestId) {
      return res.redirect("/checkout?hitpay=missing_reference");
    }
    if (req.session?.hitpay?.requestId && requestId !== req.session.hitpay.requestId) {
      requestId = req.session.hitpay.requestId;
    }

    const providerOrderId = `HITPAY-${requestId}`;
    const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
    if (existing) {
      return res.redirect(`/payment-processing/${existing.transaction_id}`);
    }

    const paymentRequest = await getPaymentRequestStatus(requestId);
    const paymentId = resolveHitpayPaymentId(paymentRequest);
    const paid =
      String(paymentRequest.status || "").toLowerCase() === "completed" ||
      (Array.isArray(paymentRequest.payments) &&
        paymentRequest.payments.some(
          (payment) => String(payment.status || "").toLowerCase() === "succeeded"
        ));
    if (paymentRequest.currency && String(paymentRequest.currency).toUpperCase() !== "SGD") {
      return res.redirect("/checkout?hitpay=currency_mismatch");
    }

    if (!paid) {
      return res.redirect("/checkout?hitpay=failed");
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.redirect("/checkout?hitpay=empty_cart");
    }

    if (req.session?.hitpay?.requestId && req.session.hitpay.requestId !== requestId) {
      return res.redirect("/checkout?hitpay=reference_mismatch");
    }
    const cartTotal = normalizeAmount(calculateCartTotal(items));
    const paidAmount = normalizeAmount(paymentRequest.amount || paymentRequest.amount_requested);
    if (req.session?.hitpay?.amount) {
      const expected = normalizeAmount(req.session.hitpay.amount);
      if (expected !== null && paidAmount !== null && !amountsMatch(expected, paidAmount)) {
        return res.redirect("/checkout?hitpay=amount_mismatch");
      }
    }
    if (cartTotal !== null && paidAmount !== null && !amountsMatch(cartTotal, paidAmount)) {
      return res.redirect("/checkout?hitpay=amount_mismatch");
    }
    const compliance = await enforceCompliance(req, cartTotal, "hitpay_return");
    if (!compliance.ok) {
      return res.redirect("/checkout?hitpay=blocked");
    }

    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId,
      items,
      payerId: paymentId || paymentRequest.id || requestId,
      payerEmail: paymentRequest.email || req.session.email,
      status: "COMPLETED",
    });

    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });
    sendBookingConfirmationEmails(transaction.transactionId).catch((error) => {
      console.error("Booking confirmation email failed:", error.message);
    });
    sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
      console.error("Invoice email failed:", error.message);
    });

    if (req.session && req.session.hitpay) {
      delete req.session.hitpay;
    }

    return res.redirect(`/payment-processing/${transaction.transactionId}`);
  } catch (error) {
    return res.redirect(
      `/checkout?hitpay=error&message=${encodeURIComponent(
        error.message || "Unable to verify HitPay payment."
      )}`
    );
  }
}

function parseExpiryInput(expiry) {
  if (!expiry || typeof expiry !== "string") return { expMonth: null, expYear: null };
  const match = expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
  if (!match) return { expMonth: null, expYear: null };
  return { expMonth: match[1], expYear: match[2] };
}

function buildStripeRiskFromIntent(intent) {
  const charge = intent?.charges?.data?.length ? intent.charges.data[0] : null;
  const checks = charge?.payment_method_details?.card?.checks || {};
  const flags = [];
  if (checks.cvc_check === "fail") flags.push("cvc_mismatch");
  if (checks.address_line1_check === "fail" || checks.address_postal_code_check === "fail") {
    flags.push("avs_mismatch");
  }
  return {
    flags,
    checks,
    outcome: charge?.outcome || {},
  };
}

async function payCheckoutWithStripeCard(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }

    const body = req.body || {};
    const billing = {
      name: body.card_name || req.session?.name,
      email: body.card_email || req.session?.email,
      country: body.billing_country || null,
      postalCode: body.postal_code || null,
    };
    const ipCountry = req.headers["cf-ipcountry"] || req.headers["x-country-code"] || null;
    const paymentMethodId = body.payment_method_id;
    let result;

    if (paymentMethodId) {
      result = await createCardPaymentIntentWithPaymentMethod({
        amount: total.toFixed(2),
        currency: "sgd",
        paymentMethodId,
        billing,
        description: `Chill Space order for user ${userId}`,
        metadata: { userId: String(userId), sessionId: String(sessionId || "") },
        userId,
        ipCountry,
        returnUrl: `${req.protocol}://${req.get("host")}/checkout`,
      });
    } else {
      const parsedExpiry = parseExpiryInput(body.card_expiry || "");
      const card = {
        number: body.card_number,
        expMonth: body.card_exp_month ?? parsedExpiry.expMonth,
        expYear: body.card_exp_year ?? parsedExpiry.expYear,
        cvc: body.cvc || body.card_cvc || body.card_cvv,
      };
      if (!card.number || !card.expMonth || !card.expYear || !card.cvc) {
        return res.status(400).json({ error: "Missing card details." });
      }
      result = await createCardPaymentIntent({
        amount: total.toFixed(2),
        currency: "sgd",
        card,
        billing,
        description: `Chill Space order for user ${userId}`,
        metadata: { userId: String(userId), sessionId: String(sessionId || "") },
        userId,
        ipCountry,
        returnUrl: `${req.protocol}://${req.get("host")}/checkout`,
      });
    }

    if (result.requiresAction) {
      return res.json({
        requiresAction: true,
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        risk: result.risk,
        card: result.card,
      });
    }

    if (result.status !== "succeeded") {
      return res.status(400).json({
        error: "Stripe payment was not completed.",
        risk: result.risk,
      });
    }

    if (isStripeRiskBlocked(result.risk)) {
      await recordStripeRiskFlag({
        userId,
        paymentIntentId: result.paymentIntentId,
        risk: result.risk,
        amount: total,
        context: "checkout",
      });
      if (result.paymentIntentId) {
        try {
          await refundPaymentIntent({ paymentIntentId: result.paymentIntentId });
        } catch (error) {
          console.error("Stripe risk refund failed:", error.message);
        }
      }
      console.warn("Stripe payment blocked by risk rules.", {
        userId,
        paymentIntentId: result.paymentIntentId,
        flags: result.risk?.flags || [],
        riskLevel: result.risk?.outcome?.risk_level || null,
        riskScore: result.risk?.outcome?.risk_score || null,
      });
      return res.status(402).json({
        error: "Payment was flagged as high risk. Booking not created.",
        risk: result.risk,
      });
    }

    const providerOrderId = `STRIPE-CARD-${result.paymentIntentId}`;
    const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
    if (existing) {
      return res.json({
        success: true,
        transactionId: existing.transaction_id,
        risk: result.risk,
        card: result.card,
      });
    }

    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId,
      items,
      payerId: result.paymentMethodId || "stripe_card",
      payerEmail: body.card_email || req.session?.email || "unknown",
      status: "COMPLETED",
    });
    if (result.paymentMethodId && result.card && result.card.last4 && result.card.brand) {
      upsertPaymentMethod({
        userId,
        provider: "stripe",
        token: result.paymentMethodId,
        brand: result.card.brand,
        last4: result.card.last4,
        funding: result.card.type,
      }).catch((error) => {
        if (error && error.code !== "ER_NO_SUCH_TABLE") {
          console.error("Payment method storage failed:", error.message);
        }
      });
    }
    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });
    sendBookingConfirmationEmails(transaction.transactionId).catch((error) => {
      console.error("Booking confirmation email failed:", error.message);
    });
    sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
      console.error("Invoice email failed:", error.message);
    });

    return res.json({
      success: true,
      transactionId: transaction.transactionId,
      risk: result.risk,
      card: result.card,
    });
  } catch (error) {
    console.error("Stripe card payment failed:", error.message);
    return res.status(500).json({ error: error.message || "Stripe payment failed." });
  }
}

async function confirmStripeCardPayment(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }
    const paymentIntentId = req.body?.payment_intent_id;
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing payment intent." });
    }

    const intent = await confirmCardPaymentIntent(paymentIntentId);
    if (!intent || intent.status !== "succeeded") {
      return res.status(400).json({ error: "Stripe payment was not completed." });
    }
    if (intent.currency && String(intent.currency).toLowerCase() !== "sgd") {
      return res.status(400).json({ error: "Unsupported currency." });
    }

    const risk = buildStripeRiskFromIntent(intent);
    if (isStripeRiskBlocked(risk)) {
      await recordStripeRiskFlag({
        userId,
        paymentIntentId,
        risk,
        amount: intent.amount ? Number(intent.amount) / 100 : null,
        context: "checkout_confirm",
      });
      try {
        await refundPaymentIntent({ paymentIntentId });
      } catch (error) {
        console.error("Stripe risk refund failed:", error.message);
      }
      return res.status(402).json({
        error: "Payment was flagged as high risk. Booking not created.",
        risk,
      });
    }

    const providerOrderId = `STRIPE-CARD-${paymentIntentId}`;
    const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
    if (existing) {
      return res.json({
        success: true,
        transactionId: existing.transaction_id,
        risk,
      });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const charge = intent.charges?.data?.length ? intent.charges.data[0] : null;
    const cardDetails = charge?.payment_method_details?.card || {};

    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId,
      items,
      payerId: intent.payment_method || "stripe_card",
      payerEmail: req.session?.email || "unknown",
      status: "COMPLETED",
    });

    if (intent.payment_method && cardDetails.last4 && cardDetails.brand) {
      upsertPaymentMethod({
        userId,
        provider: "stripe",
        token: intent.payment_method,
        brand: cardDetails.brand,
        last4: cardDetails.last4,
        funding: cardDetails.funding,
      }).catch((error) => {
        if (error && error.code !== "ER_NO_SUCH_TABLE") {
          console.error("Payment method storage failed:", error.message);
        }
      });
    }

    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });
    sendBookingConfirmationEmails(transaction.transactionId).catch((error) => {
      console.error("Booking confirmation email failed:", error.message);
    });
    sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
      console.error("Invoice email failed:", error.message);
    });

    return res.json({
      success: true,
      transactionId: transaction.transactionId,
      risk,
    });
  } catch (error) {
    console.error("Stripe card confirmation failed:", error.message);
    return res.status(500).json({ error: error.message || "Stripe payment failed." });
  }
}

function buildStripeSuccessUrl(req) {
  const base = process.env.STRIPE_SUCCESS_URL;
  const fallback = `${req.protocol}://${req.get("host")}/stripe/success?session_id={CHECKOUT_SESSION_ID}`;
  const url = base || fallback;
  if (url.includes("{CHECKOUT_SESSION_ID}")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}session_id={CHECKOUT_SESSION_ID}`;
}

function buildStripeCancelUrl(req) {
  return (
    process.env.STRIPE_CANCEL_URL ||
    `${req.protocol}://${req.get("host")}/checkout?stripe=cancel`
  );
}

function buildGrabPayLineItems(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const promoItems = [];
  const billableItems = [];
  safeItems.forEach((item) => {
    const price = Number(item.price);
    const details = String(item.details || "");
    const isPromo = details.startsWith("promo:") || price < 0;
    if (isPromo) {
      promoItems.push(item);
      return;
    }
    billableItems.push(item);
  });

  const subtotalCents = billableItems.reduce((sum, item) => {
    const unitCents = Math.round(Number(item.price) * 100);
    const qty = Number(item.qty || 1);
    if (!Number.isFinite(unitCents) || unitCents <= 0 || !Number.isFinite(qty) || qty <= 0) {
      throw new Error("Invalid item price.");
    }
    return sum + unitCents * qty;
  }, 0);

  const discountCents = promoItems.reduce((sum, item) => {
    const unitCents = Math.round(Number(item.price) * 100);
    const qty = Number(item.qty || 1);
    if (!Number.isFinite(unitCents) || !Number.isFinite(qty)) return sum;
    return sum + Math.abs(unitCents * qty);
  }, 0);

  const totalCents = subtotalCents - discountCents;
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    throw new Error("Invalid item price.");
  }

  if (discountCents > 0) {
    return [
      {
        price_data: {
          currency: "sgd",
          unit_amount: totalCents,
          product_data: {
            name: "Chill Space order",
          },
        },
        quantity: 1,
      },
    ];
  }

  return billableItems.map((item) => {
    const unitAmount = Math.round(Number(item.price) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error("Invalid item price.");
    }
    return {
      price_data: {
        currency: "sgd",
        unit_amount: unitAmount,
        product_data: {
          name: item.name,
        },
      },
      quantity: Number(item.qty || 1),
    };
  });
}

function buildIdempotencyKey({ userId, sessionId, items }) {
  const payload = JSON.stringify({
    userId,
    sessionId,
    items: items.map((item) => ({
      id: item.itemId || null,
      name: item.name,
      qty: Number(item.qty || 1),
      price: Number(item.price),
    })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function createStripeGrabPaySession(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = calculateCartTotal(items);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }
    const compliance = await enforceCompliance(req, total, "grabpay_create");
    if (!compliance.ok) {
      return res.status(403).json({ error: compliance.error });
    }

    const lineItems = buildGrabPayLineItems(items);
    const session = await createGrabPayCheckoutSession({
      lineItems,
      successUrl: buildStripeSuccessUrl(req),
      cancelUrl: buildStripeCancelUrl(req),
      customerEmail: req.session?.email,
      metadata: {
        userId: String(userId),
        sessionId: String(sessionId || ""),
        amountCents: String(Math.round(total * 100)),
      },
      idempotencyKey: buildIdempotencyKey({ userId, sessionId, items }),
    });

    if (!session || !session.url) {
      return res.status(500).json({ error: "Unable to start GrabPay payment." });
    }
    if (req.session) {
      req.session.grabpay = {
        amount: total.toFixed(2),
        createdAt: Date.now(),
      };
    }
    return res.json({ url: session.url });
  } catch (error) {
    console.error("GrabPay session create failed:", error.message);
    return res.status(500).json({ error: error.message || "GrabPay error." });
  }
}

async function finalizeGrabPayCheckout({ session, userIdOverride, sessionIdOverride }) {
  if (!session || session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  const userId = Number(userIdOverride || session.metadata?.userId || 0);
  if (!userId) {
    return { ok: false, reason: "missing_user" };
  }
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const providerOrderId = `STRIPE-GRABPAY-${session.id}`;
  const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
  if (existing) {
    return { ok: true, transactionId: existing.transaction_id, existing: true };
  }

  const expiredHolds = await removeExpiredRoomBookings({
    userId,
    sessionId: sessionIdOverride || session.metadata?.sessionId || null,
    now: new Date(),
  });
  await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

  const items = await listCartItems({
    userId,
    sessionId: sessionIdOverride || session.metadata?.sessionId || null,
  });
  if (!items.length) {
    return { ok: false, reason: "empty_cart" };
  }

  const cartTotal = normalizeAmount(calculateCartTotal(items));
  const sessionAmount = normalizeAmount(Number(session.amount_total || 0) / 100);
  if (!amountsMatch(cartTotal, sessionAmount)) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if (session.metadata?.amountCents) {
    const metaAmount = normalizeAmount(Number(session.metadata.amountCents) / 100);
    if (!amountsMatch(metaAmount, sessionAmount)) {
      return { ok: false, reason: "amount_mismatch" };
    }
  }

  const compliance = await runComplianceChecks({
    userId,
    amount: cartTotal,
    currency: "SGD",
    context: "grabpay_finalize",
    relatedType: "payment",
    relatedId: null,
    ipAddress: null,
  });
  if (!compliance.ok) {
    return { ok: false, reason: "compliance_blocked" };
  }

  const transaction = await createTransactionFromCart({
    userId,
    sessionId: sessionIdOverride || session.metadata?.sessionId || null,
    providerOrderId,
    items,
    payerId: paymentIntentId || session.id || "grabpay",
    payerEmail: session.customer_details?.email || "unknown",
    status: "COMPLETED",
  });
  issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
    console.error("Cashback reward issuance failed:", error.message);
  });
  sendBookingConfirmationEmails(transaction.transactionId).catch((error) => {
    console.error("Booking confirmation email failed:", error.message);
  });
  sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
    console.error("Invoice email failed:", error.message);
  });
  return { ok: true, transactionId: transaction.transactionId, existing: false };
}

async function handleStripeSuccess(req, res) {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.redirect("/checkout?stripe=missing_intent");
  }
  if (!req.session || !req.session.userId) {
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?redirect=${redirect}&reason=checkout`);
  }

  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (!session) {
      return res.redirect("/checkout?stripe=failed");
    }
    if (session.payment_status !== "paid") {
      return res.redirect("/checkout?stripe=pending");
    }
    if (
      session.metadata?.userId &&
      Number(session.metadata.userId) !== Number(req.session.userId)
    ) {
      return res.status(403).send("Not authorized to view this session.");
    }

    const result = await finalizeGrabPayCheckout({
      session,
      userIdOverride: req.session.userId,
      sessionIdOverride: req.cartSid,
    });
    if (!result.ok) {
      const reason =
        result.reason === "amount_mismatch"
          ? "amount_mismatch"
          : result.reason === "compliance_blocked"
            ? "blocked"
            : "empty_cart";
      return res.redirect(`/checkout?stripe=${reason}`);
    }
    return res.redirect(`/payment-processing/${result.transactionId}`);
  } catch (error) {
    console.error("Stripe success verification failed:", error.message);
    return res.redirect(
      `/checkout?stripe=error&message=${encodeURIComponent(
        error.message || "Unable to verify GrabPay payment."
      )}`
    );
  }
}

async function handleStripeWebhook(req, res) {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (error) {
    console.error("Stripe webhook signature failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  const session = event.data?.object;
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await finalizeGrabPayCheckout({ session });
    } else if (event.type === "checkout.session.async_payment_failed") {
      console.warn("GrabPay async payment failed:", session?.id);
    }
  } catch (error) {
    console.error("Stripe webhook handling failed:", error.message);
    return res.status(500).send("Webhook handling failed.");
  }

  return res.json({ received: true });
}

module.exports = {
  createPaypalOrder,
  createPaypalButtonOrder,
  capturePaypalButtonOrder,
  payCheckoutWithWallet,
  payCheckoutWithStripeCard,
  confirmStripeCardPayment,
  createStripeGrabPaySession,
  handleStripeSuccess,
  handleStripeWebhook,
  createHitpayPayNowPayment,
  handleHitpayReturn,
  createNetsQrPayment: async (req, res) => {
    try {
      const { userId, sessionId } = getOwner(req);
      if (!userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const itemsRaw = await listCartItems({ userId, sessionId });
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      if (!items.length) {
        return res.status(400).json({ error: "Cart is empty." });
      }

      const total = items.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
        0
      );
      if (!Number.isFinite(total) || total <= 0) {
        return res.status(400).json({ error: "Invalid cart total." });
      }
      const compliance = await enforceCompliance(req, total, "nets_create");
      if (!compliance.ok) {
        return res.status(403).json({ error: compliance.error });
      }

      const { qrCodeUrl, txnRetrievalRef } = await createNetsQr(total);
      if (req.session) {
        req.session.nets = {
          txnRetrievalRef,
          total: total.toFixed(2),
          createdAt: Date.now(),
        };
      }

      return res.json({
        qrCodeUrl,
        txnRetrievalRef,
        total: total.toFixed(2),
      });
    } catch (error) {
      console.error("NETS create QR failed:", error.message);
      return res.status(500).json({ error: error.message || "NETS error." });
    }
  },

  getNetsTxnStatus: async (req, res) => {
    try {
      const { userId } = getOwner(req);
      if (!userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const txnRetrievalRef = req.params.txnRetrievalRef || req.query.txnRetrievalRef;
      if (!txnRetrievalRef) {
        return res.status(400).json({ error: "Missing txnRetrievalRef." });
      }

      const status = await getTxnStatus(txnRetrievalRef);
      return res.json({ status });
    } catch (error) {
      console.error("NETS status query failed:", error.message);
      return res.status(500).json({ error: error.message || "NETS error." });
    }
  },

  streamNetsTxnStatus: async (req, res) => {
    const { userId } = getOwner(req);
    if (!userId) {
      res.status(401).setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Login required." }));
    }

    const txnRetrievalRef = req.params.txnRetrievalRef;
    if (!txnRetrievalRef) {
      res.status(400).setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing txnRetrievalRef." }));
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let pollCount = 0;
    const maxPolls = 60;
    const timer = setInterval(async () => {
      pollCount += 1;
      try {
        const status = await getTxnStatus(txnRetrievalRef);
        res.write(`data: ${JSON.stringify(status)}\n\n`);

        if (isNetsPaymentSuccessful(status)) {
          clearInterval(timer);
          res.write(`event: done\ndata: success\n\n`);
          return res.end();
        }

        if (pollCount >= maxPolls) {
          clearInterval(timer);
          res.write(`event: done\ndata: timeout\n\n`);
          return res.end();
        }
      } catch (error) {
        clearInterval(timer);
        res.write(
          `data: ${JSON.stringify({
            fail: true,
            error: true,
            details: error.message,
          })}\n\n`
        );
        return res.end();
      }
    }, 5000);

    req.on("close", () => clearInterval(timer));
  },

  completeNetsPayment: async (req, res) => {
    try {
      const { userId, sessionId } = getOwner(req);
      if (!userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const txnRetrievalRef = req.body?.txnRetrievalRef || req.query.txnRetrievalRef;
      if (!txnRetrievalRef) {
        return res.status(400).json({ error: "Missing txnRetrievalRef." });
      }

      const status = await getTxnStatus(txnRetrievalRef);
      if (!isNetsPaymentSuccessful(status)) {
        return res.status(400).json({ error: "NETS payment not completed.", status });
      }

      const providerOrderId = `NETS-${txnRetrievalRef}`;
      const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
      if (existing) {
        return res.json({
          success: true,
          transactionId: existing.transaction_id,
          alreadyRecorded: true,
        });
      }

      const expiredHolds = await removeExpiredRoomBookings({
        userId,
        sessionId,
        now: new Date(),
      });
      await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

      const itemsRaw = await listCartItems({ userId, sessionId });
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      if (!items.length) {
        return res.status(400).json({
          error: "Cart is empty. Payment verified but no invoice was created.",
        });
      }

      const cartTotal = normalizeAmount(calculateCartTotal(items));
      let paidAmount = normalizeAmount(
        status?.amt_in_dollars || status?.amount || status?.amtInDollars
      );
      if (paidAmount === null && status?.amt_in_cents) {
        paidAmount = normalizeAmount(Number(status.amt_in_cents) / 100);
      }
      if (req.session?.nets?.total) {
        const expected = normalizeAmount(req.session.nets.total);
        if (expected !== null && paidAmount !== null && !amountsMatch(expected, paidAmount)) {
          return res.status(400).json({ error: "Payment amount mismatch." });
        }
      }
      if (cartTotal !== null && paidAmount !== null && !amountsMatch(cartTotal, paidAmount)) {
        return res.status(400).json({ error: "Payment amount mismatch." });
      }
      const compliance = await enforceCompliance(req, cartTotal, "nets_complete");
      if (!compliance.ok) {
        return res.status(403).json({ error: compliance.error });
      }

      const transaction = await createTransactionFromCart({
        userId,
        sessionId,
        providerOrderId,
        items,
        payerId: txnRetrievalRef,
        payerEmail: req.session?.email || "unknown",
        status: "COMPLETED",
      });
      issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
        console.error("Cashback reward issuance failed:", error.message);
      });
      sendBookingConfirmationEmails(transaction.transactionId).catch((error) => {
        console.error("Booking confirmation email failed:", error.message);
      });
      sendInvoiceEmail(transaction.transactionId, userId).catch((error) => {
        console.error("Invoice email failed:", error.message);
      });

      if (req.session && req.session.nets) {
        delete req.session.nets;
      }

      return res.json({
        success: true,
        transactionId: transaction.transactionId,
      });
    } catch (error) {
      console.error("NETS completion failed:", error.message);
      return res.status(500).json({ error: error.message || "NETS error." });
    }
  },
};
