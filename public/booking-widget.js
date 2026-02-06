const OPEN_HOUR = 10;
const CLOSE_HOUR = 22;
const SLOT_MINUTES = 60;
const MONTHS_AHEAD = 3;
const MIN_LEAD_HOURS = 2;
const WEEKDAY_PEAK_START_HOUR = 18;
const WEEKDAY_PEAK_END_HOUR = 23;
const WEEKEND_PEAK_START_HOUR = 13;
const WEEKEND_PEAK_END_HOUR = 16;
const WEEKEND_PEAK2_START_HOUR = 20;
const WEEKEND_PEAK2_END_HOUR = 23;
const PEAK_SURCHARGE_RATE = 0.1;

const widget = document.querySelector("[data-booking-widget]");
const calendarEl = document.querySelector("[data-booking-calendar]");
const slotsEl = document.querySelector("[data-booking-slots]");
const summaryEl = document.querySelector("[data-booking-summary]");
const statusEl = document.querySelector("[data-booking-status]");
const addButton = document.querySelector("[data-booking-add]");
const packageRoot = document.querySelector("[data-addon-package]");
const addonTabs = packageRoot ? packageRoot.querySelectorAll("[data-addon-tab]") : [];
const addonPanels = packageRoot ? packageRoot.querySelectorAll("[data-addon-panel]") : [];
const addonCards = packageRoot ? packageRoot.querySelectorAll("[data-addon-select-card]") : [];
const addonQuantities = new Map();

const state = {
  roomId: null,
  roomName: "",
  normalRate: 12,
  peakRate: 15,
  bookings: [],
  selectedDate: null,
  selectedSlot: null,
  selectedRange: null,
  viewMonthIndex: 0,
  calendarBaseMonth: null,
  calendarStart: null,
  calendarEnd: null,
};

function dispatchCartUpdate() {
  window.dispatchEvent(new Event("cart:updated"));
}

function showAddonPanel(key) {
  if (!addonPanels.length) return;
  addonPanels.forEach((panel) => {
    const isTarget = panel.dataset.addonPanel === key;
    panel.classList.toggle("is-hidden", !isTarget);
  });
  addonTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.addonTab === key);
  });
}

function getAddonQty(id) {
  return addonQuantities.get(id) || 0;
}

function setAddonQty(id, qty) {
  if (!Number.isFinite(qty) || qty <= 0) {
    addonQuantities.delete(id);
    return 0;
  }
  addonQuantities.set(id, qty);
  return qty;
}

function updateAddonCard(card) {
  if (!card) return;
  const id = Number(card.dataset.addonId || 0);
  if (!id) return;
  const available = card.dataset.addonAvailable !== "0";
  const qty = getAddonQty(id);
  const valueEl = card.querySelector("[data-qty-value]");
  const decBtn = card.querySelector('[data-qty-action="dec"]');
  const incBtn = card.querySelector('[data-qty-action="inc"]');
  if (valueEl) valueEl.textContent = String(qty);
  if (decBtn) decBtn.disabled = !available || qty <= 0;
  if (incBtn) incBtn.disabled = !available;
  card.classList.toggle("is-selected", qty > 0);
  card.classList.toggle("is-disabled", !available);
}

function updateAllAddonCards() {
  if (!addonCards.length) return;
  addonCards.forEach((card) => updateAddonCard(card));
}

function getSelectedAddons() {
  const items = [];
  addonQuantities.forEach((qty, id) => {
    if (qty > 0) items.push({ id, qty });
  });
  return items;
}

function addAddonItem(itemId, qty) {
  return fetch("/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_type: "menu",
      item_id: itemId,
      qty: qty || 1,
      room_addon: true,
      room_id: state.roomId,
    }),
  })
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok) throw new Error(body.error || "Unable to add add-on.");
      return body;
    });
}

function applySelectedAddons(items) {
  if (!Array.isArray(items) || !items.length) {
    return Promise.resolve({ added: 0, failed: [] });
  }
  return Promise.allSettled(items.map((item) => addAddonItem(item.id, item.qty))).then(
    (results) => {
      const failed = results.filter((result) => result.status === "rejected");
      const added = results.length - failed.length;
      return { added, failed };
    }
  );
}

