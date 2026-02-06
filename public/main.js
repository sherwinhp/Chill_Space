(() => {
  const STACK_CLASS = "toast-stack";

  function getStack() {
    let stack = document.querySelector(`.${STACK_CLASS}`);
    if (!stack) {
      stack = document.createElement("div");
      stack.className = STACK_CLASS;
      document.body.appendChild(stack);
    }
    return stack;
  }

  window.showToast = (message, type = "info") => {
    if (!message) return;
    const stack = getStack();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const removeToast = () => {
      toast.classList.remove("show");
      toast.addEventListener(
        "transitionend",
        () => {
          toast.remove();
        },
        { once: true }
      );
    };

    setTimeout(removeToast, 2200);
  };
})();

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

const tabs = document.querySelectorAll(".tab");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
  });
});

window.addEventListener("scroll", () => {
  const sections = Array.from(document.querySelectorAll("main .section")).filter(
    (section) => section.id
  );
  if (!sections.length) return;
  const offset = 120;
  let currentId = sections[0].id;
  sections.forEach((section) => {
    if (window.scrollY + offset >= section.offsetTop) {
      currentId = section.id;
    }
  });
  tabs.forEach((tab) => {
    const href = tab.getAttribute("href");
    tab.classList.toggle("active", href === `#${currentId}`);
  });
});

const searchInputs = document.querySelectorAll("[data-search-input]");

function normalizeQuery(value) {
  return (value || "").toString().trim().toLowerCase();
}

searchInputs.forEach((input) => {
  const key = input.dataset.searchInput;
  if (!key || key === "menu") return;
  const items = Array.from(document.querySelectorAll(`[data-search-item="${key}"]`));
  if (!items.length) return;
  const emptyStates = Array.from(
    document.querySelectorAll(`[data-search-empty="${key}"]`)
  );

  const updateSearch = () => {
    const query = normalizeQuery(input.value);
    const hasQuery = query.length > 0;
    const visibleByScope = new Map();

    items.forEach((item) => {
      const scope = item.dataset.searchScope || "default";
      const text = normalizeQuery(item.dataset.searchText || item.textContent);
      const isMatch = !hasQuery || text.includes(query);
      const isFiltered = item.classList.contains("is-filtered");
      item.classList.toggle("is-hidden", !isMatch);
      if (isMatch && !isFiltered) {
        visibleByScope.set(scope, (visibleByScope.get(scope) || 0) + 1);
      }
    });

    emptyStates.forEach((emptyState) => {
      const scope = emptyState.dataset.searchScope || "default";
      const visibleCount = visibleByScope.get(scope) || 0;
      emptyState.classList.toggle("is-hidden", !hasQuery || visibleCount > 0);
    });
  };

  input.addEventListener("input", updateSearch);
  updateSearch();
});
