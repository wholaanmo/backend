const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 50,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
  acquireTimeout: 10000, 
  timeout: 10000
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ DB connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL database!');
    connection.release();
  }
});

module.exports = pool;