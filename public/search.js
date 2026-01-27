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
      item.classList.toggle("is-hidden", !isMatch);
      if (isMatch) {
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