function toDateOnly(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(value) {
  return value.toLocaleDateString("en-SG", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value) {
  return value.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
}

function formatLocalDateTime(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function monthDiff(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function isPeakTime(value) {
  const day = value.getDay();
  const hour = value.getHours();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend) {
    return (
      (hour >= WEEKEND_PEAK_START_HOUR && hour < WEEKEND_PEAK_END_HOUR) ||
      (hour >= WEEKEND_PEAK2_START_HOUR && hour < WEEKEND_PEAK2_END_HOUR)
    );
  }
  return hour >= WEEKDAY_PEAK_START_HOUR && hour < WEEKDAY_PEAK_END_HOUR;
}

function getRateForTime(value) {
  if (!isPeakTime(value)) return state.normalRate;
  const surcharged = Number((state.peakRate * (1 + PEAK_SURCHARGE_RATE)).toFixed(2));
  return Number.isFinite(surcharged) && surcharged > 0 ? surcharged : state.peakRate;
}

function listDays(start, end) {
  const days = [];
  const cursor = toDateOnly(start);
  const last = toDateOnly(end);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function slotTimesForDay(day) {
  const slots = [];
  const start = new Date(day);
  start.setHours(OPEN_HOUR, 0, 0, 0);
  const end = new Date(day);
  end.setHours(CLOSE_HOUR, 0, 0, 0);

  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor.getTime() + SLOT_MINUTES * 60000);
    slots.push({ start: new Date(cursor), end: next });
    cursor = next;
  }
  return slots;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function isSlotAvailable(slot) {
  const now = new Date();
  const minStart = new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60000);
  if (slot.start < minStart) return false;
  return !state.bookings.some((booking) => {
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    return overlaps(slot.start, slot.end, start, end);
  });
}

function dayHasAvailability(day) {
  return slotTimesForDay(day).some((slot) => isSlotAvailable(slot));
}

function renderCalendar(start, end) {
  if (!calendarEl) return;
  calendarEl.innerHTML = "";
  const baseMonth = state.calendarBaseMonth || startOfMonth(new Date());
  const visibleMonth = addMonths(baseMonth, state.viewMonthIndex);
  const visibleStart = startOfMonth(visibleMonth);
  const visibleEnd = endOfMonth(visibleMonth);
  const days = listDays(visibleStart, visibleEnd).filter((day) => day >= toDateOnly(start) && day <= toDateOnly(end));

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  const prevDisabled = state.viewMonthIndex <= 0;
  const nextDisabled = state.viewMonthIndex >= MONTHS_AHEAD - 1;
  nav.innerHTML = `
    <button type="button" class="calendar-nav-btn" data-calendar-prev ${prevDisabled ? "disabled" : ""}>Previous</button>
    <h4 class="calendar-nav-label">${visibleMonth.toLocaleDateString("en-SG", {
      month: "long",
      year: "numeric",
    })}</h4>
    <button type="button" class="calendar-nav-btn" data-calendar-next ${nextDisabled ? "disabled" : ""}>Next</button>
  `;
  calendarEl.appendChild(nav);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  ["M", "T", "W", "T", "F", "S", "S"].forEach((label) => {
    const header = document.createElement("span");
    header.className = "calendar-weekday";
    header.textContent = label;
    grid.appendChild(header);
  });

  const offset = (visibleStart.getDay() + 6) % 7;
  for (let i = 0; i < offset; i += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    grid.appendChild(spacer);
  }

  days.forEach((day) => {
    const hasAvailability = dayHasAvailability(day);
    const dayClass = hasAvailability ? "available" : "booked";
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `calendar-day ${dayClass}`;
    if (!hasAvailability) {
      cell.classList.add("fully-booked");
    }
    if (state.selectedDate && isSameDay(state.selectedDate, day)) {
      cell.classList.add("selected");
    }
    cell.textContent = day.getDate();
    cell.dataset.date = day.toISOString();
    cell.addEventListener("click", () => selectDay(day));
    grid.appendChild(cell);
  });

  calendarEl.appendChild(grid);
  const prevBtn = calendarEl.querySelector("[data-calendar-prev]");
  const nextBtn = calendarEl.querySelector("[data-calendar-next]");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (state.viewMonthIndex <= 0) return;
      state.viewMonthIndex -= 1;
      renderCalendar(start, end);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (state.viewMonthIndex >= MONTHS_AHEAD - 1) return;
      state.viewMonthIndex += 1;
      renderCalendar(start, end);
    });
  }
}

