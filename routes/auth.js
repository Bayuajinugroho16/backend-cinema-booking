const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const router = express.Router(); // ✅ INI YANG DITAMBAHKAN

// User Login - FIXED
// User Login - FIXED VERSION (Handles both plain text and hashed passwords)
router.post('/login', async (req, res) => {
  let connection; // ✅ DEKLARASIKAN CONNECTION
  try {
    const { username, password } = req.body;
    console.log('🔐 Login attempt for:', username); // ✅ GUNAKAN USERNAME
    
    connection = await pool.promise().getConnection();
    
    // Find user by username
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE username = ?',
      [username] // ✅ GUNAKAN USERNAME
    );
    
    if (users.length === 0) {
      console.log('❌ User not found:', username);
      return res.status(400).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    const user = users[0];
    console.log('✅ User found:', user.username);
    console.log('🔑 Stored password length:', user.password.length);
    
    // ✅ SMART PASSWORD VALIDATION - HANDLES BOTH CASES
    let validPassword = false;
    
    if (user.password.length <= 20) {
      // Plain text password (short length)
      console.log('🔓 Using plain text comparison');
      validPassword = (password === user.password);
    } else {
      // Hashed password (bcrypt - 60 chars)
      console.log('🔐 Using bcrypt comparison');
      validPassword = await bcrypt.compare(password, user.password);
    }
    
    console.log('🔍 Password match:', validPassword);
    
    if (!validPassword) {
      console.log('❌ Password mismatch');
      return res.status(400).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    // Generate token
    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'bioskop-tiket-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('🎉 Login successful for:', user.username);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        token
      }
    });
    
  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});


// User Registration
router.post('/register', async (req, res) => {
  let connection;
  try {
    const { username, email, password, phone } = req.body;
    
    console.log('📝 Registration attempt for:', email);
    
    // Validasi field yang diperlukan
    if (!username || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'All fields (username, email, password, phone) are required'
      });
    }
    
    connection = await pool.promise().getConnection();
    
    // Check if user exists
    const [existingUsers] = await connection.execute(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const [result] = await connection.execute(
      'INSERT INTO users (username, email, password, phone) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, phone]
    );
    
    // Generate token
    const token = jwt.sign(
      { userId: result.insertId, role: 'user' },
      process.env.JWT_SECRET || 'bioskop-tiket-secret-key',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: result.insertId,
          username: username,
          email: email,
          role: 'user'
        },
        token
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});
module.exports = router; // ✅ JANGAN LUPA EXPORT