const menuTabs = document.querySelectorAll(".menu-tab");
const menuGrid = document.querySelector("[data-menu-grid]");
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
    const category = tab.dataset.category;
    if (!menuGrid) return;
    menuGrid.querySelectorAll(".menu-card").forEach((card) => {
      card.hidden = card.dataset.category !== category;
    });
  });
});

if (menuGrid) {
  const defaultCategory = "Food";
  menuGrid.querySelectorAll(".menu-card").forEach((card) => {
    card.hidden = card.dataset.category !== defaultCategory;
  });
}

window.dispatchEvent(new Event("cart:updated"));