function renderSlots(day) {
  if (!slotsEl) return;
  slotsEl.innerHTML = "";
  const slots = slotTimesForDay(day);

  slots.forEach((slot, index) => {
    const available = isSlotAvailable(slot);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `slot-btn ${available ? "available" : "booked"}`;
    if (available && isPeakTime(slot.start)) {
      btn.classList.add("peak");
    }
    btn.textContent = `${formatTime(slot.start)} - ${formatTime(slot.end)}`;
    btn.disabled = !available;
    btn.dataset.index = String(index);
    if (state.selectedRange && index >= state.selectedRange.start && index <= state.selectedRange.end) {
      btn.classList.add("selected");
    }
    btn.addEventListener("click", () => selectSlotRange(index, slots));
    slotsEl.appendChild(btn);
  });
}

function selectDay(day) {
  state.selectedDate = day;
  state.selectedSlot = null;
  state.selectedRange = null;
  if (state.calendarStart && state.calendarEnd) {
    renderCalendar(state.calendarStart, state.calendarEnd);
  }
  renderSlots(day);
  updateSummary();
  if (slotsEl) {
    slotsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function selectSlotRange(index, slots) {
  if (state.selectedRange) {
    const start = Math.min(state.selectedRange.start, index);
    const end = Math.max(state.selectedRange.start, index);
    const rangeSlots = slots.slice(start, end + 1);
    const allAvailable = rangeSlots.every((slot) => isSlotAvailable(slot));
    if (!allAvailable) {
      statusEl.textContent = "Selected range includes a booked slot.";
      return;
    }
    state.selectedRange = { start, end };
    state.selectedSlot = slots[start];
  } else {
    state.selectedRange = { start: index, end: index };
    state.selectedSlot = slots[index];
  }
  statusEl.textContent = "Pick an end time or add to cart.";
  renderSlots(state.selectedDate);
  updateSummary();
}

function updateSummary() {
  if (!summaryEl) return;
  if (!state.selectedDate || !state.selectedSlot) {
    summaryEl.textContent = "Select a day and time to continue.";
    addButton.disabled = true;
    return;
  }

  const startTime = state.selectedSlot.start;
  const slotCount = state.selectedRange ? state.selectedRange.end - state.selectedRange.start + 1 : 1;
  const endTime = new Date(startTime.getTime() + slotCount * SLOT_MINUTES * 60000);
  const hourlyRate = getRateForTime(startTime);
  const total = Number((slotCount * hourlyRate).toFixed(2));
  const rateLabel = isPeakTime(startTime)
    ? `Peak (+${Math.round(PEAK_SURCHARGE_RATE * 100)}%) (Weekdays 6pm-11pm, Weekends 1-4pm & 8-11pm)`
    : "Normal";
  summaryEl.textContent = `${state.roomName} - ${formatDate(state.selectedDate)} (${formatTime(
    startTime
  )} to ${formatTime(endTime)}) - ${rateLabel} $${hourlyRate.toFixed(2)}/hr - Total $${total.toFixed(2)}`;
  addButton.disabled = false;
  addButton.dataset.total = total.toFixed(2);
}

async function loadAvailability() {
  if (!state.roomId || !statusEl) return;
  statusEl.textContent = "Loading availability...";
  const start = toDateOnly(new Date());
  const end = addMonths(start, MONTHS_AHEAD);
  state.calendarBaseMonth = startOfMonth(start);
  state.calendarStart = start;
  state.calendarEnd = end;
  try {
    const res = await fetch(
      `/rooms/${state.roomId}/availability?start=${start.toISOString()}&end=${end.toISOString()}`
    );
    if (!res.ok) throw new Error("Unable to load availability");
    const payload = await res.json();
    state.bookings = payload.bookings || [];
    renderCalendar(start, end);
    statusEl.textContent = "Pick a date to see available slots.";
    applyPrefillSelection();
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

function bookSlot() {
  if (!state.selectedSlot || !state.selectedDate) return;
  const selectedAddons = getSelectedAddons();
  const startTime = state.selectedSlot.start;
  const slotCount = state.selectedRange ? state.selectedRange.end - state.selectedRange.start + 1 : 1;
  const endTime = new Date(startTime.getTime() + slotCount * SLOT_MINUTES * 60000);
  const hourlyRate = getRateForTime(startTime);
  const total = Number((slotCount * hourlyRate).toFixed(2));
  fetch(`/rooms/${state.roomId}/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start_time: formatLocalDateTime(startTime),
      end_time: formatLocalDateTime(endTime),
    }),
  })
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok) throw new Error(body.error || "Unable to hold slot.");
      return fetch("/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: "room_booking",
          name: `${state.roomName} booking`,
          price: total,
          qty: 1,
          room_id: state.roomId,
          start_time: formatLocalDateTime(startTime),
          end_time: formatLocalDateTime(endTime),
          hold_id: body.holdId,
          details: `${formatDate(state.selectedDate)} ${formatTime(startTime)}-${formatTime(endTime)}`,
        }),
      });
    })
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok) throw new Error(body.error || "Unable to add to cart.");
      state.bookings.push({
        startTime: formatLocalDateTime(startTime),
        endTime: formatLocalDateTime(endTime),
      });
      renderCalendar(toDateOnly(new Date()), addMonths(toDateOnly(new Date()), MONTHS_AHEAD));
      if (state.selectedDate) renderSlots(state.selectedDate);
      return applySelectedAddons(selectedAddons);
    })
    .then((result) => {
      dispatchCartUpdate();
      if (result && result.failed && result.failed.length) {
        if (statusEl) statusEl.textContent = "Booking added. Some add-ons could not be added.";
        if (window.showToast) {
          window.showToast("Booking added, but some add-ons failed.", "warning");
        }
        return;
      }
      if (statusEl) statusEl.textContent = "Added to cart.";
      if (window.showToast) {
        window.showToast("Booking added to cart.", "success");
        if (result && result.added) {
          window.showToast("Package add-ons added.", "success");
        }
      }
    })
    .catch((err) => {
      statusEl.textContent = err.message;
    });
}

function initWidget() {
  if (!widget) return;
  state.roomId = Number(widget.dataset.roomId);
  state.roomName = widget.dataset.roomName || "";
  state.normalRate = Number(widget.dataset.normalRate || 12);
  state.peakRate = Number(widget.dataset.peakRate || 15);
  const params = new URLSearchParams(window.location.search);
  const startParam = params.get("start");
  const endParam = params.get("end");
  if (startParam && endParam) {
    state.prefill = { start: startParam, end: endParam };
  }
  loadAvailability();
}

if (addButton) {
  addButton.addEventListener("click", bookSlot);
}

initWidget();

if (addonTabs.length) {
  addonTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      showAddonPanel(tab.dataset.addonTab);
    });
  });
  showAddonPanel(addonTabs[0].dataset.addonTab);
}

if (packageRoot) {
  packageRoot.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-qty-action]");
    if (!btn) return;
    const card = btn.closest("[data-addon-select-card]");
    if (!card) return;
    const available = card.dataset.addonAvailable !== "0";
    if (!available) return;
    const id = Number(card.dataset.addonId || 0);
    if (!id) return;
    const current = getAddonQty(id);
    const delta = btn.dataset.qtyAction === "inc" ? 1 : -1;
    const next = Math.max(0, current + delta);
    setAddonQty(id, next);
    updateAddonCard(card);
  });
  updateAllAddonCards();
}

function applyPrefillSelection() {
  if (!state.prefill || !state.prefill.start || !state.prefill.end) return;
  const startTime = new Date(state.prefill.start);
  const endTime = new Date(state.prefill.end);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return;

  state.selectedDate = toDateOnly(startTime);
  const slots = slotTimesForDay(state.selectedDate);
  const startIndex = slots.findIndex((slot) => slot.start.getTime() === startTime.getTime());
  const endIndex = slots.findIndex((slot) => slot.end.getTime() === endTime.getTime());
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return;

  state.selectedRange = { start: startIndex, end: endIndex };
  state.selectedSlot = slots[startIndex];
  if (state.calendarBaseMonth) {
    state.viewMonthIndex = Math.max(0, Math.min(MONTHS_AHEAD - 1, monthDiff(state.calendarBaseMonth, state.selectedDate)));
    renderCalendar(toDateOnly(new Date()), addMonths(toDateOnly(new Date()), MONTHS_AHEAD));
  }
  renderSlots(state.selectedDate);
  updateSummary();
  state.prefill = null;
}
