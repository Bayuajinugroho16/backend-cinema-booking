const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const authRoutes = require('./routes/auth');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

console.log('🚀 Starting server...');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/api/auth', authRoutes);

// ✅ BUAT HTTP SERVER DARI EXPRESS APP
const server = http.createServer(app);

// ✅ WEBSOCKET SERVER MENGGUNAKAN SERVER YANG SAMA
const wss = new WebSocket.Server({ 
  server, // Gunakan server HTTP yang sama
  path: '/ws' // Optional: path khusus untuk WebSocket
});

// Store connected clients per showtime
const clients = new Map();
// Store user connections untuk notifikasi personal
const userConnections = new Map();

wss.on('connection', (ws, req) => {
  console.log('🔌 New WebSocket connection');
  
  // Extract showtime dan user email dari query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const showtime = url.searchParams.get('showtime');
  const userEmail = url.searchParams.get('userEmail'); // Untuk notifikasi personal
  
  if (showtime) {
    if (!clients.has(showtime)) {
      clients.set(showtime, new Set());
    }
    clients.get(showtime).add(ws);
    ws.showtimeId = showtime;
    
    console.log(`📡 Client subscribed to showtime: ${showtime}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: `Subscribed to showtime ${showtime}`,
      timestamp: new Date().toISOString()
    }));
  }
  
  // Store user email jika ada (untuk notifikasi personal)
  if (userEmail) {
    ws.userEmail = userEmail;
    if (!userConnections.has(userEmail)) {
      userConnections.set(userEmail, new Set());
    }
    userConnections.get(userEmail).add(ws);
    
    console.log(`👤 User ${userEmail} connected to WebSocket`);
  }
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 WebSocket message received:', data);
      
      // Handle different message types
      if (data.type === 'PING') {
        ws.send(JSON.stringify({
          type: 'PONG',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('❌ WebSocket message parse error:', error);
    }
  });
  
  // ✅ PASTIKAN INI DI DALAM 'connection' EVENT
  ws.on('close', () => {
    console.log(`🔌 WebSocket connection closed for showtime: ${ws.showtimeId}, user: ${ws.userEmail}`);
    
    // Remove dari clients map
    if (ws.showtimeId && clients.has(ws.showtimeId)) {
      clients.get(ws.showtimeId).delete(ws);
      if (clients.get(ws.showtimeId).size === 0) {
        clients.delete(ws.showtimeId);
      }
    }
    
    // Remove dari user connections map
    if (ws.userEmail && userConnections.has(ws.userEmail)) {
      userConnections.get(ws.userEmail).delete(ws);
      if (userConnections.get(ws.userEmail).size === 0) {
        userConnections.delete(ws.userEmail);
      }
    }
  });
  
  // ✅ PASTIKAN INI JUGA DI DALAM 'connection' EVENT
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// ✅ GLOBAL NOTIFICATION FUNCTIONS (taruh di server.js setelah WebSocket setup)

// ✅ FUNCTION UNTUK BROADCAST NOTIFICATION KE SEMUA CLIENT
global.broadcastNotification = function(notificationData) {
  const message = JSON.stringify({
    type: 'NOTIFICATION',
    notification: notificationData,
    timestamp: new Date().toISOString()
  });
  
  let sentCount = 0;
  
  // Broadcast ke semua connected clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });
  
  console.log(`📢 Notification broadcast to ${sentCount} clients:`, notificationData.title);
  return sentCount;
};

// ✅ FUNCTION UNTUK KIRIM NOTIFICATION KE USER TERTENTU
global.sendNotificationToUser = function(userEmail, notificationData) {
  const message = JSON.stringify({
    type: 'NOTIFICATION',
    notification: notificationData,
    timestamp: new Date().toISOString()
  });
  
  let sentCount = 0;
  
  // Cari client dengan email tertentu
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.userEmail === userEmail) {
      client.send(message);
      sentCount++;
    }
  });
  
  console.log(`📧 Notification sent to ${userEmail} (${sentCount} clients):`, notificationData.title);
  return sentCount;
};

// ✅ FUNCTION UNTUK MENDAPATKAN JUMLAH CLIENT TERKONEKSI
global.getConnectedClientsCount = function() {
  let count = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) count++;
  });
  return count;
};

// ✅ Function untuk broadcast seat update (bisa diakses dari route manapun)
global.broadcastSeatUpdate = function(showtimeId, seatData) {
  if (!clients.has(showtimeId)) {
    console.log(`⚠️ No clients subscribed to showtime ${showtimeId}`);
    return;
  }
  
  const showtimeClients = clients.get(showtimeId);
  const message = JSON.stringify({
    type: 'SEAT_UPDATE',
    showtimeId: showtimeId,
    seats: seatData,
    timestamp: new Date().toISOString()
  });
  
  let sentCount = 0;
  showtimeClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });
  
  console.log(`📢 Broadcast seat update to ${sentCount} clients for showtime ${showtimeId}:`, seatData);
};

// ✅ LOAD ROUTES
try {
  const movieRoutes = require('./routes/movies');
  const bookingRoutes = require('./routes/bookings');
  const notificationRoutes = require('./routes/notifications'); // ✅ TAMBAHKAN INI
  
  app.use('/api/movies', movieRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/notifications', notificationRoutes); // ✅ TAMBAHKAN INI
  console.log('✅ Routes loaded successfully');
} catch (error) {
  console.error('❌ Route loading failed:', error);
}

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎬 Cinema Booking API is RUNNING!',
    timestamp: new Date().toISOString(),
    status: 'OK',
    websocket: 'Active on /ws'
  });
});

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

// ✅ PRODUCTION OPTIMIZATIONS FOR RAILWAY
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

// ✅ HEALTH CHECK ENDPOINT (WAJIB untuk Railway)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    websocket_clients: global.getConnectedClientsCount ? global.getConnectedClientsCount() : 0,
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

// ✅ START SERVER YANG SAMA UNTUK BOTH HTTP & WEBSOCKET
server.listen(PORT, () => {
  console.log(`⚡ Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket available on ws://localhost:${PORT}/ws`);
  console.log(`⏰ Started at: ${new Date().toLocaleTimeString()}`);
  
  // Debug: Show registered routes
  console.log('🔄 Registered routes:');
  console.log('   GET  /');
  console.log('   POST /api/auth/login');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/bookings');
  console.log('   GET  /api/bookings/occupied-seats');
  console.log('   POST /api/bookings/confirm-payment');
  console.log('   POST /api/bookings/scan-ticket');
  console.log('   GET  /api/bookings');
  console.log('   GET  /api/bookings/my-bookings');
  console.log('   POST /api/notifications/broadcast');
  console.log('   POST /api/notifications/send-to-user');
  console.log('   POST /api/notifications/send-to-movie-audience');
  console.log('   GET  /api/notifications/history');
  console.log('   GET  /api/notifications/connected-clients');
  console.log('   POST /api/notifications/system/:template');
});