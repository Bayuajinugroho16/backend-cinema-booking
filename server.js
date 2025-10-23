const express = require('express');
const path = require('path');
const cors = require('cors');
const authRoutes = require('./routes/auth');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

console.log('🚀 Starting server without WebSocket...');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/movies', require('./routes/movies'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/notifications', require('./routes/notifications'));

// Serve static files from React app (PRODUCTION)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running without WebSocket',
    timestamp: new Date().toISOString()
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎬 Cinema Booking API is RUNNING!',
    timestamp: new Date().toISOString(),
    status: 'OK',
    websocket: 'Disabled - Using HTTP Polling'
  });
});

// ✅ LOAD ROUTES
try {
  const movieRoutes = require('./routes/movies');
  const bookingRoutes = require('./routes/bookings');
  const notificationRoutes = require('./routes/notifications');
  
  app.use('/api/movies', movieRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/notifications', notificationRoutes);
  console.log('✅ Routes loaded successfully');
} catch (error) {
  console.error('❌ Route loading failed:', error);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
});

// ✅ PRODUCTION OPTIMIZATIONS
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// ✅ HEALTH CHECK ENDPOINT
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    memory_usage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// ✅ DATABASE TEST ENDPOINT
app.get('/api/debug/db', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    const connection = await pool.promise().getConnection();
    const [result] = await connection.execute('SELECT NOW() as time, DATABASE() as db, USER() as user');
    connection.release();
    
    res.json({
      success: true,
      message: 'Database connection successful!',
      data: result[0],
      environment: {
        host: process.env.MYSQLHOST || process.env.DB_HOST,
        database: process.env.MYSQLDATABASE || process.env.DB_NAME,
        node_env: process.env.NODE_ENV
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed: ' + error.message
    });
  }
});

// ✅ INITIALIZE DATABASE TABLES
app.get('/api/debug/init-db', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    const connection = await pool.promise().getConnection();
    
    console.log('🗄️ Initializing database tables...');
    
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role ENUM('user', 'admin') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create bookings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        showtime_id INT NOT NULL,
        customer_name VARCHAR(100) NOT NULL,
        customer_email VARCHAR(100) NOT NULL,
        customer_phone VARCHAR(20),
        total_amount DECIMAL(10,2) NOT NULL,
        seat_numbers JSON,
        booking_reference VARCHAR(50) UNIQUE NOT NULL,
        verification_code VARCHAR(50) UNIQUE NOT NULL,
        movie_title VARCHAR(255) NOT NULL,
        status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
        is_verified BOOLEAN DEFAULT FALSE,
        verified_at TIMESTAMP NULL,
        booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create movies table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS movies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration INT,
        genre VARCHAR(100),
        rating DECIMAL(3,1),
        poster_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert sample movies
    await connection.execute(`
      INSERT IGNORE INTO movies (id, title, description, duration, genre, rating) VALUES
      (1, 'The Batman', 'Batman melawan penjahat di Gotham City', 176, 'Action', 8.1),
      (2, 'Avatar: The Way of Water', 'Petualangan di planet Pandora', 192, 'Adventure', 7.6)
    `);
    
    // Insert admin user if not exists
    await connection.execute(`
      INSERT IGNORE INTO users (username, email, password, role) VALUES 
      ('admin', 'admin@bioskop.com', 'admin123', 'admin')
    `);
    
    connection.release();
    
    console.log('✅ Database tables initialized successfully!');
    
    res.json({
      success: true,
      message: 'Database tables created and sample data inserted!'
    });
  } catch (error) {
    console.error('Database init error:', error);
    res.status(500).json({
      success: false,
      message: 'Database initialization failed: ' + error.message
    });
  }
});

app.get('/api/debug/users', async (req, res) => {
  try {
    const { pool } = require('./config/database');
    const connection = await pool.promise().getConnection();
    const [users] = await connection.execute('SELECT id, username, email, role FROM users');
    connection.release();
    
    res.json({
      success: true,
      data: users,
      total: users.length
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users: ' + error.message
    });
  }
});

// Export app for Vercel
module.exports = app;