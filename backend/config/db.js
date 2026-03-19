"use strict";
const mysql = require("mysql2/promise");
const logger = require("../utils/logger");
require("dotenv").config();

const poolConfig = {
  host:              process.env.DB_HOST || "localhost",
  user:              process.env.DB_USER || "root",
  password:          process.env.DB_PASS || "",
  database:          process.env.DB_NAME,
  port:              parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit:   parseInt(process.env.DB_POOL_SIZE, 10) || 10,
  queueLimit:        0,
  // Hostinger VPS: keep connections alive under load
  enableKeepAlive:   true,
  keepAliveInitialDelay: 10_000,
  connectTimeout:    10_000,
  timezone:          "+00:00",
};

const pool = mysql.createPool(poolConfig);

// ─── Test connection on startup (with retry) ──────────────────────────────────
async function testConnection(retries = 5, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      logger.info("✅ MySQL connected successfully");
      return;
    } catch (err) {
      logger.warn(`MySQL connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) await new Promise((r) => setTimeout(r, delay));
    }
  }
  logger.error("❌ MySQL connection failed after all retries — continuing without DB");
}

testConnection();

module.exports = pool;
