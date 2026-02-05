const { listRooms, createRoom, updateRoom, deleteRoom } = require("../models/roomsModel");
const {
  listBookingsDb,
  createBookingDb,
  findBookingDbById,
  updateBookingDb,
  deleteBookingDb,
} = require("../models/bookingsModel");
const {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../models/menuDbModel");
const { listEvents, createEvent, updateEvent, deleteEvent } = require("../models/eventsDbModel");
const {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
} = require("../models/promotionsDbModel");
const Reviews = require("../models/reviewsModel");
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  findById,
} = require("../models/usersModel");
const {
  listAllTransactionsWithItems,
  getSalesSummary,
  listTransactionsWithItems,
  findTransactionForBooking,
} = require("../models/transactionsModel");
const { reverseOrderCashbackForBookingIfRefunded } = require("../models/walletModel");
const { sendEmail } = require("../models/emailService");
const {
  listRefundRequests,
  findRefundById,
  updateRefundRequest,
} = require("../models/refundRequestsModel");
const { refundOrder } = require("../services/paypalService");
const { refundPaymentIntent, retrieveCheckoutSession } = require("../services/stripe");

async function renderDashboard(req, res) {
  const [bookings, events, salesSummary] = await Promise.all([
    listBookingsDb(),
    listEvents(),
    getSalesSummary(),
  ]);
  const now = new Date();
  const upcomingBookings = bookings
    .filter((booking) => new Date(booking.endTime) > now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 6);
  const upcomingEvents = events
    .filter((event) => {
      const endDate = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
      return endDate >= now;
    })
    .slice(0, 4);

  res.render("admin/index", {
    upcomingBookings,
    upcomingEvents,
    salesSummary,
  });
}

async function renderRooms(req, res) {
  const rooms = await listRooms();
  res.render("admin/rooms", { rooms });
}

function renderRoomCreate(req, res) {
  res.render("admin/rooms-create");
}

async function addRoom(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  const normalHourlyRate = Number(req.body.normal_hourly_rate);
  const peakHourlyRate = Number(req.body.peak_hourly_rate);
  if (
    !Number.isFinite(normalHourlyRate) ||
    normalHourlyRate <= 0 ||
    !Number.isFinite(peakHourlyRate) ||
    peakHourlyRate <= 0
  ) {
    return res.status(400).send("Please provide valid normal and peak hourly rates.");
  }
  const payload = {
    name: req.body.name,
    subtitle: req.body.subtitle,
    capacity: Number(req.body.capacity),
    normal_hourly_rate: normalHourlyRate,
    peak_hourly_rate: peakHourlyRate,
    description: req.body.description,
    image_url: imageUrl,
    features: req.body.features,
    is_available: req.body.is_available === "1",
  };
  await createRoom(payload);
  res.redirect("/admin/rooms");
}

async function editRoom(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  const normalHourlyRate = Number(req.body.normal_hourly_rate);
  const peakHourlyRate = Number(req.body.peak_hourly_rate);
  if (
    !Number.isFinite(normalHourlyRate) ||
    normalHourlyRate <= 0 ||
    !Number.isFinite(peakHourlyRate) ||
    peakHourlyRate <= 0
  ) {
    return res.status(400).send("Please provide valid normal and peak hourly rates.");
  }
  const updates = {
    name: req.body.name,
    subtitle: req.body.subtitle,
    capacity: Number(req.body.capacity),
    normal_hourly_rate: normalHourlyRate,
    peak_hourly_rate: peakHourlyRate,
    description: req.body.description,
    image_url: imageUrl,
    features: req.body.features,
    is_available: req.body.is_available === "1",
  };
  await updateRoom(req.params.id, updates);
  res.redirect("/admin/rooms");
}

async function removeRoom(req, res) {
  await deleteRoom(req.params.id);
  res.redirect("/admin/rooms");
}

async function renderBookings(req, res) {
  const bookings = await listBookingsDb();
  res.render("admin/bookings", { bookings });
}

