const checkoutItems = document.querySelector("[data-checkout-items]");
const checkoutTotal = document.querySelector("[data-checkout-total]");
const checkoutCount = document.querySelector("[data-checkout-count]");
const confirmPaymentButton = document.querySelector("[data-confirm-payment]");
const paypalContainer = document.querySelector("#paypal-button-container");
const paymentCard = document.querySelector("[data-wallet-balance-cents]");
const walletOptionInput = document.querySelector('input[name="paymentType"][value="wallet"]');
const stripeCardForm = document.querySelector("[data-stripe-card-form]");
const cardNameInput = document.querySelector("[data-card-name]");
const cardEmailInput = document.querySelector("[data-card-email]");
const cardNumberInput = document.querySelector("[data-card-number]");
const cardExpiryInput = document.querySelector("[data-card-expiry]");
const cardCvcInput = document.querySelector("[data-card-cvc]");
const cardCountryInput = document.querySelector("[data-card-country]");
const cardPostalInput = document.querySelector("[data-card-postal]");
const netsModal = document.querySelector("[data-nets-modal]");
const netsStatusEl = netsModal ? netsModal.querySelector("[data-nets-status]") : null;
const netsQrImgEl = netsModal ? netsModal.querySelector("[data-nets-qr]") : null;
const netsTimerEl = netsModal ? netsModal.querySelector("[data-nets-timer]") : null;
const netsSpinnerEl = netsModal ? netsModal.querySelector("[data-nets-spinner]") : null;
const netsCancelButtons = netsModal ? netsModal.querySelectorAll("[data-nets-cancel]") : [];
const confirmPaymentDefaultLabel = confirmPaymentButton
  ? confirmPaymentButton.textContent.trim()
  : "Confirm payment";
let walletBalanceCents = paymentCard ? Number(paymentCard.dataset.walletBalanceCents || 0) : 0;
let paypalButtonsRendered = false;
let currentTotalCents = 0;
let netsEventSource = null;
let netsTimerInterval = null;
let netsRemainingSeconds = 0;
let netsTxnRetrievalRef = null;
let netsCompleting = false;
let netsCreatingQr = false;

function toggleStripeCardForm() {
  if (!stripeCardForm) return;
  const selected = document.querySelector("input[name='paymentType']:checked");
  const isCard = selected && selected.value === "stripe_card";
  stripeCardForm.classList.toggle("is-hidden", !isCard);
}

async function readJsonOrText(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return { error: text };
}

const hitpayStatusMessages = {
  failed: "PayNow payment was not completed. Please try again.",
  missing_reference: "Missing HitPay payment reference. Please try again.",
  empty_cart: "Your cart is empty after payment verification. Please contact support if you were charged.",
  error: "Unable to verify your PayNow payment. Please try again.",
};

const stripeStatusMessages = {
  failed: "GrabPay payment was not completed. Please try again.",
  pending: "GrabPay payment is processing. Please wait a moment and check your notifications.",
  cancel: "GrabPay payment was canceled.",
  missing_intent: "Missing Stripe payment reference. Please try again.",
  empty_cart: "Your cart is empty after payment verification. Please contact support if you were charged.",
  error: "Unable to verify Stripe payment. Please try again.",
};

function showHitpayStatusMessage() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("hitpay");
  if (!status) return;
  const fromQuery = params.get("message");
  const message = fromQuery || hitpayStatusMessages[status];
  if (message) {
    alert(message);
  }
  params.delete("hitpay");
  params.delete("message");
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function showStripeStatusMessage() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("stripe");
  if (!status) return;
  const fromQuery = params.get("message");
  const message = fromQuery || stripeStatusMessages[status];
  if (message) {
    alert(message);
  }
  params.delete("stripe");
  params.delete("message");
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function formatCountdown(seconds) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setConfirmBusy(isBusy, label) {
  if (!confirmPaymentButton) return;
  confirmPaymentButton.disabled = Boolean(isBusy);
  confirmPaymentButton.textContent =
    typeof label === "string" ? label : confirmPaymentDefaultLabel;
}

