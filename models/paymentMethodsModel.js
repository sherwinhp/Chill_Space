/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
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
