require("dotenv").config();
const crypto = require("crypto");
let Stripe;
try {
  Stripe = require("stripe");
} catch (error) {
  Stripe = null;
}

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET && Stripe ? new Stripe(STRIPE_SECRET) : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const FAILED_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_PER_CARD = 5;
const MAX_FAILED_PER_USER = 5;
const failedByCard = new Map();
const failedByUser = new Map();

const CARD_HASH_SECRET =
  process.env.CARD_HASH_SECRET || process.env.STRIPE_SECRET_KEY || "local_card_secret";

function toStripeAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function normalizePan(value) {
  return String(value || "").replace(/\D/g, "");
}

function maskPan(value) {
  const digits = normalizePan(value);
  if (!digits) return "";
  const last4 = digits.slice(-4);
  return `**** **** **** ${last4}`;
}

function luhnCheck(number) {
  const digits = normalizePan(number);
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectCardBrand(number) {
  const digits = normalizePan(number);
  if (!digits) return "unknown";
  if (/^4/.test(digits)) return "visa";
  if (/^(34|37)/.test(digits)) return "amex";
  if (/^5[1-5]/.test(digits)) return "mastercard";
  const first4 = Number(digits.slice(0, 4));
  if (Number.isFinite(first4) && first4 >= 2221 && first4 <= 2720) {
    return "mastercard";
  }
  if (/^6011/.test(digits) || /^65/.test(digits)) return "discover";
  const first3 = Number(digits.slice(0, 3));
  if (Number.isFinite(first3) && first3 >= 644 && first3 <= 649) return "discover";
  const first6 = Number(digits.slice(0, 6));
  if (Number.isFinite(first6) && first6 >= 622126 && first6 <= 622925) {
    return "discover";
  }
  return "unknown";
}

function validateCardNumber(number) {
  const digits = normalizePan(number);
  if (!digits) return { ok: false, message: "Card number is required." };
  if (!/^\d{12,19}$/.test(digits)) {
    return { ok: false, message: "Card number length is invalid." };
  }
  const brand = detectCardBrand(digits);
  if (!["visa", "mastercard", "amex", "discover"].includes(brand)) {
    return { ok: false, message: "Unsupported card brand." };
  }
  const lengthByBrand = {
    visa: [13, 16, 19],
    mastercard: [16],
    amex: [15],
    discover: [16, 19],
  };
  if (!lengthByBrand[brand].includes(digits.length)) {
    return { ok: false, message: "Card number length is invalid." };
  }
  if (!luhnCheck(digits)) {
    return { ok: false, message: "Card number failed validation." };
  }
  return { ok: true, brand, last4: digits.slice(-4), normalized: digits };
}

function normalizeExpiry(expMonth, expYear) {
  if (typeof expMonth === "string" && expMonth.includes("/")) {
    const parts = expMonth.split("/");
    return { month: parts[0], year: parts[1] || expYear };
  }
  return { month: expMonth, year: expYear };
}

function normalizeCountryCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.length === 2) return upper;
  const normalized = upper.replace(/\s+/g, " ");
  const map = {
    SINGAPORE: "SG",
    "UNITED STATES": "US",
    USA: "US",
    "UNITED KINGDOM": "GB",
    UK: "GB",
    "GREAT BRITAIN": "GB",
    MALAYSIA: "MY",
    INDONESIA: "ID",
    THAILAND: "TH",
    VIETNAM: "VN",
    PHILIPPINES: "PH",
  };
  return map[normalized] || null;
}

function validateExpiry(expMonth, expYear) {
  const normalized = normalizeExpiry(expMonth, expYear);
  const month = Number(normalized.month);
  let year = Number(normalized.year);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, message: "Expiry month is invalid." };
  }
  if (!Number.isFinite(year)) {
    return { ok: false, message: "Expiry year is invalid." };
  }
  if (year < 100) {
    year += 2000;
  }

  const now = new Date();
  const expiry = new Date(year, month, 0, 23, 59, 59, 999);
  if (expiry < now) {
    return { ok: false, message: "Card has expired." };
  }
  return { ok: true, month, year };
}

function validateCvv(cvv, brand) {
  const digits = String(cvv || "").replace(/\D/g, "");
  if (!digits) return { ok: false, message: "CVV is required." };
  const expected = brand === "amex" ? 4 : 3;
  if (digits.length !== expected) {
    return { ok: false, message: "CVV length is invalid." };
  }
  return { ok: true };
}

