const checkoutItems = document.querySelector("[data-checkout-items]");
const checkoutTotal = document.querySelector("[data-checkout-total]");
const placeOrderButton = document.querySelector("[data-place-order]");
const paymentModal = document.querySelector("[data-payment-modal]");
const modalClosers = document.querySelectorAll("[data-modal-close]");
const confirmPaymentButton = document.querySelector("[data-confirm-payment]");

function fetchCart() {
  return fetch("/cart/items")
    .then((res) => res.json())
    .then(({ items }) => (Array.isArray(items) ? items : []));
}

function renderCheckout(items) {
  if (!checkoutItems || !checkoutTotal) return;
  if (!items.length) {
    checkoutItems.innerHTML = '<p class="empty-note">No items yet.</p>';
    checkoutTotal.textContent = "$0.00";
    return;
  }

  checkoutItems.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    const detailsParts = [];
    if (item.type === "room_booking" && item.startTime && item.endTime) {
      const start = new Date(item.startTime);
      const end = new Date(item.endTime);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
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
    } else if (item.details) {
      detailsParts.push(item.details);
    }

    const details = detailsParts.length
      ? `<div class="cart-details">${detailsParts.map((line) => `<p>${line}</p>`).join("")}</div>`
      : "";
    const label = item.type === "room_booking" ? "Booking" : "each";
    const qty = Number(item.qty || 1);
    row.innerHTML = `
      <div>
        <h4>${item.name}</h4>
        ${details}
        <span>$${Number(item.price).toFixed(2)} ${label}</span>
      </div>
      <div class="cart-qty">
        <strong>${qty}</strong>
      </div>
    `;
    checkoutItems.appendChild(row);
  });

  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty || 1), 0);
  checkoutTotal.textContent = `$${total.toFixed(2)}`;
}

fetchCart().then(renderCheckout).catch(() => {
  renderCheckout([]);
});

function openModal() {
  if (!paymentModal) return;
  paymentModal.classList.add("open");
  paymentModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!paymentModal) return;
  paymentModal.classList.remove("open");
  paymentModal.setAttribute("aria-hidden", "true");
}

if (placeOrderButton) {
  placeOrderButton.addEventListener("click", openModal);
}

modalClosers.forEach((button) => {
  button.addEventListener("click", closeModal);
});

if (confirmPaymentButton) {
  confirmPaymentButton.addEventListener("click", () => {
    const selected = document.querySelector(
      "input[name='paymentType']:checked"
    );
    const type = selected ? selected.value : "card";
    if (type === "paypal") {
      fetch("/payments/paypal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.approvalUrl) {
            throw new Error(data.error || "Unable to start PayPal.");
          }
          window.location.href = data.approvalUrl;
        })
        .catch(() => {
          closeModal();
        });
      return;
    }
    closeModal();
  });
}
