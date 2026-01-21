const roomsGrid = document.getElementById("rooms-grid");
const roomSelect = document.getElementById("room-select");
const bookingList = document.getElementById("booking-list");
const bookingStatus = document.getElementById("booking-status");
const menuGrid = document.getElementById("menu-grid");
const reviewsList = document.getElementById("reviews-list");
const eventsList = document.getElementById("events-list");
const cartContainer = document.getElementById("cart-container");
const loginBtn = document.getElementById("admin-login-btn");
const registerBtn = document.getElementById("register-btn");
const logoutBtn = document.getElementById("logout-btn");
const profilesBtn = document.getElementById("profiles-btn");

const state = {
  cart: [],
  user: null,
  rooms: [],
  menu: [],
};

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.target;
      document.querySelectorAll("section").forEach((sec) => {
        sec.hidden = sec.id !== target;
      });
    });
  });
}

async function loadSession() {
  try {
    const { user } = await fetchJSON("/api/auth/me");
    state.user = user;
    showProfile();
  } catch (error) {
    state.user = null;
    showProfile();
  }
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return res.json();
}

async function loadRooms() {
  const rooms = await fetchJSON("/api/rooms");
  state.rooms = rooms;
  renderRooms(rooms);
  renderRoomSelect(rooms);
}

function renderRooms(rooms) {
  roomsGrid.innerHTML = "";
  rooms.forEach((room) => {
    const card = document.createElement("article");
    card.className = "room-card";
    card.innerHTML = `
      <img src="${room.image}" alt="${room.name}" />
      <div class="room-body">
        <div>
          <div class="available">Available</div>
          <h3>${room.name}</h3>
          <p class="capacity">Capacity: ${room.capacity} people</p>
          <p>${room.description}</p>
        </div>
        <div class="tag-row">
          ${room.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
        </div>
        <div class="price">$${room.pricePerHour} / hour</div>
        <button class="btn" data-action="details" data-id="${room.id}">View details</button>
      </div>
    `;
    roomsGrid.appendChild(card);
  });

  roomsGrid.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action='details']");
    if (!btn) return;
    const roomId = Number(btn.dataset.id);
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return;
    alert(`${room.name}\nCapacity: ${room.capacity}\nPrice: $${room.pricePerHour}/hr\n\n${room.description}`);
  });
}

function renderRoomSelect(rooms) {
  roomSelect.innerHTML = `<option value="" disabled selected>Select a room</option>`;
  rooms.forEach((room) => {
    const opt = document.createElement("option");
    opt.value = room.id;
    opt.textContent = `${room.name} - ${room.capacity} pax`;
    roomSelect.appendChild(opt);
  });
}

async function loadBookings() {
  const bookings = await fetchJSON("/api/bookings");
  if (!bookings.length) {
    bookingList.innerHTML = "<p class='section-subtitle'>No bookings yet.</p>";
    return;
  }
  bookingList.innerHTML = bookings
    .map(
      (b) => `
      <div class="room-card" style="grid-template-rows:auto">
        <div class="room-body">
          <h4>${b.roomName}</h4>
          <p>${b.date} | ${b.startTime} - ${b.endTime}</p>
          <p class="capacity">Booked by ${b.name}</p>
        </div>
      </div>`
    )
    .join("");
}

async function submitBooking(event) {
  event.preventDefault();
  bookingStatus.textContent = "";
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    if (payload.startTime >= payload.endTime) {
      throw new Error("End time must be later than start time.");
    }
    await fetchJSON("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    bookingStatus.textContent = "Booking confirmed!";
    bookingStatus.style.color = "green";
    event.target.reset();
    loadBookings();
  } catch (error) {
    bookingStatus.textContent = error.message;
    bookingStatus.style.color = "red";
  }
}

async function checkSlot() {
  const formData = new FormData(document.getElementById("booking-form"));
  const payload = Object.fromEntries(formData.entries());
  if (!payload.roomId || !payload.date || !payload.startTime || !payload.endTime) {
    bookingStatus.textContent = "Fill in room, date, start, and end time.";
    bookingStatus.style.color = "red";
    return;
  }
  try {
    const result = await fetchJSON("/api/bookings/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    bookingStatus.textContent = result.available ? "Slot available!" : "Slot taken.";
    bookingStatus.style.color = result.available ? "green" : "red";
  } catch (error) {
    bookingStatus.textContent = error.message;
    bookingStatus.style.color = "red";
  }
}

async function loadMenu() {
  state.menu = await fetchJSON("/api/menu");
  renderMenu("Food");
  document.querySelectorAll(".menu-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".menu-tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderMenu(btn.dataset.category);
    });
  });

  menuGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    const itemId = Number(button.dataset.id);
    const item = state.menu.find((m) => m.id === itemId);
    addToCart(item);
  });
}

function renderMenu(category) {
  const items = state.menu.filter((item) => item.category === category);
  menuGrid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";
    card.innerHTML = `
      <h4>${item.name}</h4>
      <p class="section-subtitle" style="margin:0">${item.description}</p>
      <footer>
        <div>$${item.price}</div>
        <button class="btn primary" data-id="${item.id}">Add to Cart</button>
      </footer>
    `;
    menuGrid.appendChild(card);
  });
}

