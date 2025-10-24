const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const router = express.Router();

// Input validation helper
const validateInput = (input) => {
  return typeof input === 'string' && input.trim().length > 0;
};

// User Login - OPTIMIZED VERSION
router.post('/login', async (req, res) => {
  let connection;
  
  try {
    const { username, password } = req.body;
    
    // ✅ Validasi input
    if (!validateInput(username) || !validateInput(password)) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    console.log('🔐 Login attempt for:', username);
    
    connection = await pool.promise().getConnection();
    
    // ✅ Find user by username dengan kolom yang spesifik (hindari SELECT *)
    const [users] = await connection.execute(
      'SELECT id, username, email, password, role, phone FROM users WHERE username = ?',
      [username.trim()]
    );
    
    if (users.length === 0) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ // ✅ 401 untuk unauthorized
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    const user = users[0];
    console.log('✅ User found:', user.username);
    
    // ✅ ENHANCED PASSWORD VALIDATION
    let validPassword = false;
    
    // Deteksi tipe password
    const isLikelyHashed = user.password.length === 60 && user.password.startsWith('$2');
    
    if (isLikelyHashed) {
      // Bcrypt hashed password
      console.log('🔐 Using bcrypt comparison');
      validPassword = await bcrypt.compare(password, user.password);
    } else {
      // Plain text password (for migration purposes)
      console.log('🔓 Using plain text comparison');
      validPassword = (password === user.password);
      
      // ✅ OPSIONAL: Auto-upgrade ke hashed password jika plain text terdeteksi
      if (validPassword) {
        console.log('🔄 Auto-upgrading plain text password to hash...');
        const hashedPassword = await bcrypt.hash(password, 10);
        await connection.execute(
          'UPDATE users SET password = ? WHERE id = ?',
          [hashedPassword, user.id]
        );
        console.log('✅ Password upgraded to hash');
      }
    }
    
    if (!validPassword) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
    
    // ✅ Generate token dengan data yang lebih aman
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        role: user.role 
      },
      process.env.JWT_SECRET || 'bioskop-tiket-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('🎉 Login successful for:', user.username);
    
    // ✅ Response konsisten tanpa mengekspos password
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role
        },
        token
      }
    });
    
  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
      // Jangan expose detail error ke client di production
    });
  } finally {
    if (connection) connection.release();
  }
});
  
// User Registration - TANPA AUTO LOGIN
router.post('/register', async (req, res) => {
  let connection;
  
  try {
    const { username, email, password, phone } = req.body;
    
    console.log('📝 Registration attempt for:', username);
    
    // ✅ VALIDASI
    if (!validateInput(username) || !validateInput(password) || !validateInput(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, dan nomor telepon harus diisi'
      });
    }
    
    // ✅ EMAIL OPSIONAL - GUNAKAN DEFAULT
    const userEmail = email && email.trim() !== '' ? email.trim() : `${username}@no-email.com`;
    
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Format email tidak valid'
        });
      }
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password harus minimal 6 karakter'
      });
    }
    
    connection = await pool.promise().getConnection();
    
    await connection.beginTransaction();
    
    try {
      const [existingUsers] = await connection.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username.trim(), userEmail]
      );
      
      if (existingUsers.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: 'Username atau email sudah digunakan'
        });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const [result] = await connection.execute(
        'INSERT INTO users (username, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
        [username.trim(), userEmail, hashedPassword, phone.trim(), 'user']
      );
      
      // ✅ HAPUS GENERATE TOKEN - TIDAK AUTO LOGIN
      // const token = jwt.sign(...);
      
      await connection.commit();
      
      console.log('✅ User registered successfully:', username);
      
      res.status(201).json({
        success: true,
        message: 'Registrasi berhasil! Silakan login.',
        data: {
          user: {
            id: result.insertId,
            username: username.trim(),
            email: userEmail,
            phone: phone.trim(),
            role: 'user'
          }
          // ✅ HAPUS TOKEN DARI RESPONSE
          // token: token
        }
      });
      
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    }
    
  } catch (error) {
    console.error('💥 Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registrasi gagal: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;