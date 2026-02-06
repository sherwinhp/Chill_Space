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
  findMenuItemById,
} = require("../models/menuDbModel");
const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  updateEventSignupStatus,
} = require("../models/eventsDbModel");
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
  listTransactionsWithItemsByDateRange,
  getSalesSummary,
  listTransactionsWithItems,
  findTransactionForBooking,
  getTransactionByIdForAdmin,
  listBookingItemsForTransaction,
  restockMenuItemsForTransaction,
} = require("../models/transactionsModel");
const {
  reverseOrderCashbackForBookingIfRefunded,
  reverseTransactionCashbackIfExists,
} = require("../models/walletModel");
const { sendEmail } = require("../models/emailService");
const {
  listRefundRequests,
  listRefundRequestsByDateRange,
  findRefundById,
  updateRefundRequest,
} = require("../models/refundRequestsModel");
const {
  listComplianceFlags,
  listWatchlist,
  addWatchlistEntry,
  removeWatchlistEntry,
  resolveComplianceFlag,
} = require("../models/complianceModel");
const { listAuditLogs } = require("../models/auditLogModel");
const { refundOrder } = require("../services/paypalService");
const { refundPaymentIntent, retrieveCheckoutSession } = require("../services/stripe");
const { logAdminAction } = require("../services/auditService");

function parseStockQty(value) {
  if (value === undefined || value === null || value === "") return null;
  const qty = Number(value);
  if (!Number.isFinite(qty)) return null;
  return Math.max(0, Math.floor(qty));
}

const KYC_STATUSES = new Set([
  "unverified",
  "pending",
  "verified",
  "rejected",
  "blocked",
]);

function normalizeKycStatus(value, fallback = "unverified") {
  const normalized = String(value || "").trim().toLowerCase();
  return KYC_STATUSES.has(normalized) ? normalized : fallback;
}

function validateMenuPayload(body = {}) {
  const errors = [];
  const name = String(body.name || "").trim();
  if (!name) errors.push("Name is required.");
  const category = String(body.category || "").trim().toLowerCase();
  const allowedCategories = new Set(["food", "drink", "addon"]);
  if (!allowedCategories.has(category)) {
    errors.push("Category must be food, drink, or addon.");
  }
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    errors.push("Price must be greater than 0.");
  }
  return { ok: errors.length === 0, errors, payload: { name, category, price } };
}

function toDateTimeStart(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day} 00:00:00`;
}

function toDateTimeEnd(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day} 23:59:59`;
}

