const db = require("../db");
const { listPromotions, createPromotion, updatePromotion, deletePromotion } = require("../models/promotionsDbModel");
const { addCartItem, listCartItems, migrateSessionCartToUser } = require("../models/cartModel");

function getOwner(req) {
  const userId = req.session ? req.session.userId : null;
  const sessionId = req.cartSid || null;
  return { userId, sessionId };
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function promotionRuleFromCode(codeRaw) {
  const code = normalizeCode(codeRaw);
  if (code.includes("FIRST")) return "first";
  if (code.includes("WEEKDAY")) return "weekday";
  if (code.includes("WEEKEND")) return "weekend";
  if (code.includes("HAPPY")) return "happy";
  return "any";
}

function getSingaporeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });
  return map;
}

function getSingaporeYmd() {
  const parts = getSingaporeParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toSingaporeYmd(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return null;
  const parts = getSingaporeParts(dateValue);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isBetweenYmd(ymd, startYmd, endYmd) {
  if (!ymd) return false;
  if (startYmd && ymd < startYmd) return false;
  if (endYmd && ymd > endYmd) return false;
  return true;
}

function isWeekdayMonThuSingapore() {
  const weekday = String(getSingaporeParts().weekday || "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3); // Mon/Tue/Wed/Thu/Fri/Sat/Sun
  return weekday === "Mon" || weekday === "Tue" || weekday === "Wed" || weekday === "Thu";
}

function isFridaySingapore() {
  const weekday = String(getSingaporeParts().weekday || "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3);
  return weekday === "Fri";
}

function isWeekendSatSunSingapore() {
  const weekday = String(getSingaporeParts().weekday || "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3); // Mon/Tue/Wed/Thu/Fri/Sat/Sun
  // Treat "weekend specials" as Fri-Sun (common retail convention).
  return weekday === "Fri" || weekday === "Sat" || weekday === "Sun";
}

function isHappyHourSingapore() {
  const startHour = Number(process.env.HAPPY_HOUR_START || 14);
  const endHour = Number(process.env.HAPPY_HOUR_END || 18);
  const hour = Number(getSingaporeParts().hour || 0);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // wrap-around (e.g. 22 -> 2)
  return hour >= startHour || hour < endHour;
}

function isPromoVisibleNow(promo) {
  if (promo && promo.isHidden) return false;
  return isPromoEligibleNow(promo);
}

function isPromoEligibleNow(promo) {
  const code = normalizeCode(promo.code);
  const today = getSingaporeYmd();
  const startYmd = toSingaporeYmd(promo.startDate);
  const endYmd = toSingaporeYmd(promo.endDate);
  if (!isBetweenYmd(today, startYmd, endYmd)) return false;

  if (code.includes("WEEKDAY")) return isWeekdayMonThuSingapore();
  if (code.includes("FRIDAY")) return isFridaySingapore();
  if (code.includes("WEEKEND")) return isWeekendSatSunSingapore();
  if (code.includes("HAPPY")) return isHappyHourSingapore();
  return true;
}

function promotionLifecycleStatus(promo) {
  const today = getSingaporeYmd();
  const startYmd = toSingaporeYmd(promo.startDate);
  const endYmd = toSingaporeYmd(promo.endDate);
  if (startYmd && today < startYmd) return "scheduled";
  if (endYmd && today > endYmd) return "expired";
  return "active";
}

async function listVisiblePromotions() {
  const promos = await listPromotions();
  return (promos || []).filter((promo) => !promo.isHidden && isPromoEligibleNow(promo));
}

async function getPromoRedemptions() {
  // Redemptions are stored as transaction_items lines with details 'promo:CODE'
  // and are considered "redeemed" only when the transaction is COMPLETED.
  const rows = await db.query(
    `
      SELECT
        REPLACE(ti.details, 'promo:', '') AS promo_code,
        t.id AS transaction_id,
        t.user_id,
        t.time AS used_at,
        u.name,
        u.email
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      JOIN users u ON u.user_id = t.user_id
      WHERE t.status = 'COMPLETED'
        AND ti.details LIKE 'promo:%'
      ORDER BY t.time DESC
    `
  );
  return Array.isArray(rows) ? rows : [];
}

function buildRedemptionStats(rows) {
  const statsByCode = new Map();
  rows.forEach((row) => {
    const code = normalizeCode(row.promo_code);
    if (!code) return;
    if (!statsByCode.has(code)) {
      statsByCode.set(code, {
        redeemedCount: 0,
        users: new Set(),
        lastRedeemedAt: null,
        recentRedeemers: [],
      });
    }
    const stat = statsByCode.get(code);
    stat.redeemedCount += 1;
    stat.users.add(Number(row.user_id));
    if (!stat.lastRedeemedAt) stat.lastRedeemedAt = row.used_at;
    if (stat.recentRedeemers.length < 8) {
      stat.recentRedeemers.push({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        usedAt: row.used_at,
        transactionId: row.transaction_id,
      });
    }
  });

  const out = {};
  for (const [code, stat] of statsByCode.entries()) {
    out[code] = {
      redeemedCount: stat.redeemedCount,
      redeemedUsers: stat.users.size,
      lastRedeemedAt: stat.lastRedeemedAt,
      recentRedeemers: stat.recentRedeemers,
    };
  }
  return out;
}

// ===================== Admin (reuses existing admin views) =====================
async function adminList(req, res) {
  const promotions = await listPromotions();
  let redemptionRows = [];
  try {
    redemptionRows = await getPromoRedemptions();
  } catch (error) {
    if (error && error.code !== "ER_NO_SUCH_TABLE") {
      console.error("Promo redemption lookup failed:", error.message);
    }
  }
  const stats = buildRedemptionStats(redemptionRows);
  const enriched = (promotions || []).map((promo) => {
    const code = normalizeCode(promo.code);
    const stat = stats[code] || {
      redeemedCount: 0,
      redeemedUsers: 0,
      lastRedeemedAt: null,
      recentRedeemers: [],
    };
    const eligibleNow = isPromoEligibleNow(promo);
    return {
      ...promo,
      rule: promotionRuleFromCode(promo.code),
      eligibleNow,
      visibleNow: !promo.isHidden && eligibleNow,
      adminStatus: promotionLifecycleStatus(promo),
      ...stat,
    };
  });
  res.render("admin/promotions", { promotions: enriched });
}

async function adminCreateForm(req, res) {
  res.render("admin/promotions-create");
}

async function adminCreate(req, res) {
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
    is_hidden: String(req.body.is_hidden || "0") === "1",
  });
  res.redirect("/admin/promotions");
}

async function adminEdit(req, res) {
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
    is_hidden: String(req.body.is_hidden || "0") === "1",
  });
  res.redirect("/admin/promotions");
}

async function adminDelete(req, res) {
  await deletePromotion(req.params.id);
  res.redirect("/admin/promotions");
}

async function removePromoItems({ userId, sessionId }) {
  if (!userId && !sessionId) return;
  const params = [];
  let where = "details LIKE 'promo:%'";
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  await db.query(`DELETE FROM cart_items WHERE ${where}`, params);
}

function computeCartSubtotalCents(items) {
  return (items || []).reduce((sum, item) => {
    const priceCents = Math.round(Number(item.price) * 100);
    const qty = Number(item.qty || 1);
    // ignore promo lines (they are negative and represent discounts)
    if (String(item.details || "").startsWith("promo:")) return sum;
    return sum + priceCents * qty;
  }, 0);
}

async function userHasCompletedPurchase(userId) {
  const rows = await db.query(
    "SELECT COUNT(*) AS cnt FROM transactions WHERE user_id = ? AND status = 'COMPLETED'",
    [userId]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function getUserCreatedAt(userId) {
  const rows = await db.query("SELECT created_at FROM users WHERE user_id = ? LIMIT 1", [userId]);
  return rows.length ? rows[0].created_at : null;
}

function daysSinceSingapore(dateValue) {
  const todayYmd = getSingaporeYmd();
  const createdYmd = toSingaporeYmd(dateValue);
  if (!createdYmd) return null;
  // date-only diff in days (safe lexical -> Date conversion)
  const today = new Date(`${todayYmd}T00:00:00`);
  const created = new Date(`${createdYmd}T00:00:00`);
  const diffMs = today.getTime() - created.getTime();
  return Math.floor(diffMs / 86400000);
}

// POST /promotions/apply  { code }
async function apply(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) return res.status(401).json({ error: "Please login to use promotions." });
    if (userId && sessionId) {
      await migrateSessionCartToUser(sessionId, userId);
    }

    const code = normalizeCode(req.body?.code);
    if (!code) return res.status(400).json({ error: "Enter a promo code." });

    const promos = await listPromotions();
    const promo = (promos || []).find((entry) => normalizeCode(entry.code) === code);
    if (!promo) return res.status(404).json({ error: "Promo code not found." });
    if (promo.isHidden) return res.status(400).json({ error: "This promo is currently hidden." });
    if (!isPromoVisibleNow(promo)) {
      return res.status(400).json({ error: "This promo is not available right now." });
    }

    if (code.includes("FIRST") || code.includes("WELCOME")) {
      // "Welcome" promos should be for newly created accounts, and also only for the first purchase.
      const [hasHistory, createdAt] = await Promise.all([
        userHasCompletedPurchase(userId),
        getUserCreatedAt(userId),
      ]);
      if (hasHistory) {
        return res.status(400).json({ error: "This promo is only for first-time purchases." });
      }
      const welcomeDays = Number(process.env.WELCOME_DAYS || 7);
      const ageDays = daysSinceSingapore(createdAt);
      if (!Number.isFinite(welcomeDays) || welcomeDays <= 0) {
        return res.status(500).json({ error: "Welcome promo is misconfigured." });
      }
      if (ageDays === null) {
        return res.status(400).json({ error: "Unable to verify account age for this promo." });
      }
      if (ageDays > welcomeDays) {
        return res.status(400).json({ error: `This promo is only for new accounts (within ${welcomeDays} days).` });
      }
    }

    await removePromoItems({ userId, sessionId: null });
    const itemsBefore = await listCartItems({ userId, sessionId: null });
    const subtotalCents = computeCartSubtotalCents(itemsBefore);
    if (subtotalCents <= 0) return res.status(400).json({ error: "Your cart is empty." });

    const minTotalCents = Math.round(Number(promo.minTotal || 0) * 100);
    if (subtotalCents < minTotalCents) {
      return res.status(400).json({
        error: `Minimum spend is $${Number(promo.minTotal || 0).toFixed(2)}.`,
      });
    }

    const discountPercent = Number(promo.discountPercent || 0);
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
      return res.status(400).json({ error: "Invalid promo configuration." });
    }
    const discountCents = Math.max(0, Math.round((subtotalCents * discountPercent) / 100));
    if (discountCents <= 0) return res.status(400).json({ error: "Discount amount is zero." });

    await addCartItem({
      userId,
      sessionId: null,
      type: "menu",
      itemId: null,
      name: `Promo: ${promo.title} (${promo.code})`,
      price: Number((-discountCents / 100).toFixed(2)),
      qty: 1,
      details: `promo:${promo.code}`,
      roomId: null,
    });

    const items = await listCartItems({ userId, sessionId: null });
    return res.json({ ok: true, message: `Promo applied: ${promo.code}`, items });
  } catch (error) {
    console.error("Promo apply failed:", error.message);
    res.status(500).json({ error: "Unable to apply promo. Please try again." });
  }
}

// POST /promotions/remove
async function remove(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) return res.status(401).json({ error: "Please login to use promotions." });
    if (userId && sessionId) {
      await migrateSessionCartToUser(sessionId, userId);
    }
    await removePromoItems({ userId, sessionId: null });
    const items = await listCartItems({ userId, sessionId: null });
    return res.json({ ok: true, message: "Promo removed.", items });
  } catch (error) {
    console.error("Promo remove failed:", error.message);
    res.status(500).json({ error: "Unable to remove promo. Please try again." });
  }
}

module.exports = {
  listVisiblePromotions,
  apply,
  remove,
  adminList,
  adminCreateForm,
  adminCreate,
  adminEdit,
  adminDelete,
};