function isNetsSuccessPayload(payload) {
  const responseCode =
    payload?.response_code ?? payload?.result?.response_code ?? payload?.result?.responseCode;
  const txnStatus =
    payload?.txn_status ?? payload?.result?.txn_status ?? payload?.result?.txnStatus;
  const normalizedTxnStatus =
    typeof txnStatus === "string" ? txnStatus.trim().toLowerCase() : txnStatus;
  return (
    String(responseCode) === "00" &&
    (Number(normalizedTxnStatus) === 1 ||
      normalizedTxnStatus === "success" ||
      normalizedTxnStatus === "completed")
  );
}

function stopNetsBackgroundWork() {
  if (netsEventSource) {
    netsEventSource.close();
    netsEventSource = null;
  }
  if (netsTimerInterval) {
    clearInterval(netsTimerInterval);
    netsTimerInterval = null;
  }
}

function resetNetsModalUi() {
  if (netsStatusEl) netsStatusEl.textContent = "Generating QR…";
  if (netsSpinnerEl) netsSpinnerEl.hidden = false;
  if (netsQrImgEl) {
    netsQrImgEl.hidden = true;
    netsQrImgEl.removeAttribute("src");
  }
  netsRemainingSeconds = 300;
  if (netsTimerEl) netsTimerEl.textContent = `Time remaining: ${formatCountdown(netsRemainingSeconds)}`;
  netsTxnRetrievalRef = null;
  netsCompleting = false;
}

function openNetsModal() {
  if (!netsModal) return;
  netsModal.hidden = false;
  netsModal.classList.add("is-open");
  netsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
}

function closeNetsModal({ keepState = false } = {}) {
  stopNetsBackgroundWork();
  netsCreatingQr = false;
  setConfirmBusy(false);

  if (!netsModal) return;
  netsModal.classList.remove("is-open");
  netsModal.setAttribute("aria-hidden", "true");
  netsModal.hidden = true;
  document.body.classList.remove("has-modal");

  if (!keepState) {
    resetNetsModalUi();
  }
}

async function completeNetsPayment(txnRetrievalRef) {
  const response = await fetch("/payments/nets/qr/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txnRetrievalRef }),
  });
  const body = await readJsonOrText(response);
  if (!response.ok || !body || !body.success || !body.transactionId) {
    throw new Error(body?.error || "Unable to finalize NETS payment.");
  }
  window.location.href = `/invoice/${body.transactionId}`;
}

function startNetsTimer() {
  netsRemainingSeconds = 300;
  if (netsTimerEl) {
    netsTimerEl.textContent = `Time remaining: ${formatCountdown(netsRemainingSeconds)}`;
  }

  netsTimerInterval = setInterval(() => {
    netsRemainingSeconds -= 1;
    if (netsTimerEl) {
      netsTimerEl.textContent = `Time remaining: ${formatCountdown(netsRemainingSeconds)}`;
    }

    if (netsRemainingSeconds <= 0) {
      stopNetsBackgroundWork();
      if (netsStatusEl) {
        netsStatusEl.textContent = "Payment failed. Please try again.";
      }
      if (netsSpinnerEl) netsSpinnerEl.hidden = true;
      setConfirmBusy(false);
      alert("Payment failed. Please try again.");
      closeNetsModal();
    }
  }, 1000);
}

