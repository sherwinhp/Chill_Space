const addonsRoot = document.querySelector("[data-room-addons]");

if (addonsRoot) {
  const roomId = Number(addonsRoot.dataset.roomId || 0);
  const lockNote = addonsRoot.querySelector("[data-addon-lock]");

  function hasRoomBooking(items) {
    return items.some(
      (item) => item.type === "room_booking" && Number(item.roomId) === roomId
    );
  }

  async function fetchCartItems() {
    const res = await fetch("/cart/items");
    if (!res.ok) return [];
    const payload = await res.json();
    return Array.isArray(payload.items) ? payload.items : [];
  }

  function updateButtons(hasBooking) {
    const buttons = addonsRoot.querySelectorAll("[data-addon-add]");
    buttons.forEach((button) => {
      const card = button.closest("[data-addon-card]");
      const available = card ? card.dataset.available === "1" : true;
      button.disabled = !available || !hasBooking;
    });
    if (lockNote) {
      lockNote.classList.toggle("is-hidden", hasBooking);
    }
  }

  async function refreshBookingState() {
    try {
      const items = await fetchCartItems();
      updateButtons(hasRoomBooking(items));
    } catch (error) {
      updateButtons(false);
    }
  }

  addonsRoot.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-addon-add]");
    if (!button) return;
    if (button.disabled) {
      if (window.showToast) {
        window.showToast("Add a room booking first to unlock add-ons.", "warning");
      }
      return;
    }
    const card = button.closest("[data-addon-card]");
    const itemId = card ? Number(card.dataset.id) : null;
    if (!itemId) return;
    try {
      const res = await fetch("/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: "menu",
          item_id: itemId,
          qty: 1,
          room_addon: true,
          room_id: roomId,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Unable to add add-on.");
      }
      window.dispatchEvent(new Event("cart:updated"));
      if (window.showToast) {
        window.showToast("Add-on added to cart.", "success");
      }
    } catch (error) {
      if (window.showToast) {
        window.showToast(error.message || "Unable to add add-on.", "error");
      }
    }
  });

  window.addEventListener("cart:updated", refreshBookingState);
  refreshBookingState();
}