async function loadReviews() {
  const reviews = await fetchJSON("/api/reviews");
  reviewsList.innerHTML = reviews
    .map(
      (r) => `
    <div class="review-card">
      <strong>${r.name}</strong>
      <div class="stars">${"*".repeat(r.rating)}</div>
      <small>${r.date}</small>
      <p>${r.text}</p>
    </div>
  `
    )
    .join("");
}

async function loadEvents() {
  const events = await fetchJSON("/api/events");
  eventsList.innerHTML = "";
  events.forEach((ev) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.innerHTML = `
      <img src="${ev.image}" alt="${ev.title}" />
      <div class="event-body">
        <h3>${ev.title}</h3>
        <p>${ev.description}</p>
        <p class="capacity">${ev.startDate} - ${ev.endDate}</p>
      </div>
    `;
    eventsList.appendChild(card);
  });
}

async function loadCartPartial() {
  const res = await fetch("/partials/cart.ejs");
  const html = await res.text();
  cartContainer.innerHTML = html;
  cartContainer.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    const item = state.cart.find((c) => c.id === id);
    if (!item) return;
    if (action === "inc") item.qty += 1;
    if (action === "dec") item.qty = Math.max(1, item.qty - 1);
    if (action === "remove") state.cart = state.cart.filter((c) => c.id !== id);
    renderCart();
  });
  renderCart();
}

function addToCart(item) {
  const existing = state.cart.find((c) => c.id === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ ...item, qty: 1 });
  }
  renderCart();
}

function renderCart() {
  const itemsBox = cartContainer.querySelector(".cart-items");
  const empty = cartContainer.querySelector(".cart-empty");
  const summary = cartContainer.querySelector(".cart-summary");
  const totalEl = cartContainer.querySelector("#cart-total");

  if (!itemsBox || !empty || !summary) return;

  itemsBox.innerHTML = "";
  if (!state.cart.length) {
    empty.hidden = false;
    summary.hidden = true;
    itemsBox.hidden = true;
    return;
  }

  empty.hidden = true;
  summary.hidden = false;
  itemsBox.hidden = false;

  state.cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div><strong>${item.name}</strong><div class="capacity">$${item.price} each</div></div>
      <div>
        <button class="btn" data-action="dec" data-id="${item.id}">-</button>
        <span>${item.qty}</span>
        <button class="btn" data-action="inc" data-id="${item.id}">+</button>
        <button class="btn" data-action="remove" data-id="${item.id}">Remove</button>
      </div>
    `;
    itemsBox.appendChild(row);
  });

  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  totalEl.textContent = `$${total.toFixed(2)}`;
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    const { user } = await fetchJSON("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.user = user;
    document.getElementById("login-status").textContent = "Logged in!";
    showProfile();
    updateAuthButtons();
  } catch (error) {
    document.getElementById("login-status").textContent = error.message;
  }
}

function updateAuthButtons() {
  if (loginBtn) loginBtn.hidden = !!state.user;
  if (registerBtn) registerBtn.hidden = !!state.user;
  if (logoutBtn) logoutBtn.hidden = !state.user;
  if (profilesBtn) profilesBtn.hidden = !(state.user && state.user.role === "admin");
}

function showProfile() {
  updateAuthButtons();
}

async function handleLogout() {
  try {
    await fetchJSON("/api/auth/logout", { method: "POST" });
  } catch (_) {
    // ignore logout errors
  }
  state.user = null;
  showProfile();
  switchTab("rooms-section");
}

async function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    const { user } = await fetchJSON("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.user = user;
    document.getElementById("register-status").textContent = "Registered!";
    showProfile();
    updateAuthButtons();
  } catch (error) {
    document.getElementById("register-status").textContent = error.message;
  }
}

function setupTopButtons() {
  const cartBtn = document.getElementById("cart-btn");
  if (cartBtn) cartBtn.addEventListener("click", () => switchTab("cart-section"));
  if (registerBtn) registerBtn.addEventListener("click", () => {
    window.location.href = "/register";
  });
  if (loginBtn) loginBtn.addEventListener("click", () => {
    window.location.href = "/login";
  });
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  if (profilesBtn) profilesBtn.addEventListener("click", () => { window.location.href = "/admin/users"; });
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.target === id;
    tab.classList.toggle("active", active);
  });
  document.querySelectorAll("section").forEach((sec) => {
    sec.hidden = sec.id !== id;
  });
}

document.getElementById("booking-form").addEventListener("submit", submitBooking);
document.getElementById("check-slot").addEventListener("click", checkSlot);
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
if (loginForm) loginForm.addEventListener("submit", handleLogin);
if (registerForm) registerForm.addEventListener("submit", handleRegister);

setupTabs();
setupTopButtons();
loadRooms();
loadBookings();
loadMenu();
loadReviews();
loadEvents();
loadCartPartial();
loadSession();
updateAuthButtons();