function hashCard(number) {
  const digits = normalizePan(number);
  if (!digits) return "";
  return crypto.createHmac("sha256", CARD_HASH_SECRET).update(digits).digest("hex");
}

function pruneFailures(map, now) {
  map.forEach((entries, key) => {
    const filtered = entries.filter((ts) => now - ts <= FAILED_WINDOW_MS);
    if (filtered.length) {
      map.set(key, filtered);
    } else {
      map.delete(key);
    }
  });
}

function recordFailure(map, key) {
  if (!key) return;
  const now = Date.now();
  const entries = map.get(key) || [];
  entries.push(now);
  map.set(key, entries);
  pruneFailures(map, now);
}

function clearFailures(map, key) {
  if (!key) return;
  map.delete(key);
}

function isRateLimited(map, key, limit) {
  if (!key) return false;
  const now = Date.now();
  const entries = map.get(key) || [];
  const recent = entries.filter((ts) => now - ts <= FAILED_WINDOW_MS);
  map.set(key, recent);
  return recent.length >= limit;
}

function checkVelocity({ userId, cardHash }) {
  const userLimited = isRateLimited(failedByUser, userId, MAX_FAILED_PER_USER);
  const cardLimited = isRateLimited(failedByCard, cardHash, MAX_FAILED_PER_CARD);
  return { userLimited, cardLimited, blocked: userLimited || cardLimited };
}

function buildRiskFlags({ charge, ipCountry, billingCountry, velocity }) {
  const flags = [];
  const checks = charge?.payment_method_details?.card?.checks || {};
  if (checks.cvc_check === "fail") flags.push("cvc_mismatch");
  if (
    checks.address_line1_check === "fail" ||
    checks.address_postal_code_check === "fail"
  ) {
    flags.push("avs_mismatch");
  }
  if (
    ipCountry &&
    billingCountry &&
    String(ipCountry).toUpperCase() !== String(billingCountry).toUpperCase()
  ) {
    flags.push("ip_billing_country_mismatch");
  }
  if (velocity?.blocked) {
    flags.push("velocity_limit_exceeded");
  }
  if (velocity?.cardLimited || velocity?.userLimited) {
    flags.push("repeated_failed_attempts");
  }
  return flags;
}

function extractRiskSummary(intent, velocity, ipCountry, billingCountry) {
  const charge = intent?.charges?.data?.length ? intent.charges.data[0] : null;
  const riskFlags = buildRiskFlags({ charge, ipCountry, billingCountry, velocity });
  return {
    flags: riskFlags,
    checks: charge?.payment_method_details?.card?.checks || {},
    outcome: charge?.outcome || {},
  };
}

function safeStripeError(error) {
  if (!error) return "Stripe payment failed.";
  if (error.type === "StripeCardError" && error.message) {
    return error.message;
  }
  if (error.code === "card_declined") {
    return "Card was declined.";
  }
  return "Stripe payment failed.";
}

async function refundPaymentIntent({ paymentIntentId, amount }) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package.");
  }
  if (!paymentIntentId) {
    throw new Error("Missing Stripe payment intent for refund.");
  }

  const params = { payment_intent: paymentIntentId };
  if (amount) {
    params.amount = toStripeAmount(amount);
  }
  return stripe.refunds.create(params);
}