function startNetsSse(txnRetrievalRef) {
  const safeRef = encodeURIComponent(String(txnRetrievalRef));
  netsEventSource = new EventSource(`/payments/nets/qr/stream/${safeRef}`);

  netsEventSource.addEventListener("message", async (event) => {
    if (!event?.data) return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload?.fail) {
      stopNetsBackgroundWork();
      if (netsStatusEl) {
        netsStatusEl.textContent =
          payload?.details || "NETS status check failed. Please close this window and try again.";
      }
      if (netsSpinnerEl) netsSpinnerEl.hidden = true;
      setConfirmBusy(false);
      return;
    }

    if (isNetsSuccessPayload(payload) && !netsCompleting) {
      netsCompleting = true;
      stopNetsBackgroundWork();
      if (netsStatusEl) netsStatusEl.textContent = "Payment received. Creating invoice…";
      setConfirmBusy(true, "Finalizing NETS…");
      try {
        await completeNetsPayment(txnRetrievalRef);
      } catch (error) {
        netsCompleting = false;
        setConfirmBusy(false);
        if (netsStatusEl) {
          netsStatusEl.textContent = error.message || "Unable to finalize NETS payment.";
        }
      }
    }
  });

  netsEventSource.addEventListener("done", async (event) => {
    const result = String(event?.data || "").trim().toLowerCase();
    if (result !== "success") {
      stopNetsBackgroundWork();
      if (netsStatusEl) {
        netsStatusEl.textContent =
          result === "timeout"
            ? "NETS QR timed out. Please close this window and try again."
            : "NETS payment failed. Please close this window and try again.";
      }
      if (netsSpinnerEl) netsSpinnerEl.hidden = true;
      setConfirmBusy(false);
      return;
    }

    if (netsCompleting) return;
    netsCompleting = true;
    stopNetsBackgroundWork();
    if (netsStatusEl) netsStatusEl.textContent = "Payment received. Creating invoice…";
    setConfirmBusy(true, "Finalizing NETS…");
    try {
      await completeNetsPayment(txnRetrievalRef);
    } catch (error) {
      netsCompleting = false;
      setConfirmBusy(false);
      if (netsStatusEl) {
        netsStatusEl.textContent = error.message || "Unable to finalize NETS payment.";
      }
    }
  });
}

async function startNetsQrPopup() {
  if (netsCreatingQr) return;
  netsCreatingQr = true;

  resetNetsModalUi();
  openNetsModal();
  setConfirmBusy(true, "Starting NETS…");

  try {
    const response = await fetch("/payments/nets/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await readJsonOrText(response);
    if (!response.ok || !body || !body.qrCodeUrl || !body.txnRetrievalRef) {
      throw new Error(body?.error || "Unable to generate NETS QR.");
    }

    netsTxnRetrievalRef = body.txnRetrievalRef;
    if (netsStatusEl) {
      netsStatusEl.textContent = "Scan with your bank app to complete payment.";
    }
    if (netsSpinnerEl) netsSpinnerEl.hidden = true;
    if (netsQrImgEl) {
      netsQrImgEl.src = body.qrCodeUrl;
      netsQrImgEl.hidden = false;
    }

    startNetsTimer();
    startNetsSse(netsTxnRetrievalRef);
  } catch (error) {
    if (netsStatusEl) {
      netsStatusEl.textContent = error.message || "Unable to generate NETS QR.";
    }
    if (netsSpinnerEl) netsSpinnerEl.hidden = true;
    setConfirmBusy(false);
  } finally {
    netsCreatingQr = false;
  }
}

function fetchCart() {
  return fetch("/cart/items")
    .then((res) => res.json())
    .then(({ items }) => (Array.isArray(items) ? items : []));
}

function parseLocalDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || 0)
  );
}

