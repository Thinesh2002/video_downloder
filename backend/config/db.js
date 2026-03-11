const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,      
  user: process.env.DB_USER,      
  password: process.env.DB_PASS, 
  database: process.env.DB_NAME,
  port: 3306,                    
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("MySQL connected successfully.");
  } catch (err) {
    console.error("MySQL connection error:", err.message);
  }
})();

module.exports = pool;
