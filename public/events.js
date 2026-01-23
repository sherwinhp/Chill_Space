const eventTabs = document.querySelectorAll(".event-tab");
const eventPanels = document.querySelectorAll(".event-panel");

const CART_KEY = "chill_cart";

function getCartTotal() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return 0;
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
  } catch (_) {
    return 0;
  }
}

function applyPromotions() {
  const total = getCartTotal();
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

applyPromotions();