function renderCheckout(items) {
  if (!checkoutItems || !checkoutTotal) return;
  if (!items.length) {
    checkoutItems.innerHTML = '<p class="empty-note">No items yet.</p>';
    checkoutTotal.textContent = "$0.00";
    currentTotalCents = 0;
    if (walletOptionInput) {
      walletOptionInput.disabled = true;
      const walletLabel = walletOptionInput.closest("label");
      if (walletLabel) {
        walletLabel.classList.add("is-disabled");
      }
    }
    if (checkoutCount) {
      checkoutCount.textContent = "0";
    }
    if (paypalContainer) {
      paypalContainer.innerHTML = "";
      paypalContainer.style.display = "none";
    }
    paypalButtonsRendered = false;
    return;
  }

  checkoutItems.innerHTML = "";
  let itemCount = 0;
  items.forEach((item) => {
    const detailsParts = [];
    if (item.type === "room_booking" && item.startTime && item.endTime) {
      if (item.details) {
        detailsParts.push(item.details);
      } else {
        const start = parseLocalDateTime(item.startTime);
        const end = parseLocalDateTime(item.endTime);
        if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          const dateLabel = start.toLocaleDateString("en-SG", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          const startLabel = start.toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const endLabel = end.toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const hours = (end - start) / 3600000;
          detailsParts.push(`${dateLabel}`);
          detailsParts.push(`${startLabel} - ${endLabel}`);
          if (Number.isFinite(hours)) {
            detailsParts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
          }
        }
      }
    } else if (item.details) {
      detailsParts.push(item.details);
    }

    const details = detailsParts.length
      ? `<div class="order-meta">${detailsParts
          .map((line) => `<span>${line}</span>`)
          .join("")}</div>`
      : "";
    const qty = Number(item.qty || 1);
    const unit = Number(item.price);
    const subtotal = unit * qty;
    itemCount += qty;
    const row = document.createElement("div");
    row.className = "order-row";
    row.innerHTML = `
      <div class="order-product">
        <strong>${item.name}</strong>
        ${details}
      </div>
      <span class="order-qty">${qty}</span>
      <span class="order-price">$${unit.toFixed(2)}</span>
      <span class="order-subtotal">$${subtotal.toFixed(2)}</span>
    `;
    checkoutItems.appendChild(row);
  });

  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty || 1), 0);
  currentTotalCents = Math.round(total * 100);
  checkoutTotal.textContent = `$${total.toFixed(2)}`;
  if (checkoutCount) {
    checkoutCount.textContent = `${itemCount}`;
  }
  if (walletOptionInput) {
    const enough = walletBalanceCents >= currentTotalCents && currentTotalCents > 0;
    walletOptionInput.disabled = !enough;
    const walletLabel = walletOptionInput.closest("label");
    if (walletLabel) {
      walletLabel.classList.toggle("is-disabled", !enough);
    }
  }
  renderPaypalButtons(total);
}

fetchCart().then(renderCheckout).catch(() => {
  renderCheckout([]);
});
showHitpayStatusMessage();
showStripeStatusMessage();
toggleStripeCardForm();

if (paymentCard) {
  if (cardNameInput && paymentCard.dataset.userName) {
    cardNameInput.value = paymentCard.dataset.userName;
  }
  if (cardEmailInput && paymentCard.dataset.userEmail) {
    cardEmailInput.value = paymentCard.dataset.userEmail;
  }
}

function renderPaypalButtons(total) {
  if (!paypalContainer || paypalButtonsRendered) return;
  if (!window.paypal) return;
  if (!Number.isFinite(total) || total <= 0) {
    paypalContainer.style.display = "none";
    return;
  }

  paypalContainer.style.display = "block";
  paypalButtonsRendered = true;
  window.paypal
    .Buttons({
      createOrder: () =>
        fetch("/api/paypal/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: total.toFixed(2) }),
        })
          .then((res) => res.json())
          .then((data) => data.id),
      onApprove: (data) =>
        fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderID: data.orderID }),
        })
          .then((res) =>
            res.json().then((body) => ({
              ok: res.ok,
              body,
            }))
          )
          .then(({ ok, body }) => {
            if (!ok) {
              throw new Error(body.error || "Payment could not be completed.");
            }
            if (body.success && body.transactionId) {
              window.location.href = `/invoice/${body.transactionId}`;
              return;
            }
            alert(body.error || "Payment not completed.");
          })
          .catch((error) => {
            alert(error.message || "Payment could not be completed.");
          }),
      onClick: (data, actions) => {
        if (!Number.isFinite(total) || total <= 0) {
          alert("Your cart is empty. Please add items before paying.");
          return actions.reject();
        }
        return actions.resolve();
      },
    })
    .render("#paypal-button-container");
}

