const { listEvents, createEvent, updateEvent, deleteEvent, getEventById } = require("../models/eventsDbModel");
const { addCartItem, listCartItems, migrateSessionCartToUser } = require("../models/cartModel");
const db = require("../db");
const { logAdminAction } = require("../services/auditService");

function getOwner(req) {
  const userId = req.session ? req.session.userId : null;
  const sessionId = req.cartSid || null;
  return { userId, sessionId };
}

function ensureAdmin(req, res) {
  if (!req.session || req.session.role !== "admin") {
    res.status(403).send("Admins only");
    return false;
  }
  return true;
}

function parsePax(value) {
  const pax = Number(value);
  if (!Number.isFinite(pax) || pax <= 0) return 1;
  return Math.min(99, Math.floor(pax));
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalIsoDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return null;
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function renderEvents(req, res) {
  try {
    const events = await listEvents();
    const upcomingOnly = (events || []).filter((event) => {
      const endYmd = toLocalIsoDate(event.endDate || event.startDate);
      if (!endYmd) return true;
      return endYmd >= todayIsoDate();
    });

    // Show soonest events first (closest date at the top).
    upcomingOnly.sort((a, b) => {
      const aYmd = toLocalIsoDate(a.startDate) || "9999-12-31";
      const bYmd = toLocalIsoDate(b.startDate) || "9999-12-31";
      if (aYmd < bYmd) return -1;
      if (aYmd > bYmd) return 1;
      const aTitle = String(a.title || "");
      const bTitle = String(b.title || "");
      return aTitle.localeCompare(bTitle);
    });

    const { listVisiblePromotions } = require("./promotionsController");
    const promotions = await listVisiblePromotions({ userId: req.session ? req.session.userId : null });
    res.render("events", { events: upcomingOnly, promotions });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load events.");
  }
}

// POST /events/:id/signup
// Paid events: add entry fee line into cart, no pending signup record.
// Free events: create signup record immediately.
async function signup(req, res) {
  try {
    const eventId = Number(req.params.id);
    if (!eventId) return res.status(400).json({ error: "Invalid event." });

    const { userId, sessionId } = getOwner(req);
    if (!userId) return res.status(401).json({ error: "Please login to sign up." });
    if (userId && sessionId) {
      await migrateSessionCartToUser(sessionId, userId);
    }

    const pax = parsePax(req.body?.pax);
    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found." });

    const capacity = Number(event.capacity || 0);
    const spotsLeft = typeof event.spotsLeft === "number" ? event.spotsLeft : null;
    if (capacity > 0 && typeof spotsLeft === "number" && pax > spotsLeft) {
      return res.status(409).json({ error: "Event is full." });
    }

    const entryFee = Number(event.entryFee || 0);
    if (entryFee > 0) {
      await addCartItem({
        userId,
        sessionId,
        type: "event",
        itemId: eventId,
        name: `Event entry: ${event.title}`,
        price: entryFee,
        qty: pax,
        details: `event_signup:${eventId}`,
      });
      const items = await listCartItems({ userId, sessionId });
      return res.json({ ok: true, message: "Sign up successful, added to cart.", items });
    }

    // Free event -> record immediately as paid (no payment needed).
    await db.query(
      `
        INSERT INTO event_signups (event_id, user_id, pax, payment_status)
        VALUES (?, ?, ?, 'paid')
        ON DUPLICATE KEY UPDATE pax = VALUES(pax), payment_status = 'paid'
      `,
      [eventId, userId, pax]
    );
    return res.json({ ok: true, message: "Signed up successfully." });
  } catch (error) {
    console.error("Event signup failed:", error.message);
    res.status(500).json({ error: "Unable to sign up. Please try again." });
  }
}

// ===================== Admin: Events CRUD =====================
async function adminList(req, res) {
  if (!ensureAdmin(req, res)) return;
  const events = await listEvents();
  res.render("admin/events", { events });
}

async function adminCreateForm(req, res) {
  if (!ensureAdmin(req, res)) return;
  res.render("admin/events-create");
}

async function adminCreate(req, res) {
  if (!ensureAdmin(req, res)) return;
  const validation = validateEventPayload(req.body);
  if (!validation.ok) {
    return res.status(400).send(validation.errors.join(" "));
  }
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createEvent({
    title: validation.payload.title,
    description: validation.payload.description,
    event_date: validation.payload.event_date,
    end_date: validation.payload.end_date,
    image_url: imageUrl,
    capacity: validation.payload.capacity,
    entry_fee: validation.payload.entry_fee,
  });
  await logAdminAction(req, "event.create", "event", null, req.body.title || null);
  res.redirect("/admin/events");
}

function parseDateInput(value) {
  if (!value) return null;
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return null;
  return value;
}

function validateEventPayload(body = {}) {
  const errors = [];
  const title = String(body.title || "").trim();
  if (!title) errors.push("Title is required.");
  const eventDate = parseDateInput(body.event_date);
  if (!eventDate) errors.push("Event date is required.");
  const endDate = parseDateInput(body.end_date || body.event_date);
  if (!endDate) errors.push("End date is required.");
  if (eventDate && endDate && new Date(endDate) < new Date(eventDate)) {
    errors.push("End date must be on or after start date.");
  }
  const capacityRaw = body.capacity;
  const capacity = capacityRaw === "" || capacityRaw === null ? null : Number(capacityRaw);
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
    errors.push("Capacity must be a positive number.");
  }
  const entryFeeRaw = body.entry_fee;
  const entryFee = entryFeeRaw === "" || entryFeeRaw === null ? 0 : Number(entryFeeRaw);
  if (!Number.isFinite(entryFee) || entryFee < 0) {
    errors.push("Entry fee must be 0 or greater.");
  }
  const description = String(body.description || "").trim();

  return {
    ok: errors.length === 0,
    errors,
    payload: {
      title,
      description,
      event_date: eventDate,
      end_date: endDate,
      capacity,
      entry_fee: entryFee,
    },
  };
}

