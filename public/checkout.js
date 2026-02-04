const checkoutItems = document.querySelector("[data-checkout-items]");
const checkoutTotal = document.querySelector("[data-checkout-total]");
const checkoutCount = document.querySelector("[data-checkout-count]");
const confirmPaymentButton = document.querySelector("[data-confirm-payment]");
const paypalContainer = document.querySelector("#paypal-button-container");
const paymentCard = document.querySelector("[data-wallet-balance-cents]");
const walletOptionInput = document.querySelector('input[name="paymentType"][value="wallet"]');
let walletBalanceCents = paymentCard ? Number(paymentCard.dataset.walletBalanceCents || 0) : 0;
let paypalButtonsRendered = false;
let currentTotalCents = 0;

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
  confirmPaymentButton.addEventListener("click", async () => {
    const selected = document.querySelector(
      "input[name='paymentType']:checked"
    );
    const type = selected ? selected.value : "card";
    if (type === "paypal") return;
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
    alert("Select PayNow, Wallet, or use the PayPal button to continue.");
  });
}