function csvEscape(value) {
  const safe = String(value ?? "");
  if (safe.includes('"') || safe.includes(",") || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

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
  await logAdminAction(req, "room.create", "room", null, payload.name || null);
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
  await logAdminAction(req, "room.update", "room", Number(req.params.id), updates.name || null);
  res.redirect("/admin/rooms");
}

async function removeRoom(req, res) {
  await deleteRoom(req.params.id);
  await logAdminAction(req, "room.delete", "room", Number(req.params.id), null);
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
  await logAdminAction(req, "booking.create", "booking", null, `user=${req.body.user_id}`);
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
  await logAdminAction(req, "booking.update", "booking", Number(req.params.id), null);
  res.redirect("/admin/bookings");
}

async function removeBooking(req, res) {
  await deleteBookingDb(req.params.id);
  await logAdminAction(req, "booking.delete", "booking", Number(req.params.id), null);
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
  const validation = validateMenuPayload(req.body);
  if (!validation.ok) {
    return res.status(400).send(validation.errors.join(" "));
  }
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  const category = validation.payload.category;
  const stockQty =
    category === "food" || category === "drink" ? parseStockQty(req.body.stock_qty) : null;
  await createMenuItem({
    name: validation.payload.name,
    category,
    price: validation.payload.price,
    description: req.body.description,
    image_url: imageUrl,
    is_available: req.body.is_available === "1",
    stock_qty: stockQty,
  });
  await logAdminAction(req, "menu.create", "menu_item", null, req.body.name || null);
  res.redirect("/admin/menu");
}

async function editMenuItem(req, res) {
  const validation = validateMenuPayload(req.body);
  if (!validation.ok) {
    return res.status(400).send(validation.errors.join(" "));
  }
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  const category = validation.payload.category;
  const stockQty =
    category === "food" || category === "drink" ? parseStockQty(req.body.stock_qty) : null;
  await updateMenuItem(req.params.id, {
    name: validation.payload.name,
    category,
    price: validation.payload.price,
    description: req.body.description,
    image_url: imageUrl,
    is_available: req.body.is_available === "1",
    stock_qty: stockQty,
  });
  await logAdminAction(req, "menu.update", "menu_item", Number(req.params.id), req.body.name || null);
  res.redirect("/admin/menu");
}

async function removeMenuItem(req, res) {
  await deleteMenuItem(req.params.id);
  await logAdminAction(req, "menu.delete", "menu_item", Number(req.params.id), null);
  res.redirect("/admin/menu");
}

async function incrementMenuItemStock(req, res) {
  const itemId = Number(req.params.id);
  if (!itemId) {
    return res.status(400).send("Invalid menu item.");
  }
  const item = await findMenuItemById(itemId);
  if (!item) {
    return res.status(404).send("Menu item not found.");
  }
  if (item.category !== "food" && item.category !== "drink") {
    return res.redirect("/admin/menu");
  }
  const currentQty = Number.isFinite(item.stockQty) ? item.stockQty : 0;
  const nextQty = currentQty + 1;
  await updateMenuItem(itemId, { stock_qty: nextQty });
  await logAdminAction(req, "menu.stock.increment", "menu_item", itemId, `qty=${nextQty}`);
  res.redirect("/admin/menu");
}

async function decrementMenuItemStock(req, res) {
  const itemId = Number(req.params.id);
  if (!itemId) {
    return res.status(400).send("Invalid menu item.");
  }
  const item = await findMenuItemById(itemId);
  if (!item) {
    return res.status(404).send("Menu item not found.");
  }
  if (item.category !== "food" && item.category !== "drink") {
    return res.redirect("/admin/menu");
  }
  const currentQty = Number.isFinite(item.stockQty) ? item.stockQty : 0;
  const nextQty = Math.max(0, currentQty - 1);
  await updateMenuItem(itemId, { stock_qty: nextQty });
  await logAdminAction(req, "menu.stock.decrement", "menu_item", itemId, `qty=${nextQty}`);
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
  await logAdminAction(req, "review.create", "review", result?.insertId || null, null);
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
  await logAdminAction(req, "review.update", "review", Number(req.params.id), null);
  res.redirect("/admin/reviews");
}

async function removeReview(req, res) {
  await Reviews.delete(req.params.id);
  await logAdminAction(req, "review.delete", "review", Number(req.params.id), null);
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
  const kycStatus = normalizeKycStatus(req.body.kyc_status);
  const kycCheckedAt = kycStatus !== "unverified" ? new Date() : null;
  await createUser({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    role: req.body.role || "user",
    is_active: req.body.is_active !== "0",
    kyc_status: kycStatus,
    kyc_checked_at: kycCheckedAt,
  });
  await logAdminAction(req, "user.create", "user", null, req.body.email || null);
  res.redirect("/admin/users");
}

async function editUser(req, res) {
  const existing = await findById(Number(req.params.id));
  if (!existing) {
    return res.status(404).send("User not found.");
  }
  const isSuperAdmin =
    String(existing.email || "").trim().toLowerCase() === "admin@admin.com";
  const nextKycStatus = normalizeKycStatus(req.body.kyc_status, existing.kyc_status);
  const kycChanged = nextKycStatus !== existing.kyc_status;
  const updates = {
    name: req.body.name,
    email: isSuperAdmin ? existing.email : req.body.email,
    password: req.body.password || undefined,
    role: isSuperAdmin ? existing.role : req.body.role,
    is_active: isSuperAdmin ? true : req.body.is_active !== "0",
  };
  if (kycChanged) {
    updates.kyc_status = nextKycStatus;
    updates.kyc_checked_at = new Date();
  }
  await updateUser(req.params.id, {
    ...updates,
  });
  await logAdminAction(req, "user.update", "user", Number(req.params.id), req.body.email || null);
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
  await logAdminAction(req, "user.delete", "user", Number(req.params.id), existing.email || null);
  res.redirect("/admin/users");
}

async function renderPurchases(req, res) {
  const { transactions, itemsByTransaction } = await listAllTransactionsWithItems(100);
  res.render("admin/purchases", { transactions, itemsByTransaction, user: null });
}

async function renderAdminInvoices(req, res) {
  const { transactions, itemsByTransaction } = await listAllTransactionsWithItems(200);
  res.render("admin/invoices", { transactions, itemsByTransaction });
}

async function renderAdminInvoice(req, res) {
  const invoiceId = Number(req.params.id);
  if (!invoiceId) {
    return res.status(400).send("Invalid invoice.");
  }

  const invoice = await getTransactionByIdForAdmin(invoiceId);
  if (!invoice) {
    return res.status(404).send("Invoice not found.");
  }

  return res.render("admin/invoice", { invoice });
}

async function renderTransactionLogs(req, res) {
  const [{ transactions, itemsByTransaction }, refunds] = await Promise.all([
    listAllTransactionsWithItems(200),
    listRefundRequests(),
  ]);

  const stats = computeUserStats(transactions, refunds);

  const incomingEntries = transactions.map((transaction) => {
    const items = itemsByTransaction[transaction.transaction_id] || [];
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const entry = {
      type: "IN",
      id: transaction.transaction_id,
      time: transaction.created_at,
      userName: transaction.user_name || "Unknown user",
      userEmail: transaction.user_email || "-",
      amount: Number(transaction.total_amount || 0),
      currency: transaction.currency || "SGD",
      status: transaction.status || "unknown",
      provider: transaction.provider || "manual",
      reference: transaction.provider_order_id || "",
      description: `Order #${transaction.transaction_id}`,
      itemCount: items.length,
      totalQty,
    };
    entry.analysis = buildFraudAnalysis(entry, stats);
    entry.searchText = [
      entry.type,
      entry.description,
      entry.userName,
      entry.userEmail,
      entry.status,
      entry.provider,
      entry.reference,
      entry.amount.toFixed(2),
      items.map((item) => item.item_name).join(" "),
      entry.analysis.reasons.join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    return entry;
  });

  const refundEntries = refunds.map((refund) => {
    const amount = Number(refund.approvedAmount || refund.requestedAmount || 0);
    const entry = {
      type: "OUT",
      id: refund.id,
      time: refund.approvedAt || refund.createdAt,
      userName: refund.user?.name || "Unknown user",
      userEmail: refund.user?.email || "-",
      amount,
      currency: refund.paymentCurrency || "SGD",
      status: refund.status || "pending",
      provider: refund.paymentProvider || refund.provider || "manual",
      reference: refund.refundProviderRef || refund.paymentProviderRef || refund.providerRef || "",
      description: refund.transactionId
        ? `Refund for Order #${refund.transactionId}`
        : `Refund for Booking #${refund.bookingId}`,
      itemCount: 0,
      totalQty: 0,
    };
    entry.analysis = buildFraudAnalysis(entry, stats);
    entry.searchText = [
      entry.type,
      entry.description,
      entry.userName,
      entry.userEmail,
      entry.status,
      entry.provider,
      entry.reference,
      entry.amount.toFixed(2),
      refund.reasonText,
      refund.userMessage,
      entry.analysis.reasons.join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    return entry;
  });

  const entries = [...incomingEntries, ...refundEntries].sort((a, b) => {
    const timeA = a.time ? new Date(a.time).getTime() : 0;
    const timeB = b.time ? new Date(b.time).getTime() : 0;
    return timeB - timeA;
  });

  const totals = entries.reduce(
    (acc, entry) => {
      if (entry.type === "IN") {
        acc.incomingCount += 1;
        acc.incomingTotal += entry.amount;
      } else {
        acc.outgoingCount += 1;
        acc.outgoingTotal += entry.amount;
      }
      return acc;
    },
    { incomingCount: 0, outgoingCount: 0, incomingTotal: 0, outgoingTotal: 0 }
  );

  res.render("admin/transaction-logs", {
    entries,
    totals,
  });
}

async function renderReports(req, res) {
  const from = toDateTimeStart(req.query.from);
  const to = toDateTimeEnd(req.query.to);
  const status = String(req.query.status || "all");
  const provider = String(req.query.provider || "all");

  const [{ transactions, itemsByTransaction }, refunds] = await Promise.all([
    listTransactionsWithItemsByDateRange({ from, to, status }),
    listRefundRequestsByDateRange({ from, to }),
  ]);

  let filtered = transactions;
  if (provider !== "all") {
    filtered = transactions.filter((transaction) => transaction.provider === provider);
  }

  const filteredIds = new Set(filtered.map((transaction) => transaction.transaction_id));
  const filteredItemsByTransaction = {};
  filteredIds.forEach((id) => {
    filteredItemsByTransaction[id] = itemsByTransaction[id] || [];
  });

  const completed = filtered.filter(
    (transaction) => String(transaction.status || "").toUpperCase() === "COMPLETED"
  );
  const grossRevenue = completed.reduce(
    (sum, transaction) => sum + Number(transaction.total_amount || 0),
    0
  );
  const orderCount = completed.length;
  const avgOrder = orderCount ? grossRevenue / orderCount : 0;

  const approvedRefunds = refunds.filter((refund) => refund.status === "approved");
  const refundTotal = approvedRefunds.reduce(
    (sum, refund) => sum + Number(refund.approvedAmount || refund.requestedAmount || 0),
    0
  );

  const providerStats = {};
  completed.forEach((transaction) => {
    const key = transaction.provider || "unknown";
    if (!providerStats[key]) {
      providerStats[key] = { count: 0, revenue: 0 };
    }
    providerStats[key].count += 1;
    providerStats[key].revenue += Number(transaction.total_amount || 0);
  });

  const itemStats = new Map();
  Object.values(filteredItemsByTransaction).forEach((items) => {
    items.forEach((item) => {
      const key = item.item_name || "Unknown item";
      if (!itemStats.has(key)) {
        itemStats.set(key, { name: key, qty: 0, revenue: 0 });
      }
      const entry = itemStats.get(key);
      entry.qty += Number(item.qty || 0);
      entry.revenue += Number(item.subtotal || 0);
    });
  });
  const topItems = Array.from(itemStats.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  res.render("admin/reports", {
    filters: { from: req.query.from || "", to: req.query.to || "", status, provider },
    transactions: filtered,
    itemsByTransaction: filteredItemsByTransaction,
    totals: {
      grossRevenue,
      orderCount,
      avgOrder,
      refundTotal,
      netRevenue: grossRevenue - refundTotal,
    },
    providerStats,
    topItems,
    refunds: approvedRefunds.slice(0, 12),
  });
}

async function exportReportsCsv(req, res) {
  const from = toDateTimeStart(req.query.from);
  const to = toDateTimeEnd(req.query.to);
  const status = String(req.query.status || "all");
  const provider = String(req.query.provider || "all");

  const [{ transactions, itemsByTransaction }, refunds] = await Promise.all([
    listTransactionsWithItemsByDateRange({ from, to, status }),
    listRefundRequestsByDateRange({ from, to }),
  ]);

  let filtered = transactions;
  if (provider !== "all") {
    filtered = transactions.filter((transaction) => transaction.provider === provider);
  }

  const rows = [];
  rows.push([
    "type",
    "id",
    "date",
    "user",
    "email",
    "status",
    "provider",
    "amount",
    "currency",
    "items",
  ]);

  filtered.forEach((transaction) => {
    const items = itemsByTransaction[transaction.transaction_id] || [];
    const itemSummary = items.map((item) => `${item.item_name} x${item.qty}`).join(" | ");
    rows.push([
      "transaction",
      transaction.transaction_id,
      transaction.created_at,
      transaction.user_name || "-",
      transaction.user_email || "-",
      transaction.status || "-",
      transaction.provider || "-",
      Number(transaction.total_amount || 0).toFixed(2),
      transaction.currency || "SGD",
      itemSummary,
    ]);
  });

  refunds.forEach((refund) => {
    rows.push([
      "refund",
      refund.id,
      refund.createdAt,
      refund.user?.name || "-",
      refund.user?.email || "-",
      refund.status || "-",
      refund.provider || "-",
      Number(refund.approvedAmount || refund.requestedAmount || 0).toFixed(2),
      refund.paymentCurrency || "SGD",
      refund.transactionId ? `Order #${refund.transactionId}` : `Booking #${refund.bookingId}`,
    ]);
  });

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=\"sales-report.csv\"");
  res.send(csv);
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
  transaction,
  refund,
  decision,
  approvedAmount,
  currency,
  adminNote,
}) {
  const propertyName = process.env.PROPERTY_NAME || "Chill Space";
  const { supportEmail, supportPhone } = getSupportContact();

  if (transaction) {
    const totalPaid = formatCurrency(transaction.total_amount || 0, currency);
    const approvedValue =
      decision === "Approved" ? formatCurrency(approvedAmount, currency) : null;

    const supportLines = [];
    if (supportEmail) supportLines.push(`Email: ${supportEmail}`);
    if (supportPhone) supportLines.push(`Phone: ${supportPhone}`);

    const subject = `Refund ${decision}: Order ${transaction.transaction_id}`;
    const textParts = [
      `Hello ${transaction.user_name || "Guest"},`,
      "",
      `Your refund request for order #${transaction.transaction_id} has been ${decision.toLowerCase()}.`,
      "",
      `Property: ${propertyName}`,
      `Order date: ${formatDate(transaction.created_at)}`,
      `Payment method: ${transaction.provider || "-"}`,
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
        <p style="margin-top: 0;">Hello ${escapeHtml(transaction.user_name || "Guest")},</p>
        <p>Your refund request for order <strong>#${escapeHtml(
          transaction.transaction_id
        )}</strong> has been <strong>${escapeHtml(decision.toLowerCase())}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
          <tr><td style="padding: 6px 0;">Property</td><td style="padding: 6px 0;"><strong>${escapeHtml(
            propertyName
          )}</strong></td></tr>
          <tr><td style="padding: 6px 0;">Order date</td><td style="padding: 6px 0;">${escapeHtml(
            formatDate(transaction.created_at)
          )}</td></tr>
          <tr><td style="padding: 6px 0;">Payment method</td><td style="padding: 6px 0;">${escapeHtml(
            transaction.provider || "-"
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

function buildUserKey(userEmail, userName) {
  const raw = String(userEmail || userName || "unknown").trim().toLowerCase();
  return raw || "unknown";
}

function ensureUserStats(map, key) {
  if (!map.has(key)) {
    map.set(key, {
      transactions: 0,
      refunds: 0,
      approvedRefunds: 0,
      refundTotal: 0,
      transactionTimes: [],
    });
  }
  return map.get(key);
}

function computeUserStats(transactions, refunds) {
  const stats = new Map();
  transactions.forEach((transaction) => {
    const key = buildUserKey(transaction.user_email, transaction.user_name);
    const entry = ensureUserStats(stats, key);
    entry.transactions += 1;
    if (transaction.created_at) {
      const time = new Date(transaction.created_at);
      if (!Number.isNaN(time.getTime())) {
        entry.transactionTimes.push(time);
      }
    }
  });

  refunds.forEach((refund) => {
    const key = buildUserKey(refund.user?.email, refund.user?.name);
    const entry = ensureUserStats(stats, key);
    entry.refunds += 1;
    if (refund.status === "approved") {
      entry.approvedRefunds += 1;
      entry.refundTotal += Number(refund.approvedAmount || refund.requestedAmount || 0);
    }
  });

  return stats;
}

function buildFraudAnalysis(entry, stats) {
  const reasons = [];
  let score = 0;
  const amount = Number(entry.amount || 0);
  const key = buildUserKey(entry.userEmail, entry.userName);
  const userStats = stats.get(key) || {
    transactions: 0,
    refunds: 0,
    approvedRefunds: 0,
    refundTotal: 0,
    transactionTimes: [],
  };

  if (amount >= 500) {
    score += 35;
    reasons.push("High amount");
  } else if (amount >= 200) {
    score += 20;
    reasons.push("Above average amount");
  }

  if (entry.type === "IN") {
    if (entry.itemCount >= 5) {
      score += 10;
      reasons.push("Many items");
    }
    if (entry.totalQty >= 8) {
      score += 10;
      reasons.push("High quantity");
    }
    if (entry.provider === "manual") {
      score += 20;
      reasons.push("Manual payment");
    }
    if (!entry.reference) {
      score += 10;
      reasons.push("Missing payment reference");
    }
    if (userStats.refunds >= 2) {
      score += 15;
      reasons.push("Multiple refunds");
    }
    if (userStats.refunds >= 4) {
      score += 10;
      reasons.push("Frequent refunds");
    }
    const entryTime = entry.time ? new Date(entry.time) : null;
    if (entryTime && !Number.isNaN(entryTime.getTime())) {
      const recentCount = userStats.transactionTimes.filter(
        (time) => entryTime - time <= 60 * 60 * 1000 && entryTime - time >= 0
      ).length;
      if (recentCount >= 3) {
        score += 15;
        reasons.push("Multiple orders in 1 hour");
      }
    }
    if (String(entry.status || "").toUpperCase() !== "COMPLETED") {
      score += 8;
      reasons.push("Non-completed status");
    }
  } else {
    score += 12;
    reasons.push("Refund request");
    if (entry.status === "pending") {
      score += 10;
      reasons.push("Pending refund");
    }
    if (!entry.reference) {
      score += 12;
      reasons.push("Missing payment reference");
    }
    if (userStats.refunds >= 2) {
      score += 12;
      reasons.push("Multiple refunds");
    }
    if (userStats.transactions <= 1) {
      score += 8;
      reasons.push("Low purchase history");
    }
  }

  score = Math.min(100, Math.round(score));
  const level = score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";
  if (!reasons.length) reasons.push("No unusual signals");
  return { score, level, reasons };
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

    const isTransactionRefund = !refund.bookingId && refund.transactionId;
    if (isTransactionRefund) {
      const transaction = await getTransactionByIdForAdmin(refund.transactionId);
      if (!transaction) {
        return respondError(req, res, 404, "Order not found.");
      }

      const total = Number(transaction.total_amount || 0);
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

      const currency = transaction.currency || "SGD";
      const provider = transaction.provider || "manual";
      const providerRef = transaction.provider_order_id || null;
      let manualNote = null;
      let refundProviderRef = null;

      if (!providerRef) {
        manualNote = "Manual refund required. Payment reference not found.";
      } else if (provider === "paypal") {
        try {
          const refundResult = await refundOrder(providerRef, {
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
          const intentId = providerRef.replace("STRIPE-CARD-", "");
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
          const sessionId = providerRef.replace("STRIPE-GRABPAY-", "");
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
      await logAdminAction(
        req,
        "refund.approve",
        "refund",
        refundId,
        `amount=${approvedAmount}`
      );

      const bookingItems = await listBookingItemsForTransaction(transaction.transaction_id);
      await Promise.all(
        bookingItems.map((booking) =>
          updateBookingDb(booking.bookingId, {
            payment_status: isPartial ? "partially_refunded" : "refunded",
          })
        )
      );

      if (!isPartial && Array.isArray(transaction.items)) {
        const eventItems = transaction.items.filter(
          (item) => item.item_type === "event" && item.item_id
        );
        await Promise.all(
          eventItems.map((item) =>
            updateEventSignupStatus(item.item_id, transaction.user_id, "refunded")
          )
        );
      }

      if (!isPartial) {
        restockMenuItemsForTransaction(transaction.transaction_id).catch((error) => {
          console.error("Menu restock failed:", error.message);
        });
      }

      reverseTransactionCashbackIfExists(transaction.transaction_id).catch((error) => {
        console.error("Cashback reversal failed:", error.message);
      });

      if (transaction.user_email) {
        const emailContent = buildRefundDecisionEmail({
          transaction,
          refund,
          decision: "Approved",
          approvedAmount,
          currency,
          adminNote: adminNoteInput,
        });
        sendEmail({
          to: transaction.user_email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        }).catch((error) => {
          console.error("Refund email failed:", error.message);
        });
      }

      return respondOk(req, res, { ok: true, status: "approved" }, "/admin/refunds");
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
    await logAdminAction(
      req,
      "refund.approve",
      "refund",
      refundId,
      `amount=${approvedAmount}`
    );
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

    const isTransactionRefund = !refund.bookingId && refund.transactionId;
    if (isTransactionRefund) {
      const adminNote = String(req.body.admin_note || "").trim() || null;
      await updateRefundRequest(refundId, {
        status: "denied",
        admin_note: adminNote,
        denied_by: req.session.userId,
        denied_at: new Date(),
        failure_reason: null,
        failure_code: null,
      });
      await logAdminAction(req, "refund.deny", "refund", refundId, adminNote);

      const transaction = await getTransactionByIdForAdmin(refund.transactionId);
      if (transaction) {
        const bookingItems = await listBookingItemsForTransaction(transaction.transaction_id);
        await Promise.all(
          bookingItems.map((booking) =>
            updateBookingDb(booking.bookingId, { payment_status: "refund_denied" })
          )
        );

        if (transaction.user_email) {
          const emailContent = buildRefundDecisionEmail({
            transaction,
            refund,
            decision: "Denied",
            approvedAmount: 0,
            currency: transaction.currency || "SGD",
            adminNote,
          });
          sendEmail({
            to: transaction.user_email,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
          }).catch((error) => {
            console.error("Refund email failed:", error.message);
          });
        }
      }

      return respondOk(req, res, { ok: true, status: "denied" }, "/admin/refunds");
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
    await logAdminAction(req, "refund.deny", "refund", refundId, adminNote);

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

async function renderCompliance(req, res) {
  const statusFilter = String(req.query.status || "open");
  const [flags, watchlist, auditLogs] = await Promise.all([
    listComplianceFlags({ status: statusFilter, limit: 200 }),
    listWatchlist(),
    listAuditLogs({ limit: 200 }),
  ]);
  res.render("admin/compliance", { flags, watchlist, auditLogs, statusFilter });
}

async function addWatchlist(req, res) {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const contact = String(req.body.contact_number || "").trim();
  const reason = String(req.body.reason || "").trim();
  if (!name && !email && !contact) {
    return res.status(400).send("Provide at least one identifier.");
  }
  await addWatchlistEntry({
    name: name || null,
    email: email || null,
    contact_number: contact || null,
    reason: reason || null,
  });
  await logAdminAction(req, "watchlist.add", "watchlist", null, `email=${email}`);
  res.redirect("/admin/compliance");
}

async function removeWatchlist(req, res) {
  const watchId = Number(req.params.id);
  if (!Number.isFinite(watchId)) {
    return res.status(400).send("Invalid watchlist entry.");
  }
  await removeWatchlistEntry(watchId);
  await logAdminAction(req, "watchlist.remove", "watchlist", watchId, null);
  res.redirect("/admin/compliance");
}

async function resolveCompliance(req, res) {
  const flagId = Number(req.params.id);
  if (!Number.isFinite(flagId)) {
    return res.status(400).send("Invalid flag.");
  }
  await resolveComplianceFlag(flagId, req.session.userId);
  await logAdminAction(req, "compliance.resolve", "compliance_flag", flagId, null);
  res.redirect("/admin/compliance");
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
  incrementMenuItemStock,
  decrementMenuItemStock,
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
  renderAdminInvoices,
  renderAdminInvoice,
  renderTransactionLogs,
  renderReports,
  exportReportsCsv,
  renderCompliance,
  addWatchlist,
  removeWatchlist,
  resolveCompliance,
  renderUserPurchases,
  renderRefunds,
  listRefundsApi,
  approveRefund,
  denyRefund,
};
