const OPEN_HOUR = 10;
const CLOSE_HOUR = 22;
const SLOT_MINUTES = 60;
const MONTHS_AHEAD = 3;

const widget = document.querySelector("[data-booking-widget]");
const calendarEl = document.querySelector("[data-booking-calendar]");
const slotsEl = document.querySelector("[data-booking-slots]");
const summaryEl = document.querySelector("[data-booking-summary]");
const statusEl = document.querySelector("[data-booking-status]");
const addButton = document.querySelector("[data-booking-add]");

const state = {
  roomId: null,
  roomName: "",
  roomRate: 0,
  bookings: [],
  selectedDate: null,
  selectedSlot: null,
  selectedRange: null,
};

function dispatchCartUpdate() {
  window.dispatchEvent(new Event("cart:updated"));
}

function toDateOnly(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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
  if (slot.start <= now) return false;
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

  const days = listDays(start, end);
  const byMonth = days.reduce((acc, day) => {
    const key = `${day.getFullYear()}-${day.getMonth()}`;
    if (!acc[key]) {
      acc[key] = {
        label: day.toLocaleDateString("en-SG", { month: "long", year: "numeric" }),
        days: [],
      };
    }
    acc[key].days.push(day);
    return acc;
  }, {});

  Object.values(byMonth).forEach((month) => {
    const section = document.createElement("div");
    section.className = "calendar-month";
    section.innerHTML = `<h4>${month.label}</h4>`;

    const grid = document.createElement("div");
    grid.className = "calendar-grid";

    month.days.forEach((day) => {
      const available = dayHasAvailability(day);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `calendar-day ${available ? "available" : "booked"}`;
      cell.textContent = day.getDate();
      cell.dataset.date = day.toISOString();
      cell.addEventListener("click", () => selectDay(day));
      grid.appendChild(cell);
    });

    section.appendChild(grid);
    calendarEl.appendChild(section);
  });
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
  const total = Number((slotCount * state.roomRate).toFixed(2));
  summaryEl.textContent = `${state.roomName} - ${formatDate(state.selectedDate)} (${formatTime(
    startTime
  )} to ${formatTime(endTime)})`;
  addButton.disabled = false;
  addButton.dataset.total = total.toFixed(2);
}

async function loadAvailability() {
  if (!state.roomId || !statusEl) return;
  statusEl.textContent = "Loading availability...";
  const start = toDateOnly(new Date());
  const end = addMonths(start, MONTHS_AHEAD);
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
  const startTime = state.selectedSlot.start;
  const slotCount = state.selectedRange ? state.selectedRange.end - state.selectedRange.start + 1 : 1;
  const endTime = new Date(startTime.getTime() + slotCount * SLOT_MINUTES * 60000);
  const total = Number((slotCount * state.roomRate).toFixed(2));
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
      dispatchCartUpdate();
      statusEl.textContent = "Added to cart.";
      if (window.showToast) {
        window.showToast("Booking added to cart.", "success");
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
  state.roomRate = Number(widget.dataset.roomRate || 0);
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
  renderSlots(state.selectedDate);
  updateSummary();
  state.prefill = null;
}
