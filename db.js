// Central place to configure the database connection.
// Uses mysql2 and dotenv; see the README section below on env vars.
const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Republic_C207", //"Republic_C207"
  database: process.env.DB_NAME || "chill_space",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function testConnection() {
  try {
    await query("SELECT 1");
    console.log("Database connection OK");
  } catch (error) {
    console.warn("Database connection failed (check .env):", error.message);
  }
}

module.exports = {
  pool,
  query,
  testConnection,
};
