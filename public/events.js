const eventTabs = document.querySelectorAll(".event-tab");
const eventPanels = document.querySelectorAll(".event-panel");
const signupForms = document.querySelectorAll("[data-event-signup]");

async function getCartTotal() {
  try {
    const response = await fetch("/cart/items");
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
  } catch (_) {
    return 0;
  }
}

function applyPromotions(total) {
  const totalEl = document.querySelector("[data-cart-total]");
  const discountEl = document.querySelector("[data-cart-discount]");
  const promoCards = document.querySelectorAll(".promo-card");

  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

  let bestPromo = null;
  promoCards.forEach((card) => {
    const minTotal = Number(card.dataset.minTotal || 0);
    const discount = Number(card.dataset.discount || 0);
    const code = card.dataset.code || "";
    const status = card.querySelector("[data-status]");

    if (total >= minTotal && discount > 0) {
      card.classList.add("applied");
      if (status) status.textContent = "Applied to cart";
      if (!bestPromo || discount > bestPromo.discount) {
        bestPromo = { discount, code };
      }
    } else {
      card.classList.remove("applied");
      if (status) status.textContent = `Spend $${minTotal.toFixed(2)} to apply`;
    }
  });

  if (discountEl) {
    if (bestPromo) {
      discountEl.textContent = `${bestPromo.discount}% OFF (${bestPromo.code})`;
    } else {
      discountEl.textContent = "None";
    }
  }
}

async function refreshPromotions() {
  const total = await getCartTotal();
  applyPromotions(total);
}

eventTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    eventTabs.forEach((btn) => btn.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.target;
    eventPanels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== target;
    });
  });
});

refreshPromotions();
window.addEventListener("cart:updated", refreshPromotions);

async function signupEvent(form) {
  const eventId = form.dataset.eventId;
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn && submitBtn.disabled) {
    if (window.showToast) window.showToast("Event is full.", "error");
    return;
  }
  const paxInput = form.querySelector("input[name='pax']");
  const pax = paxInput ? paxInput.value : "1";

  try {
    const response = await fetch(`/events/${encodeURIComponent(eventId)}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ pax }),
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const message = data?.error || "Unable to sign up. Please try again.";
      if (window.showToast) window.showToast(message, "error");
      return;
    }
    const message = data?.message || "Signed up successfully.";
    if (window.showToast) window.showToast(message, "success");
    window.dispatchEvent(new Event("cart:updated"));
  } catch (error) {
    if (window.showToast) window.showToast("Unable to sign up. Please try again.", "error");
  }
}

signupForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    signupEvent(form);
  });
});
