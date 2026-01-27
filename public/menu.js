const menuTabs = document.querySelectorAll(".menu-tab");
const menuGrid = document.querySelector("[data-menu-grid]");
const emptyState = document.querySelector(".menu-empty");
const menuSearchInput = document.querySelector('[data-search-input="menu"]');
const normalizeCategory = (value) => (value || "").toString().trim().toLowerCase();
const normalizeQuery = (value) => (value || "").toString().trim().toLowerCase();

function getActiveCategory() {
  const activeTab = document.querySelector(".menu-tab.active");
  if (activeTab && activeTab.dataset.category) {
    return normalizeCategory(activeTab.dataset.category);
  }
  if (menuTabs.length) {
    return normalizeCategory(menuTabs[0].dataset.category);
  }
  return "food";
}

function applyMenuFilter() {
  if (!menuGrid) return;
  const category = getActiveCategory();
  const query = normalizeQuery(menuSearchInput ? menuSearchInput.value : "");
  let visibleCount = 0;
  menuGrid.querySelectorAll(".menu-card").forEach((card) => {
    const cardCategory = normalizeCategory(card.dataset.category);
    const cardText = normalizeQuery(card.dataset.searchText || card.textContent);
    const isMatch = cardCategory === category && (!query || cardText.includes(query));
    card.hidden = !isMatch;
    if (isMatch) visibleCount += 1;
  });
  if (emptyState) {
    emptyState.classList.toggle("is-hidden", visibleCount > 0);
  }
}
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
    applyMenuFilter();
  });
});

if (menuGrid) {
  applyMenuFilter();
}

if (menuSearchInput) {
  menuSearchInput.addEventListener("input", () => {
    applyMenuFilter();
  });
}

window.dispatchEvent(new Event("cart:updated"));
