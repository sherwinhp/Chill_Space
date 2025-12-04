// Tiny middleware helpers to keep app.js tidy.

function requestLogger(req, res, next) {
  console.log(`${req.method} ${req.path}`);
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
  requestLogger,
  notFound,
  errorHandler,
};
