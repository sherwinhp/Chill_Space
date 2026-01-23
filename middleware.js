
// Tiny middleware helpers to keep app.js tidy.
const crypto = require("crypto");

const sessions = {};

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function createSession(user, sid) {
  const sessionId = sid || crypto.randomBytes(16).toString("hex");
  sessions[sessionId] = { userId: user.id, role: user.role, name: user.name, email: user.email };
  return sessionId;
}

function sessionMiddleware(req, res, next) {
  req.session = null;
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  req.cartSid = sid || null;
  if (sid && sessions[sid]) {
    req.session = sessions[sid];
  }

  req.setSession = (user) => {
    const sessionId = createSession(user, req.cartSid);
    res.setHeader("Set-Cookie", `sid=${sessionId}; HttpOnly; Path=/`);
    req.session = sessions[sessionId];
    req.cartSid = sessionId;
  };

  req.clearSession = () => {
    if (sid) {
      delete sessions[sid];
      res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0");
    }
    req.session = null;
  };

  if (!req.cartSid) {
    const guestSid = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `sid=${guestSid}; HttpOnly; Path=/`);
    req.cartSid = guestSid;
  }

  next();
}

function requestLogger(req, res, next) {
  console.log(`${req.method} ${req.path}`);
  next();
}

function requireAuth(req, res, next) {
  if (!req.session) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== "admin") {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
}

function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(error, req, res, next) {
  console.error(error);
  res.status(500).json({ error: "Something went wrong on our end." });
}

module.exports = {
  sessionMiddleware,
  requestLogger,
  requireAuth,
  requireAdmin,
  notFound,
  errorHandler,
};