async function createCardPaymentIntent({
  amount,
  currency = "sgd",
  card,
  billing = {},
  description,
  metadata,
  userId,
  ipCountry,
  returnUrl,
}) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package.");
  }

  const validation = validateCardNumber(card?.number);
  if (!validation.ok) {
    recordFailure(failedByUser, userId);
    throw new Error(validation.message);
  }
  const expiryCheck = validateExpiry(card?.expMonth, card?.expYear);
  if (!expiryCheck.ok) {
    recordFailure(failedByUser, userId);
    recordFailure(failedByCard, hashCard(card?.number));
    throw new Error(expiryCheck.message);
  }
  const cvvCheck = validateCvv(card?.cvc, validation.brand);
  if (!cvvCheck.ok) {
    recordFailure(failedByUser, userId);
    recordFailure(failedByCard, hashCard(card?.number));
    throw new Error(cvvCheck.message);
  }

  const cardHash = hashCard(card?.number);
  const velocity = checkVelocity({ userId, cardHash });
  if (velocity.blocked) {
    throw new Error("Too many failed attempts. Please wait and try again.");
  }

  try {
    const countryCode = normalizeCountryCode(billing.country);
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number: normalizePan(card?.number),
        exp_month: expiryCheck.month,
        exp_year: expiryCheck.year,
        cvc: String(card?.cvc || "").trim(),
      },
      billing_details: {
        name: billing.name || undefined,
        email: billing.email || undefined,
        address: {
          country: countryCode || undefined,
          postal_code: billing.postalCode || undefined,
        },
      },
    });

    const intent = await stripe.paymentIntents.create({
      amount: toStripeAmount(amount),
      currency,
      payment_method: paymentMethod.id,
      payment_method_types: ["card"],
      confirm: true,
      description,
      metadata,
      return_url: returnUrl,
      expand: ["charges.data.outcome", "charges.data.payment_method_details"],
    });

    const requiresAction = intent.status === "requires_action";
    const nextActionUrl = intent.next_action?.redirect_to_url?.url || null;

    if (intent.status === "succeeded") {
      clearFailures(failedByUser, userId);
      clearFailures(failedByCard, cardHash);
    } else if (intent.status !== "requires_action") {
      recordFailure(failedByUser, userId);
      recordFailure(failedByCard, cardHash);
    }

    return {
      status: intent.status,
      paymentIntentId: intent.id,
      paymentMethodId: paymentMethod.id,
      requiresAction,
      nextActionUrl,
      card: {
        brand: paymentMethod.card?.brand || validation.brand,
        last4: paymentMethod.card?.last4 || validation.last4,
        type: paymentMethod.card?.funding || null,
      },
      risk: extractRiskSummary(intent, velocity, ipCountry, countryCode),
      clientSecret: intent.client_secret,
    };
  } catch (error) {
    recordFailure(failedByUser, userId);
    recordFailure(failedByCard, cardHash);
    throw new Error(safeStripeError(error));
  }
}

async function createGrabPayPaymentIntent({
  amount,
  currency = "sgd",
  billing = {},
  description,
  metadata,
  returnUrl,
}) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package.");
  }

  const intent = await stripe.paymentIntents.create({
    amount: toStripeAmount(amount),
    currency,
    payment_method_types: ["grabpay"],
    payment_method_data: {
      type: "grabpay",
      billing_details: {
        name: billing.name || undefined,
        email: billing.email || undefined,
      },
    },
    confirm: true,
    return_url: returnUrl,
    description,
    metadata,
    expand: ["charges.data.outcome", "charges.data.payment_method_details"],
  });

  return {
    status: intent.status,
    paymentIntentId: intent.id,
    nextActionUrl: intent.next_action?.redirect_to_url?.url || null,
  };
}

async function retrievePaymentIntent(intentId) {
  if (!stripe) {
    throw new Error("Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package.");
  }
  if (!intentId) {
    throw new Error("Missing Stripe payment intent.");
  }
  return stripe.paymentIntents.retrieve(intentId, {
    expand: ["charges.data.outcome", "charges.data.payment_method_details"],
  });
}

module.exports = {
  toStripeAmount,
  createCardPaymentIntent,
  createGrabPayPaymentIntent,
  retrievePaymentIntent,
  createGrabPayCheckoutSession: async ({
    lineItems,
    successUrl,
    cancelUrl,
    customerEmail,
    metadata,
    idempotencyKey,
  }) => {
    if (!stripe) {
      throw new Error(
        "Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package."
      );
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      throw new Error("Missing line items.");
    }
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["grabpay"],
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customerEmail || undefined,
        metadata: metadata || undefined,
        payment_intent_data: metadata ? { metadata } : undefined,
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );
    return session;
  },
  retrieveCheckoutSession: async (sessionId) => {
    if (!stripe) {
      throw new Error(
        "Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package."
      );
    }
    if (!sessionId) {
      throw new Error("Missing Stripe session id.");
    }
    return stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "customer_details"],
    });
  },
  constructWebhookEvent: (payload, signature) => {
    if (!stripe) {
      throw new Error(
        "Stripe is not configured. Check STRIPE_SECRET_KEY and install the stripe package."
      );
    }
    if (!STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhook secret is not configured.");
    }
    return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  },
  refundPaymentIntent,
  validateCardNumber,
  detectCardBrand,
  validateExpiry,
  validateCvv,
  maskPan,
};
