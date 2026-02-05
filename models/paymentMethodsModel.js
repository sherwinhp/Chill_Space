const db = require("../db");

async function upsertPaymentMethod({
  userId,
  provider,
  token,
  brand,
  last4,
  funding,
}) {
  if (!userId || !provider || !token || !brand || !last4) {
    return null;
  }
  const safeFunding =
    funding && ["credit", "debit", "prepaid", "unknown"].includes(funding)
      ? funding
      : "unknown";
  await db.query(
    `
      INSERT INTO payment_methods
        (user_id, provider, token, brand, last4, funding)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        brand = VALUES(brand),
        last4 = VALUES(last4),
        funding = VALUES(funding)
    `,
    [userId, provider, token, brand, last4, safeFunding]
  );
  return true;
}

module.exports = {
  upsertPaymentMethod,
};
