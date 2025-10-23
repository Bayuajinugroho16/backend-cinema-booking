import mysql from 'mysql2';
import dotenv from 'dotenv';

dotenv.config();

// Railway menggunakan MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
const dbConfig = {
  host: process.env.MYSQLHOST || 'localhost',
  port: process.env.MYSQLPORT || 3306,
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'cinema_booking',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.log('🔧 Database config:', {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database
    });
  } else {
    console.log('✅ Connected to MySQL database on Railway');
    console.log(`📊 Database: ${dbConfig.database}`);
    connection.release();
  }
});

// Enhanced connection test
const testConnection = () => {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
    } else {
      console.log('✅ Connected to MySQL database successfully!');
      console.log(`📊 Database: ${dbConfig.database}`);
      console.log(`🌐 Host: ${dbConfig.host}`);
      
      // Simple SQL query
      connection.query('SELECT 1 + 1 AS test_result', (queryErr, results) => {
        if (queryErr) {
          console.error('❌ Query test failed:', queryErr.message);
        } else {
          console.log('✅ Database query test successful:', results[0].test_result);
        }
        connection.release();
      });
    }
  });
};

// Handle connection errors
pool.on('error', (err) => {
  console.error('💥 Database pool error:', err);
  
  // Try to reconnect after 2 seconds
  setTimeout(() => {
    console.log('🔄 Attempting to reconnect to database...');
    testConnection();
  }, 2000);
});

// Auto-test connection saat startup
if (process.env.NODE_ENV !== 'test') {
  testConnection();
}

// ✅ ES MODULES EXPORT
export { pool, testConnection };