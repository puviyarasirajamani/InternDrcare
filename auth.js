const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { db } = require("./database");

const JWT_SECRET =
  process.env.JWT_SECRET || "development_access_secret_change_this";

const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "development_refresh_secret_change_this";

const ACCESS_TOKEN_EXPIRY =
  process.env.ACCESS_TOKEN_EXPIRY || "15m";

const REFRESH_TOKEN_EXPIRY =
  process.env.REFRESH_TOKEN_EXPIRY || "7d";

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY
    }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenId: crypto.randomUUID()
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

function saveRefreshToken(userId, token) {
  const decoded = verifyRefreshToken(token);

  const expiresAt = new Date(
    decoded.exp * 1000
  ).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (
      user_id,
      token,
      expires_at
    )
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

function deleteRefreshToken(token) {
  db.prepare(`
    DELETE FROM refresh_tokens
    WHERE token = ?
  `).run(token);
}

function validateRefreshToken(token) {
  const tokenRecord = db.prepare(`
    SELECT *
    FROM refresh_tokens
    WHERE token = ?
      AND expires_at > ?
  `).get(token, new Date().toISOString());

  return tokenRecord || null;
}

function cleanExpiredRefreshTokens() {
  db.prepare(`
    DELETE FROM refresh_tokens
    WHERE expires_at <= ?
  `).run(new Date().toISOString());
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  saveRefreshToken,
  deleteRefreshToken,
  validateRefreshToken,
  cleanExpiredRefreshTokens
};