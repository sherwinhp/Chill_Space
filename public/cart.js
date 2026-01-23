const cartItems = document.querySelector("[data-cart-items]");
const cartTotal = document.querySelector("[data-cart-total]");
const clearButton = document.querySelector("[data-clear-cart]");

let cachedItems = [];

function fetchCart() {
  return fetch("/cart/items")
    .then((res) => res.json())
    .then(({ items }) => (Array.isArray(items) ? items : []));
}

function renderCart() {
  if (!cartItems || !cartTotal) return;
  const items = cachedItems;
  if (!items.length) {
    cartItems.innerHTML = '<p class="empty-note">No items yet.</p>';
    cartTotal.textContent = "$0.00";
    if (clearButton) clearButton.disabled = true;
    window.dispatchEvent(new Event("cart:updated"));
    return;
  }

  cartItems.innerHTML = "";
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
    const editButton =
      item.type === "room_booking"
        ? `<button class="cart-edit" type="button" data-action="edit" data-id="${item.id}" data-room-id="${item.roomId}" data-start="${item.startTime}" data-end="${item.endTime}">Edit</button>`
        : "";
    const controls =
      item.type === "room_booking"
        ? `<div class="cart-qty">
            <strong>${qty}</strong>
            ${editButton}
            <button class="cart-remove" type="button" data-action="remove" data-id="${item.id}" aria-label="Remove item">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7"></path>
              </svg>
            </button>
          </div>`
        : `<div class="cart-qty">
            <strong>${qty}</strong>
            <button type="button" data-action="inc" data-id="${item.id}">+</button>
            <button class="cart-remove" type="button" data-action="remove" data-id="${item.id}" aria-label="Remove item">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7"></path>
              </svg>
            </button>
          </div>`;
    row.innerHTML = `
      <div>
        <h4>${item.name}</h4>
        ${details}
        <span>$${Number(item.price).toFixed(2)} ${label}</span>
      </div>
      ${controls}
    `;
    cartItems.appendChild(row);
  });

  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty || 1), 0);
  cartTotal.textContent = `$${total.toFixed(2)}`;
  if (clearButton) clearButton.disabled = false;
  window.dispatchEvent(new Event("cart:updated"));
}

function updateQuantity(id, delta) {
  const item = cachedItems.find((entry) => entry.id === Number(id));
  if (!item || item.type === "room_booking") return;
  const nextQty = Math.max(1, Number(item.qty || 1) + delta);
  fetch(`/cart/items/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qty: nextQty }),
  })
    .then((res) => res.json())
    .then(({ items }) => {
      cachedItems = Array.isArray(items) ? items : [];
      renderCart();
    })
    .catch(() => {});
}

function removeItem(id) {
  fetch(`/cart/items/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then(({ items }) => {
      cachedItems = Array.isArray(items) ? items : [];
      renderCart();
    })
    .catch(() => {});
}

function editBooking(item) {
  const url = new URL(`/rooms/${item.roomId}/book`, window.location.origin);
  url.searchParams.set("start", item.startTime);
  url.searchParams.set("end", item.endTime);
  fetch(`/cart/items/${item.id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then(() => {
      window.location.href = url.toString();
    })
    .catch(() => {
      window.location.href = url.toString();
    });
}

function clearCart() {
  fetch("/cart/clear", { method: "DELETE" })
    .then((res) => res.json())
    .then(({ items }) => {
      cachedItems = Array.isArray(items) ? items : [];
      renderCart();
    })
    .catch(() => {});
}

if (clearButton) {
  clearButton.addEventListener("click", clearCart);
}

if (cartItems) {
  cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = cachedItems.find((entry) => entry.id === Number(button.dataset.id));
    if (button.dataset.action === "inc") updateQuantity(button.dataset.id, 1);
    if (button.dataset.action === "remove") removeItem(button.dataset.id);
    if (button.dataset.action === "edit" && item) editBooking(item);
  });
}

renderCart();
fetchCart().then((items) => {
  cachedItems = items;
  renderCart();
});
