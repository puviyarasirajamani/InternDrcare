
const jwt = require("jsonwebtoken");

const SECRET =
  process.env.JWT_SECRET ||
  "development-only-change-this-secret";

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: "Please log in to continue."
    });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (_error) {
    return res.status(401).json({
      error: "Session expired. Please log in again."
    });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "You do not have permission to do that."
      });
    }

    next();
  };
}

function sanitizeString(value, max = 5000) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, max);
}

function validateRequired(body, fields) {
  const missing = fields.filter(
    field => !String(body[field] ?? "").trim()
  );

  return missing.length
    ? `Required fields: ${missing.join(", ")}`
    : null;
}

module.exports = {
  authenticate,
  authorize,
  sanitizeString,
  validateRequired,
  JWT_SECRET: SECRET
};