if (confirmPaymentButton) {
  if (netsCancelButtons && netsCancelButtons.length) {
    netsCancelButtons.forEach((button) => {
      button.addEventListener("click", () => closeNetsModal());
    });
  }

  const paymentTypeInputs = document.querySelectorAll("input[name='paymentType']");
  paymentTypeInputs.forEach((input) => {
    input.addEventListener("change", toggleStripeCardForm);
  });

  confirmPaymentButton.addEventListener("click", async () => {
    const selected = document.querySelector(
      "input[name='paymentType']:checked"
    );
    const type = selected ? selected.value : "card";
    if (type === "paypal") return;
    if (type === "nets") {
      if (!netsModal) {
        alert("NETS QR is not available on this page.");
        return;
      }
      await startNetsQrPopup();
      return;
    }
    if (type === "paynow") {
      try {
        if (!currentTotalCents || currentTotalCents <= 0) {
          throw new Error("Your cart is empty. Please add items before paying.");
        }
        const response = await fetch("/payments/hitpay/paynow/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const body = await readJsonOrText(response);
        if (!response.ok || !body.paymentUrl) {
          throw new Error(body.error || "Unable to start PayNow payment.");
        }
        window.location.href = body.paymentUrl;
      } catch (error) {
        alert(error.message || "Unable to start PayNow payment.");
      }
      return;
    }
    if (type === "wallet") {
      try {
        const response = await fetch("/payments/wallet/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const body = await response.json();
        if (!response.ok || !body.success) {
          throw new Error(body.error || "Wallet payment failed.");
        }
        if (Number.isFinite(Number(body.balanceCents))) {
          walletBalanceCents = Number(body.balanceCents);
        }
        window.location.href = `/invoice/${body.transactionId}`;
      } catch (error) {
        alert(error.message || "Wallet payment failed.");
      }
      return;
    }
    if (type === "stripe_card") {
      try {
        if (!currentTotalCents || currentTotalCents <= 0) {
          throw new Error("Your cart is empty. Please add items before paying.");
        }
        const payload = {
          card_name: cardNameInput ? cardNameInput.value : "",
          card_email: cardEmailInput ? cardEmailInput.value : "",
          card_number: cardNumberInput ? cardNumberInput.value : "",
          card_expiry: cardExpiryInput ? cardExpiryInput.value : "",
          cvc: cardCvcInput ? cardCvcInput.value : "",
          billing_country: cardCountryInput ? cardCountryInput.value : "",
          postal_code: cardPostalInput ? cardPostalInput.value : "",
        };
        setConfirmBusy(true, "Processing card...");
        const response = await fetch("/payments/stripe/card/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await readJsonOrText(response);
        if (!response.ok) {
          throw new Error(body.error || "Stripe card payment failed.");
        }
        if (body.requiresAction) {
          if (body.redirectUrl) {
            window.location.href = body.redirectUrl;
            return;
          }
          throw new Error(
            "Additional card authentication required. Please try another payment method."
          );
        }
        if (body.success && body.transactionId) {
          window.location.href = `/invoice/${body.transactionId}`;
          return;
        }
        throw new Error(body.error || "Stripe card payment failed.");
      } catch (error) {
        alert(error.message || "Stripe card payment failed.");
      } finally {
        setConfirmBusy(false);
      }
      return;
    }
    if (type === "grabpay") {
      try {
        if (!currentTotalCents || currentTotalCents <= 0) {
          throw new Error("Your cart is empty. Please add items before paying.");
        }
        setConfirmBusy(true, "Starting GrabPay...");
        const response = await fetch("/stripe/grabpay/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = await readJsonOrText(response);
        if (!response.ok || !body.url) {
          throw new Error(body.error || "Unable to start GrabPay payment.");
        }
        window.location.href = body.url;
      } catch (error) {
        alert(error.message || "Unable to start GrabPay payment.");
        setConfirmBusy(false);
      }
      return;
    }
    alert("Select PayNow, Wallet, or use the PayPal button to continue.");
  });
}
