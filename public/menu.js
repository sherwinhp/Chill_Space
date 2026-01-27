const menuTabs = document.querySelectorAll(".menu-tab");
const menuGrid = document.querySelector("[data-menu-grid]");
const emptyState = document.querySelector(".menu-empty");
const normalizeCategory = (value) => (value || "").toString().trim().toLowerCase();
function addToCart(payload) {
  fetch("/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_type: "menu",
      item_id: payload.id,
      name: payload.name,
      price: payload.price,
      qty: 1,
    }),
  })
    .then((res) => res.json())
    .then(() => {
      window.dispatchEvent(new Event("cart:updated"));
      if (window.showToast) {
        window.showToast("Added to cart.", "success");
      }
    })
    .catch(() => {});
}

if (menuGrid) {
  menuGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-cart");
    if (!button) return;
    const card = button.closest(".menu-card");
    const item = {
      id: Number(card.dataset.id),
      name: card.dataset.name,
      price: Number(card.dataset.price),
    };
    addToCart(item);
  });
}

menuTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    menuTabs.forEach((btn) => btn.classList.remove("active"));
    tab.classList.add("active");
    const category = normalizeCategory(tab.dataset.category);
    if (!menuGrid) return;
    let visibleCount = 0;
    menuGrid.querySelectorAll(".menu-card").forEach((card) => {
      const cardCategory = normalizeCategory(card.dataset.category);
      const isMatch = cardCategory === category;
      card.hidden = !isMatch;
      if (isMatch) visibleCount += 1;
    });
    if (emptyState) {
      emptyState.classList.toggle("is-hidden", visibleCount > 0);
    }
  });
});

if (menuGrid) {
  const defaultCategory = "food";
  let visibleCount = 0;
  menuGrid.querySelectorAll(".menu-card").forEach((card) => {
    const cardCategory = normalizeCategory(card.dataset.category);
    const isMatch = cardCategory === defaultCategory;
    card.hidden = !isMatch;
    if (isMatch) visibleCount += 1;
  });
  if (emptyState) {
    emptyState.classList.toggle("is-hidden", visibleCount > 0);
  }
}

window.dispatchEvent(new Event("cart:updated"));