async function addBooking(req, res) {
  await createBookingDb({
    user_id: Number(req.body.user_id),
    room_id: Number(req.body.room_id),
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    pax: Number(req.body.pax),
    total_price: Number(req.body.total_price) || null,
    payment_status: req.body.payment_status || "pending",
    admin_status: req.body.admin_status || "pending",
  });
  res.redirect("/admin/bookings");
}

async function editBooking(req, res) {
  await updateBookingDb(req.params.id, {
    user_id: Number(req.body.user_id),
    room_id: Number(req.body.room_id),
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    pax: Number(req.body.pax),
    total_price: Number(req.body.total_price) || null,
    payment_status: req.body.payment_status,
    admin_status: req.body.admin_status,
  });
  reverseOrderCashbackForBookingIfRefunded(req.params.id).catch((error) => {
    console.error("Cashback reversal failed:", error.message);
  });
  res.redirect("/admin/bookings");
}

async function removeBooking(req, res) {
  await deleteBookingDb(req.params.id);
  res.redirect("/admin/bookings");
}

async function renderMenu(req, res) {
  const menuItems = await listMenuItems();
  res.render("admin/menu", { menuItems });
}

async function renderMenuCreate(req, res) {
  res.render("admin/menu-create");
}

async function addMenuItem(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createMenuItem({
    name: req.body.name,
    category: req.body.category,
    price: Number(req.body.price),
    description: req.body.description,
    image_url: imageUrl,
    is_available: req.body.is_available === "1",
  });
  res.redirect("/admin/menu");
}

async function editMenuItem(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updateMenuItem(req.params.id, {
    name: req.body.name,
    category: req.body.category,
    price: Number(req.body.price),
    description: req.body.description,
    image_url: imageUrl,
    is_available: req.body.is_available === "1",
  });
  res.redirect("/admin/menu");
}

async function removeMenuItem(req, res) {
  await deleteMenuItem(req.params.id);
  res.redirect("/admin/menu");
}

async function renderEvents(req, res) {
  const events = await listEvents();
  res.render("admin/events", { events });
}

async function renderEventsCreate(req, res) {
  res.render("admin/events-create");
}

