const { findById } = require("../models/usersModel");
const { createComplianceFlag, findWatchlistMatch } = require("../models/complianceModel");
const { countRecentTransactionsForUser } = require("../models/transactionsModel");

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, amount);
}

async function runComplianceChecks({
  userId,
  amount,
  currency = "SGD",
  context = "checkout",
  relatedType = "payment",
  relatedId = null,
  ipAddress = null,
}) {
  const flags = [];
  let blocked = false;
  let blockReason = null;

  const user = userId ? await findById(Number(userId)) : null;
  const totalAmount = parseAmount(amount);

  if (user) {
    const kycStatus = String(user.kyc_status || "unverified").toLowerCase();
    const kycThreshold = Number(process.env.KYC_THRESHOLD || 300);
    if (kycStatus === "blocked" || kycStatus === "rejected") {
      blocked = true;
      blockReason = "Account blocked by KYC review.";
      flags.push({
        severity: "high",
        reason: "KYC blocked",
        details: `KYC status: ${kycStatus}`,
      });
    } else if (
      (kycStatus === "unverified" || kycStatus === "pending") &&
      totalAmount >= kycThreshold
    ) {
      blocked = true;
      blockReason = "KYC required before completing this payment.";
      flags.push({
        severity: "high",
        reason: "KYC required",
        details: `Amount ${totalAmount.toFixed(2)} exceeds KYC threshold ${kycThreshold}`,
      });
    }

    try {
      const watchMatch = await findWatchlistMatch({
        name: user.name,
        email: user.email,
        contact_number: user.contact_number,
      });
      if (watchMatch) {
        blocked = true;
        blockReason = "Payment requires manual review.";
        flags.push({
          severity: "high",
          reason: "Watchlist match",
          details: `Matched watchlist entry #${watchMatch.watch_id}`,
        });
      }
    } catch (error) {
      if (error && error.code !== "ER_NO_SUCH_TABLE") {
        throw error;
      }
    }
  }

  const velocityMinutes = Number(process.env.AML_VELOCITY_MINUTES || 60);
  const velocityCount = Number(process.env.AML_VELOCITY_COUNT || 3);
  if (userId) {
    const recent = await countRecentTransactionsForUser(userId, velocityMinutes);
    if (recent >= velocityCount) {
      flags.push({
        severity: "medium",
        reason: "High purchase velocity",
        details: `${recent} transactions in ${velocityMinutes} minutes`,
      });
    }
  }

  const highAmount = Number(process.env.AML_HIGH_AMOUNT || 500);
  if (totalAmount >= highAmount) {
    flags.push({
      severity: "medium",
      reason: "High amount",
      details: `Amount ${totalAmount.toFixed(2)} >= ${highAmount}`,
    });
  }

  if (String(currency || "SGD").toUpperCase() !== "SGD") {
    flags.push({
      severity: "low",
      reason: "Non-SGD currency",
      details: `Currency: ${currency}`,
    });
  }

  for (const flag of flags) {
    try {
      await createComplianceFlag({
        userId: userId || null,
        relatedType,
        relatedId,
        severity: flag.severity,
        reason: flag.reason,
        details: `${flag.details || ""} | context=${context} | ip=${ipAddress || "n/a"}`,
      });
    } catch (error) {
      if (error && error.code !== "ER_NO_SUCH_TABLE") {
        throw error;
      }
    }
  }

  return { ok: !blocked, blocked, blockReason, flags };
}

module.exports = {
  runComplianceChecks,
};
