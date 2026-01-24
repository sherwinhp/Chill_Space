const checkoutItems = document.querySelector("[data-checkout-items]");
const checkoutTotal = document.querySelector("[data-checkout-total]");
const checkoutCount = document.querySelector("[data-checkout-count]");
const confirmPaymentButton = document.querySelector("[data-confirm-payment]");
const paypalContainer = document.querySelector("#paypal-button-container");
let paypalButtonsRendered = false;

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
  checkoutTotal.textContent = `$${total.toFixed(2)}`;
  if (checkoutCount) {
    checkoutCount.textContent = `${itemCount}`;
  }
  renderPaypalButtons(total);
}

fetchCart().then(renderCheckout).catch(() => {
  renderCheckout([]);
});

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
  confirmPaymentButton.addEventListener("click", () => {
    const selected = document.querySelector(
      "input[name='paymentType']:checked"
    );
    const type = selected ? selected.value : "card";
    if (type === "paypal") return;
  });
}