async function addEvent(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createEvent({
    title: req.body.title,
    description: req.body.description,
    event_date: req.body.event_date,
    end_date: req.body.end_date || req.body.event_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/events");
}

async function editEvent(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updateEvent(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    event_date: req.body.event_date,
    end_date: req.body.end_date || req.body.event_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/events");
}

async function removeEvent(req, res) {
  await deleteEvent(req.params.id);
  res.redirect("/admin/events");
}

async function renderPromotions(req, res) {
  const promotions = await listPromotions();
  res.render("admin/promotions", { promotions });
}

async function renderPromotionsCreate(req, res) {
  res.render("admin/promotions-create");
}

async function addPromotion(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createPromotion({
    title: req.body.title,
    description: req.body.description,
    code: req.body.code,
    discount_percent: Number(req.body.discount_percent),
    min_total: Number(req.body.min_total),
    start_date: req.body.start_date,
    end_date: req.body.end_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/promotions");
}

async function editPromotion(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updatePromotion(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    code: req.body.code,
    discount_percent: Number(req.body.discount_percent),
    min_total: Number(req.body.min_total),
    start_date: req.body.start_date,
    end_date: req.body.end_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/promotions");
}

async function removePromotion(req, res) {
  await deletePromotion(req.params.id);
  res.redirect("/admin/promotions");
}

async function renderReviews(req, res) {
  const reviews = await Reviews.getAll();
  res.render("admin/reviews", { reviews });
}

async function renderReviewsCreate(req, res) {
  res.render("admin/reviews-create");
}

async function addReview(req, res) {
  const result = await Reviews.create(
    Number(req.body.user_id),
    Number(req.body.room_id),
    Number(req.body.rating),
    Number(req.body.rating_food || req.body.rating),
    Number(req.body.rating_service || req.body.rating),
    req.body.comment,
    req.body.image_url || null,
    "room"
  );
  if (typeof req.body.is_visible !== "undefined") {
    const reviewId = result && result.insertId ? result.insertId : null;
    if (reviewId) {
      await Reviews.setVisibility(reviewId, req.body.is_visible === "1");
    }
  }
  res.redirect("/admin/reviews");
}

async function editReview(req, res) {
  await Reviews.updateAdmin(
    req.params.id,
    Number(req.body.rating),
    Number(req.body.rating_food || req.body.rating),
    Number(req.body.rating_service || req.body.rating),
    req.body.comment,
    req.body.image_url || null,
    req.body.admin_reply
  );
  if (typeof req.body.is_visible !== "undefined") {
    await Reviews.setVisibility(req.params.id, req.body.is_visible === "1");
  }
  res.redirect("/admin/reviews");
}

async function removeReview(req, res) {
  await Reviews.delete(req.params.id);
  res.redirect("/admin/reviews");
}

async function renderUsers(req, res) {
  const users = await listUsers();
  res.render("admin/users", { users });
}

async function renderUsersCreate(req, res) {
  res.render("admin/users-create");
}

async function addUser(req, res) {
  await createUser({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    role: req.body.role || "user",
    is_active: req.body.is_active !== "0",
  });
  res.redirect("/admin/users");
}

async function editUser(req, res) {
  const existing = await findById(Number(req.params.id));
  if (!existing) {
    return res.status(404).send("User not found.");
  }
  const isSuperAdmin =
    String(existing.email || "").trim().toLowerCase() === "admin@admin.com";
  await updateUser(req.params.id, {
    name: req.body.name,
    email: isSuperAdmin ? existing.email : req.body.email,
    password: req.body.password || undefined,
    role: isSuperAdmin ? existing.role : req.body.role,
    is_active: isSuperAdmin ? true : req.body.is_active !== "0",
  });
  res.redirect("/admin/users");
}

async function removeUser(req, res) {
  const existing = await findById(Number(req.params.id));
  if (!existing) {
    return res.status(404).send("User not found.");
  }
  if (String(existing.email || "").trim().toLowerCase() === "admin@admin.com") {
    return res.status(403).send("Super admin cannot be deleted.");
  }
  const removed = await deleteUser(req.params.id);
  if (!removed) {
    return res.status(403).send("Admin accounts cannot be deleted.");
  }
  res.redirect("/admin/users");
}

async function renderPurchases(req, res) {
  const { transactions, itemsByTransaction } = await listAllTransactionsWithItems(100);
  res.render("admin/purchases", { transactions, itemsByTransaction, user: null });
}

async function renderUserPurchases(req, res) {
  const userId = Number(req.params.id);
  const user = await findById(userId);
  if (!user) {
    return res.status(404).send("User not found");
  }
  const { transactions, itemsByTransaction } = await listTransactionsWithItems(userId);
  const enrichedTransactions = transactions.map((transaction) => ({
    ...transaction,
    user_name: user.name,
    user_email: user.email,
  }));
  res.render("admin/purchases", {
    transactions: enrichedTransactions,
    itemsByTransaction,
    user,
  });
}

async function renderRefunds(req, res) {
  const refunds = await listRefundRequests();
  res.render("admin/refunds", { refunds });
}

async function listRefundsApi(req, res) {
  const refunds = await listRefundRequests();
  res.json({ refunds });
}

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
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
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

function buildRefundDecisionEmail({
  booking,
  refund,
  decision,
  approvedAmount,
  currency,
  adminNote,
}) {
  const propertyName = process.env.PROPERTY_NAME || "Chill Space";
  const { supportEmail, supportPhone } = getSupportContact();
  const checkIn = formatDate(booking.startTime);
  const checkOut = formatDate(booking.endTime);
  const nights = calculateNights(booking.startTime, booking.endTime);
  const guests = booking.pax || 1;
  const totalPaid = formatCurrency(booking.totalPrice || 0, currency);
  const approvedValue =
    decision === "Approved" ? formatCurrency(approvedAmount, currency) : null;

  const supportLines = [];
  if (supportEmail) supportLines.push(`Email: ${supportEmail}`);
  if (supportPhone) supportLines.push(`Phone: ${supportPhone}`);

  const subject = `Refund ${decision}: Booking ${booking.id}`;
  const textParts = [
    `Hello ${booking.userName || "Guest"},`,
    "",
    `Your refund request for booking #${booking.id} has been ${decision.toLowerCase()}.`,
    "",
    `Property: ${propertyName}`,
    `Room: ${booking.roomName || "-"}`,
    `Check-in: ${checkIn}`,
    `Check-out: ${checkOut}`,
    `Nights: ${nights}`,
    `Guests: ${guests}`,
    `Total paid: ${totalPaid}`,
    `Refund status: ${decision}`,
  ];

  if (approvedValue) {
    textParts.push(`Approved amount: ${approvedValue}`);
  }
  if (refund?.reasonText) {
    textParts.push(`Reason: ${refund.reasonText}`);
  }
  if (refund?.userMessage) {
    textParts.push(`Message: ${refund.userMessage}`);
  }
  if (adminNote) {
    textParts.push(`Admin note: ${adminNote}`);
  }
  if (supportLines.length) {
    textParts.push("", "Support:", ...supportLines);
  }

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #111;">
      <h2 style="margin-bottom: 8px;">Refund ${escapeHtml(decision)}</h2>
      <p style="margin-top: 0;">Hello ${escapeHtml(booking.userName || "Guest")},</p>
      <p>Your refund request for booking <strong>#${escapeHtml(booking.id)}</strong> has been <strong>${escapeHtml(
    decision.toLowerCase()
  )}</strong>.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
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
        <tr><td style="padding: 6px 0;">Refund status</td><td style="padding: 6px 0;"><strong>${escapeHtml(
          decision
        )}</strong></td></tr>
        ${
          approvedValue
            ? `<tr><td style="padding: 6px 0;">Approved amount</td><td style="padding: 6px 0;"><strong>${escapeHtml(
                approvedValue
              )}</strong></td></tr>`
            : ""
        }
      </table>
      ${
        refund?.reasonText
          ? `<p><strong>Reason:</strong> ${escapeHtml(refund.reasonText)}</p>`
          : ""
      }
      ${
        refund?.userMessage
          ? `<p><strong>Message:</strong> ${escapeHtml(refund.userMessage)}</p>`
          : ""
      }
      ${adminNote ? `<p><strong>Admin note:</strong> ${escapeHtml(adminNote)}</p>` : ""}
      ${
        supportLines.length
          ? `<p><strong>Support:</strong> ${escapeHtml(supportLines.join(" | "))}</p>`
          : ""
      }
    </div>
  `;

  return { subject, text: textParts.join("\n"), html };
}

function formatRefundError(error) {
  const message = error?.message ? String(error.message) : "Refund failed.";
  const code = error?.code ? String(error.code) : error?.name ? String(error.name) : null;
  return {
    message: message.slice(0, 500),
    code: code ? code.slice(0, 80) : null,
  };
}

function wantsJson(req) {
  const accepts = req.headers.accept || "";
  return req.path.startsWith("/api") || accepts.includes("application/json");
}

function respondOk(req, res, payload, redirectTo) {
  if (wantsJson(req)) {
    return res.json(payload || { ok: true });
  }
  return res.redirect(redirectTo || "/admin/refunds");
}

function respondError(req, res, status, message) {
  if (wantsJson(req)) {
    return res.status(status).json({ error: message });
  }
  return res.status(status).send(message);
}

async function approveRefund(req, res) {
  try {
    const refundId = Number(req.params.id);
    if (!Number.isFinite(refundId)) {
      return respondError(req, res, 400, "Invalid refund request.");
    }

    const refund = await findRefundById(refundId);
    if (!refund) {
      return respondError(req, res, 404, "Refund request not found.");
    }
    if (!["pending", "failed"].includes(refund.status)) {
      return respondOk(req, res, { ok: true, status: refund.status }, "/admin/refunds");
    }

    const booking = await findBookingDbById(refund.bookingId);
    if (!booking) {
      return respondError(req, res, 404, "Booking not found.");
    }

    const total = Number(booking.totalPrice || 0);
    const requested = Number(refund.requestedAmount || total);
    let approvedAmount = requested;
    const approvedRaw = String(req.body.approved_amount || "").trim();
    const adminNoteInput = String(req.body.admin_note || "").trim() || null;
    if (approvedRaw) {
      const parsed = Number(approvedRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return respondError(req, res, 400, "Invalid approved amount.");
      }
      if (parsed > requested) {
        return respondError(req, res, 400, "Approved amount cannot exceed requested amount.");
      }
      approvedAmount = parsed;
    }

    const transaction = await findTransactionForBooking(refund.bookingId);
    const currency = transaction?.currency || "SGD";
    const provider = transaction?.provider || "manual";
    const providerRef = transaction?.provider_order_id || null;
    let manualNote = null;

    let refundProviderRef = null;
    if (!transaction || !transaction.provider_order_id) {
      manualNote = "Manual refund required. Payment reference not found.";
    } else if (provider === "paypal") {
      try {
        const refundResult = await refundOrder(transaction.provider_order_id, {
          amount: approvedAmount < total ? approvedAmount : null,
          currency,
        });
        refundProviderRef = refundResult?.id || refundResult?.refund_id || null;
      } catch (error) {
        const failure = formatRefundError(error);
        await updateRefundRequest(refundId, {
          status: "failed",
          admin_note: adminNoteInput,
          approved_by: req.session.userId,
          approved_at: new Date(),
          provider,
          provider_ref: providerRef,
          refund_provider_ref: null,
          failure_reason: failure.message,
          failure_code: failure.code,
        });
        return respondError(req, res, 400, failure.message);
      }
    } else if (provider === "stripe_card") {
      try {
        const intentId = transaction.provider_order_id.replace("STRIPE-CARD-", "");
        const refundResult = await refundPaymentIntent({
          paymentIntentId: intentId,
          amount: approvedAmount < total ? approvedAmount : null,
        });
        refundProviderRef = refundResult?.id || null;
      } catch (error) {
        const failure = formatRefundError(error);
        await updateRefundRequest(refundId, {
          status: "failed",
          admin_note: adminNoteInput,
          approved_by: req.session.userId,
          approved_at: new Date(),
          provider,
          provider_ref: providerRef,
          refund_provider_ref: null,
          failure_reason: failure.message,
          failure_code: failure.code,
        });
        return respondError(req, res, 400, failure.message);
      }
    } else if (provider === "grabpay") {
      try {
        const sessionId = transaction.provider_order_id.replace("STRIPE-GRABPAY-", "");
        const session = await retrieveCheckoutSession(sessionId);
        const intentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!intentId) {
          throw new Error("Missing Stripe payment intent for GrabPay refund.");
        }
        const refundResult = await refundPaymentIntent({
          paymentIntentId: intentId,
          amount: approvedAmount < total ? approvedAmount : null,
        });
        refundProviderRef = refundResult?.id || null;
      } catch (error) {
        const failure = formatRefundError(error);
        await updateRefundRequest(refundId, {
          status: "failed",
          admin_note: adminNoteInput,
          approved_by: req.session.userId,
          approved_at: new Date(),
          provider,
          provider_ref: providerRef,
          refund_provider_ref: null,
          failure_reason: failure.message,
          failure_code: failure.code,
        });
        return respondError(req, res, 400, failure.message);
      }
    } else {
      manualNote = `Manual refund required for provider: ${provider}.`;
    }

    const isPartial = approvedAmount < total;
    const combinedNote = [adminNoteInput, manualNote].filter(Boolean).join(" ") || null;
    await updateRefundRequest(refundId, {
      status: "approved",
      approved_amount: approvedAmount,
      admin_note: combinedNote,
      approved_by: req.session.userId,
      approved_at: new Date(),
      provider,
      provider_ref: providerRef,
      refund_provider_ref: refundProviderRef,
      failure_reason: null,
      failure_code: null,
    });
    await updateBookingDb(refund.bookingId, {
      payment_status: isPartial ? "partially_refunded" : "refunded",
    });

    reverseOrderCashbackForBookingIfRefunded(refund.bookingId).catch((error) => {
      console.error("Cashback reversal failed:", error.message);
    });

    if (booking.userEmail) {
      const emailContent = buildRefundDecisionEmail({
        booking,
        refund,
        decision: "Approved",
        approvedAmount,
        currency,
        adminNote: adminNoteInput,
      });
      sendEmail({
        to: booking.userEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      }).catch((error) => {
        console.error("Refund email failed:", error.message);
      });
    }

    if (refundProviderRef) {
      console.log("Refund processed", {
        refundId,
        provider,
        refundProviderRef,
      });
    }

    return respondOk(req, res, { ok: true, status: "approved" }, "/admin/refunds");
  } catch (error) {
    console.error("Refund approval failed:", error.message);
    return respondError(req, res, 500, "Refund approval failed.");
  }
}

async function denyRefund(req, res) {
  try {
    const refundId = Number(req.params.id);
    if (!Number.isFinite(refundId)) {
      return respondError(req, res, 400, "Invalid refund request.");
    }

    const refund = await findRefundById(refundId);
    if (!refund) {
      return respondError(req, res, 404, "Refund request not found.");
    }

    const adminNote = String(req.body.admin_note || "").trim() || null;
    await updateRefundRequest(refundId, {
      status: "denied",
      admin_note: adminNote,
      denied_by: req.session.userId,
      denied_at: new Date(),
      failure_reason: null,
      failure_code: null,
    });

    await updateBookingDb(refund.bookingId, { payment_status: "refund_denied" });

    const booking = await findBookingDbById(refund.bookingId);
    if (booking && booking.userEmail) {
      const transaction = await findTransactionForBooking(refund.bookingId);
      const emailContent = buildRefundDecisionEmail({
        booking,
        refund,
        decision: "Denied",
        approvedAmount: 0,
        currency: transaction?.currency || "SGD",
        adminNote,
      });
      sendEmail({
        to: booking.userEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      }).catch((error) => {
        console.error("Refund email failed:", error.message);
      });
    }

    return respondOk(req, res, { ok: true, status: "denied" }, "/admin/refunds");
  } catch (error) {
    console.error("Refund denial failed:", error.message);
    return respondError(req, res, 500, "Refund denial failed.");
  }
}

module.exports = {
  renderDashboard,
  renderRooms,
  renderRoomCreate,
  addRoom,
  editRoom,
  removeRoom,
  renderBookings,
  addBooking,
  editBooking,
  removeBooking,
  renderMenu,
  renderMenuCreate,
  addMenuItem,
  editMenuItem,
  removeMenuItem,
  renderEvents,
  renderEventsCreate,
  addEvent,
  editEvent,
  removeEvent,
  renderPromotions,
  renderPromotionsCreate,
  addPromotion,
  editPromotion,
  removePromotion,
  renderReviews,
  renderReviewsCreate,
  addReview,
  editReview,
  removeReview,
  renderUsers,
  renderUsersCreate,
  addUser,
  editUser,
  removeUser,
  renderPurchases,
  renderUserPurchases,
  renderRefunds,
  listRefundsApi,
  approveRefund,
  denyRefund,
};
