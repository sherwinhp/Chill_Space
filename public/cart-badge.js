function updateBadge() {
  fetch("/cart/items")
    .then((res) => res.json())
    .then(({ items }) => {
      const list = Array.isArray(items) ? items : [];
      const count = list.reduce((sum, item) => sum + Number(item.qty || 1), 0);
      document.querySelectorAll("[data-cart-count]").forEach((el) => {
        el.textContent = String(count);
        el.style.display = count > 0 ? "grid" : "none";
      });
    })
    .catch(() => {});
}

window.addEventListener("cart:updated", updateBadge);
window.addEventListener("DOMContentLoaded", updateBadge);
updateBadge();