async function adminEdit(req, res) {
  if (!ensureAdmin(req, res)) return;
  const validation = validateEventPayload(req.body);
  if (!validation.ok) {
    return res.status(400).send(validation.errors.join(" "));
  }
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updateEvent(req.params.id, {
    title: validation.payload.title,
    description: validation.payload.description,
    event_date: validation.payload.event_date,
    end_date: validation.payload.end_date,
    image_url: imageUrl,
    capacity: validation.payload.capacity,
    entry_fee: validation.payload.entry_fee,
  });
  await logAdminAction(req, "event.update", "event", Number(req.params.id), req.body.title || null);
  res.redirect("/admin/events");
}

async function adminDelete(req, res) {
  if (!ensureAdmin(req, res)) return;
  await deleteEvent(req.params.id);
  await logAdminAction(req, "event.delete", "event", Number(req.params.id), null);
  res.redirect("/admin/events");
}

// GET /admin/events/:id/participants
async function adminParticipants(req, res) {
  if (!ensureAdmin(req, res)) return;
  const eventId = Number(req.params.id);
  if (!eventId) return res.status(400).send("Invalid event.");

  const event = await getEventById(eventId);
  if (!event) return res.status(404).send("Event not found.");

  const rows = await db.query(
    `
      SELECT es.signup_id, es.pax, es.payment_status, es.created_at, u.user_id, u.name, u.email
      FROM event_signups es
      JOIN users u ON u.user_id = es.user_id
      WHERE es.event_id = ?
      ORDER BY es.created_at DESC
    `,
    [eventId]
  );

  res.render("admin/event-participants", { event, participants: rows });
}

// POST /admin/events/:id/signups/:signupId/delete
async function adminRemoveParticipant(req, res) {
  if (!ensureAdmin(req, res)) return;
  const eventId = Number(req.params.id);
  const signupId = Number(req.params.signupId);
  if (!eventId || !signupId) return res.status(400).send("Invalid request.");

  await db.query("DELETE FROM event_signups WHERE signup_id = ? AND event_id = ?", [
    signupId,
    eventId,
  ]);
  res.redirect(`/admin/events/${eventId}/participants`);
}

module.exports = {
  renderEvents,
  signup,
  adminList,
  adminCreateForm,
  adminCreate,
  adminEdit,
  adminDelete,
  adminParticipants,
  adminRemoveParticipant,
};
