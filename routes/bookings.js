const express = require('express');
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// ✅ OCCUPIED SEATS ENDPOINT
router.get('/occupied-seats', async (req, res) => {
let connection;
try {
const { showtime_id, movie_title } = req.query;

    console.log('🎯 Fetching occupied seats for showtime:', showtime_id, 'and movie:', movie_title);

   if (!showtime_id || !movie_title) {
     return res.status(400).json({
       success: false,
       message: 'Showtime ID and Movie Title are required'
     });
   }

    connection = await pool.promise().getConnection();

    // Ambil semua booking yang confirmed untuk showtime ini
    const [bookings] = await connection.execute(
     'SELECT seat_numbers FROM bookings WHERE showtime_id = ? AND movie_title = ? AND status = "confirmed"',
     [showtime_id, movie_title]
   );

    console.log(`✅ Found ${bookings.length} bookings for showtime ${showtime_id}`);

    // Kumpulkan semua kursi yang sudah dipesan
    const occupiedSeats = new Set();
    bookings.forEach(booking => {
      try {
        let seats;
        if (typeof booking.seat_numbers === 'string') {
          try {
            seats = JSON.parse(booking.seat_numbers);
          } catch (e) {
            // Jika parsing gagal, anggap sebagai string biasa
            seats = booking.seat_numbers.split(',').map(seat => seat.trim().replace(/[\[\]"]/g, ''));
          }
        } else {
          seats = booking.seat_numbers;
        }

        // Pastikan seats adalah array
        if (Array.isArray(seats)) {
          seats.forEach(seat => {
            if (seat) {
              occupiedSeats.add(seat);
            }
          });
        } else {
          console.error('❌ seat_numbers is not an array:', seats);
        }
      } catch (error) {
        console.error('❌ Error processing seat_numbers:', error, booking);
      }
    });

    const occupiedSeatsArray = Array.from(occupiedSeats);
    console.log(`✅ Occupied seats for showtime ${showtime_id}:`, occupiedSeatsArray);

    res.json({
      success: true,
      data: occupiedSeatsArray
    });

  } catch (error) {
    console.error('❌ Error in occupied-seats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
      data: []
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ CREATE NEW BOOKING - DENGAN VALIDASI SEAT_NUMBERS
router.post('/', async (req, res) => {
  let connection;
  try {
    const {
      showtime_id,
      customer_name,
      customer_email,
      customer_phone,
      seat_numbers,
      total_amount,
      movie_title
    } = req.body;

    console.log('📥 Received booking creation request:', req.body);

    // ✅ VALIDASI LEBIH KETAT - CEK SEAT_NUMBERS TIDAK BOLEH EMPTY
    if (!showtime_id || !customer_name || !customer_email || !seat_numbers || !total_amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: showtime_id, customer_name, customer_email, seat_numbers, total_amount'
      });
    }

    // ✅ VALIDASI KHUSUS UNTUK SEAT_NUMBERS
    console.log('🔍 Validating seat_numbers:', {
      seat_numbers: seat_numbers,
      type: typeof seat_numbers,
      isArray: Array.isArray(seat_numbers),
      length: Array.isArray(seat_numbers) ? seat_numbers.length : 'N/A'
    });

    if (Array.isArray(seat_numbers) && seat_numbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal 1 kursi sebelum melakukan booking'
      });
    }

    if (typeof seat_numbers === 'string' && (seat_numbers === '[]' || seat_numbers === '')) {
      return res.status(400).json({
        success: false,
        message: 'Data kursi tidak valid'
      });
    }

    if (!seat_numbers || seat_numbers === null || seat_numbers === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Data kursi harus diisi'
      });
    }

    connection = await pool.promise().getConnection();

    // Generate unique booking reference dan verification code
    const booking_reference = 'BK' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    const verification_code = Math.floor(100000 + Math.random() * 900000).toString();

    console.log('🆕 Generated booking reference:', booking_reference);

    // ✅ PASTIKAN SEAT_NUMBERS VALID SEBELUM DISIMPAN
    let seatNumbersToSave;
    
    if (Array.isArray(seat_numbers)) {
      // Filter out empty values
      const validSeats = seat_numbers.filter(seat => 
        seat !== null && 
        seat !== undefined && 
        seat !== '' &&
        String(seat).trim() !== ''
      );
      
      if (validSeats.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada kursi valid yang dipilih'
        });
      }
      
      seatNumbersToSave = JSON.stringify(validSeats);
      console.log('✅ Valid seats to save:', validSeats);
    } else {
      // Handle single seat
      const seatStr = String(seat_numbers).trim();
      if (seatStr === '' || seatStr === '[]') {
        return res.status(400).json({
          success: false,
          message: 'Kursi tidak valid'
        });
      }
      seatNumbersToSave = JSON.stringify([seatStr]);
    }

    // Insert booking ke database
    const query = `
      INSERT INTO bookings 
      (showtime_id, customer_name, customer_email, customer_phone, seat_numbers, total_amount, movie_title, booking_reference, verification_code, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const [result] = await connection.execute(query, [
      showtime_id,
      customer_name,
      customer_email,
      customer_phone || null,
      seatNumbersToSave, // ✅ GUNAKAN YANG SUDAH DIVALIDASI
      total_amount,
      movie_title || null,
      booking_reference,
      verification_code
    ]);

    const bookingId = result.insertId;

    console.log('✅ Booking created with ID:', bookingId);
    console.log('💾 Seat numbers saved:', seatNumbersToSave);

    // Dapatkan data booking yang baru dibuat
    const [newBookings] = await connection.execute(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId]
    );

    const newBooking = newBookings[0];

    // Parse seat_numbers untuk response
    let parsedSeatNumbers;
    try {
      parsedSeatNumbers = JSON.parse(newBooking.seat_numbers);
      console.log('📤 Response seat_numbers:', parsedSeatNumbers);
    } catch (error) {
      parsedSeatNumbers = [newBooking.seat_numbers];
    }

    // Response sukses
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        id: newBooking.id,
        booking_reference: newBooking.booking_reference,
        verification_code: newBooking.verification_code,
        customer_name: newBooking.customer_name,
        customer_email: newBooking.customer_email,
        customer_phone: newBooking.customer_phone,
        total_amount: newBooking.total_amount,
        seat_numbers: parsedSeatNumbers,
        status: newBooking.status,
        booking_date: newBooking.booking_date,
        movie_title: newBooking.movie_title,
        showtime_id: newBooking.showtime_id
      }
    });

  } catch (error) {
    console.error('❌ Booking creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});// ✅ CONFIRM PAYMENT - ENDPOINT YANG HILANG (INI PENYEBAB 404)
router.post('/confirm-payment', async (req, res) => {
  let connection;
  try {
    const { booking_reference } = req.body;
    
    console.log('💰 Confirming payment for:', booking_reference);

    if (!booking_reference) {
      return res.status(400).json({
        success: false,
        message: 'Booking reference is required'
      });
    }

    connection = await pool.promise().getConnection();
    
    // Update status dari pending ke confirmed
    const [result] = await connection.execute(
      'UPDATE bookings SET status = "confirmed" WHERE booking_reference = ? AND status = "pending"',
      [booking_reference]
    );
    
    if (result.affectedRows === 0) {
      const [existing] = await connection.execute(
        'SELECT status FROM bookings WHERE booking_reference = ?',
        [booking_reference]
      );
      
      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Booking tidak ditemukan'
        });
      } else if (existing[0].status === 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Booking sudah dikonfirmasi sebelumnya'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Booking tidak dapat dikonfirmasi (status bukan pending)'
        });
      }
    }
    
    // Get updated booking dengan seat numbers
    const [bookings] = await connection.execute(
      'SELECT * FROM bookings WHERE booking_reference = ?',
      [booking_reference]
    );
    
    const booking = bookings[0];
    
    // Parse seat_numbers
    let seatNumbers;
    try {
      seatNumbers = JSON.parse(booking.seat_numbers);
    } catch (error) {
      seatNumbers = typeof booking.seat_numbers === 'string' 
        ? booking.seat_numbers.split(',').map(s => s.trim())
        : [booking.seat_numbers];
    }
    
    console.log('✅ Payment confirmed for:', booking_reference);
    
    // ✅ BROADCAST REAL-TIME UPDATE KE SEMUA CLIENT
    if (global.broadcastSeatUpdate) {
      console.log('📢 Broadcasting seat update after payment confirmation');
      
      const seatUpdates = seatNumbers.map(seatNumber => ({
        seat_number: seatNumber,
        status: 'booked',
        booking_reference: booking.booking_reference,
        action: 'booking_confirmed',
        timestamp: new Date().toISOString()
      }));
      
      global.broadcastSeatUpdate(booking.showtime_id, seatUpdates);
    }
    
    // Response data dengan QR code untuk e-ticket
    const responseData = {
      ...booking,
      seat_numbers: seatNumbers,
      qr_code_data: JSON.stringify({
        type: 'CINEMA_TICKET',
        booking_reference: booking.booking_reference,
        verification_code: booking.verification_code,
        movie: booking.movie_title,
        seats: seatNumbers,
        showtime_id: booking.showtime_id,
        total_paid: booking.total_amount,
        timestamp: new Date().toISOString()
      })
    };
    
    res.json({
      success: true,
      message: 'Pembayaran berhasil dikonfirmasi! Tiket Anda sudah aktif.',
      data: responseData
    });
    
  } catch (error) {
    console.error('❌ Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Konfirmasi pembayaran gagal: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ SCAN TICKET - HAPUS DUPLIKAT, GUNAKAN YANG INI SAJA
router.post('/scan-ticket', async (req, res) => {
  let connection;
  try {
    const { qr_data } = req.body;
    
    console.log('🔍 Scanning QR ticket:', qr_data);
    
    if (!qr_data) {
      return res.status(400).json({
        valid: false,
        message: 'QR data is required'
      });
    }

    // Parse QR data
    let ticketInfo;
    try {
      ticketInfo = JSON.parse(qr_data);
    } catch (parseError) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid QR code format'
      });
    }

    connection = await pool.promise().getConnection();
    
    // Cari booking berdasarkan reference
    const [bookings] = await connection.execute(
      'SELECT * FROM bookings WHERE booking_reference = ? AND status = "confirmed"',
      [ticketInfo.booking_reference]
    );
    
    if (bookings.length === 0) {
      return res.json({
        valid: false,
        message: 'Tiket tidak valid atau tidak ditemukan'
      });
    }
    
    const booking = bookings[0];
    
    // Verifikasi kode
    if (booking.verification_code !== ticketInfo.verification_code) {
      return res.json({
        valid: false,
        message: 'Kode verifikasi tidak sesuai'
      });
    }
    
    // Check jika sudah digunakan
    if (booking.is_verified) {
      return res.json({
        valid: false,
        message: 'Tiket sudah digunakan sebelumnya',
        used_at: booking.verified_at
      });
    }
    
    // Mark as verified
    await connection.execute(
      'UPDATE bookings SET is_verified = 1, verified_at = NOW() WHERE booking_reference = ?',
      [ticketInfo.booking_reference]
    );
    
    console.log('✅ Ticket verified successfully:', ticketInfo.booking_reference);
    
    // Parse seat numbers
    let seatNumbers;
    try {
      seatNumbers = JSON.parse(booking.seat_numbers);
    } catch (error) {
      seatNumbers = typeof booking.seat_numbers === 'string' 
        ? booking.seat_numbers.split(',').map(s => s.trim())
        : [booking.seat_numbers];
    }
    
    // ✅ BROADCAST REAL-TIME UPDATE - KURSI SUDAH DIVALIDASI
    if (global.broadcastSeatUpdate) {
      console.log('📢 Broadcasting seat validation update');
      
      const seatUpdates = seatNumbers.map(seatNumber => ({
        seat_number: seatNumber,
        status: 'occupied',
        booking_reference: booking.booking_reference,
        action: 'ticket_validated',
        timestamp: new Date().toISOString()
      }));
      
      global.broadcastSeatUpdate(booking.showtime_id, seatUpdates);
    }
    
    res.json({
      valid: true,
      message: 'Tiket valid - Silakan masuk',
      ticket_info: {
        movie: booking.movie_title,
        booking_reference: booking.booking_reference,
        showtime_id: booking.showtime_id,
        seats: seatNumbers,
        customer: booking.customer_name,
        total_paid: booking.total_amount,
        status: 'VERIFIED',
        verification_code: booking.verification_code
      }
    });
    
  } catch (error) {
    console.error('❌ QR scan error:', error);
    res.status(500).json({
      valid: false,
      message: 'Scan error: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ PERBAIKI BACKEND GET BOOKINGS - RETURN STRING, NOT ARRAY
// ✅ PERBAIKI BACKEND GET BOOKINGS - WORKING VERSION
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await pool.promise().getConnection();
    
    const [bookings] = await connection.execute(`
      SELECT * FROM bookings ORDER BY id DESC
    `);

    console.log('🔧 PROCESSING', bookings.length, 'BOOKINGS');
    
    const parsedBookings = bookings.map(booking => {
      console.log(`\n🎫 Booking ${booking.id}:`, {
        raw: booking.seat_numbers,
        type: typeof booking.seat_numbers,
        length: booking.seat_numbers?.length
      });
      
      let seatNumbersString = '';

      try {
        // ✅ FIX: Handle semua kemungkinan format
        if (!booking.seat_numbers || booking.seat_numbers === '[]' || booking.seat_numbers === '') {
          console.log(`   ⚠️ Empty data`);
          seatNumbersString = '';
        } 
        else {
          // ✅ PASTIKAN parsing berhasil untuk format ["L3"]
          const parsed = JSON.parse(booking.seat_numbers);
          console.log(`   ✅ Parsed successfully:`, parsed);
          
          if (Array.isArray(parsed)) {
            if (parsed.length > 0) {
              // ✅ KONVERSI ARRAY KE STRING
              seatNumbersString = parsed.join(', ');
              console.log(`   🎯 Converted to string: "${seatNumbersString}"`);
            } else {
              console.log(`   ⚠️ Empty array after parsing`);
              seatNumbersString = '';
            }
          } 
          else if (parsed) {
            // Single value
            seatNumbersString = String(parsed);
            console.log(`   🎯 Single seat: "${seatNumbersString}"`);
          }
        }
      } 
      catch (parseError) {
        console.log(`   ❌ Parse error:`, parseError.message);
        seatNumbersString = '';
      }
      
      return {
        ...booking,
        seat_numbers: seatNumbersString
      };
    });

    // ✅ FINAL VERIFICATION
    console.log('\n📊 FINAL VERIFICATION:');
    const withSeats = parsedBookings.filter(b => b.seat_numbers && b.seat_numbers !== '');
    const withoutSeats = parsedBookings.filter(b => !b.seat_numbers || b.seat_numbers === '');
    
    console.log('   With seats:', withSeats.length);
    console.log('   Without seats:', withoutSeats.length);
    
    withSeats.forEach(booking => {
      console.log(`   ✅ ${booking.id}: "${booking.seat_numbers}"`);
    });
    
    res.json({
      success: true,
      data: parsedBookings
    });
    
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ BACKEND DEBUG - SPESIFIK UNTUK `["L3"]`
router.get('/debug-l3-parsing', async (req, res) => {
  try {
    const testData = '["L3"]'; // Data dari database
    
    console.log('🔍 DEBUG PARSING ["L3"]:');
    console.log('Raw data:', testData);
    console.log('Type:', typeof testData);
    console.log('Length:', testData.length);
    console.log('Char codes:');
    for (let i = 0; i < testData.length; i++) {
      console.log(`  [${i}]: '${testData[i]}' (code: ${testData.charCodeAt(i)})`);
    }

    // TEST 1: JSON.parse langsung
    console.log('🧪 TEST 1 - JSON.parse:');
    try {
      const parsed1 = JSON.parse(testData);
      console.log('  Result:', parsed1);
      console.log('  Is array:', Array.isArray(parsed1));
      console.log('  Array length:', Array.isArray(parsed1) ? parsed1.length : 'N/A');
      console.log('  First element:', Array.isArray(parsed1) ? parsed1[0] : 'N/A');
      console.log('  Join result:', Array.isArray(parsed1) ? parsed1.join(', ') : 'N/A');
    } catch (e1) {
      console.log('  ❌ Error:', e1.message);
    }

    // TEST 2: Manual parsing
    console.log('🧪 TEST 2 - Manual parsing:');
    const cleaned = testData.replace(/[\[\]"]/g, '');
    console.log('  Cleaned:', cleaned);
    const manualSeats = cleaned.split(',').filter(s => s.trim() !== '');
    console.log('  Manual result:', manualSeats);
    console.log('  Manual string:', manualSeats.join(', '));

    res.json({
      success: true,
      tests: {
        raw_data: testData,
        json_parse: JSON.parse(testData),
        manual_parse: manualSeats
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// ✅ GET USER BOOKINGS - MY TICKETS
router.get('/my-bookings', async (req, res) => {
  let connection;
  try {
    // ✅ DAPATKAN USERNAME DARI TOKEN ATAU QUERY PARAM
    const username = req.query.username || req.headers['username'] || req.user?.username;
    
    console.log('👤 Fetching tickets for user:', username);
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required',
        data: []
      });
    }
    
    connection = await pool.promise().getConnection();
    
    const query = `
      SELECT 
        id,
        booking_reference,
        verification_code,
        customer_name,
        customer_email,
        customer_phone,
        total_amount,
        seat_numbers,
        status,
        booking_date,
        movie_title,
        showtime_id,
        is_verified,
        verified_at,
        qr_code_data
      FROM bookings 
      WHERE customer_name = ? OR customer_email = ?
      ORDER BY booking_date DESC
    `;
    
    const [bookings] = await connection.execute(query, [username, username]);
    
    console.log(`✅ Found ${bookings.length} bookings for ${username}`);
    
    // Process the bookings data
    const parsedBookings = bookings.map(booking => {
      let seatNumbers = [];
      try {
        seatNumbers = JSON.parse(booking.seat_numbers);
      } catch (error) {
        if (typeof booking.seat_numbers === 'string') {
          seatNumbers = booking.seat_numbers.replace(/[\[\]"]/g, '').split(',').map(s => s.trim());
        }
      }
      
      const showtimeMap = {
        1: '18:00 - Studio 1',
        2: '20:30 - Studio 1', 
        3: '21:00 - Studio 2',
        4: '10:00 - Studio 1',
        5: '13:00 - Studio 2',
        6: '16:00 - Studio 1',
        7: '19:00 - Studio 2'
      };

      const statusMap = {
        'pending': { text: 'Pending Payment', class: 'pending' },
        'confirmed': { text: 'Confirmed', class: 'confirmed' },
        'cancelled': { text: 'Cancelled', class: 'cancelled' }
      };
      
      const statusInfo = statusMap[booking.status] || { text: booking.status, class: 'unknown' };
      
     return {
        id: booking.id,
        booking_reference: booking.booking_reference,
        verification_code: booking.verification_code,
        movie_title: booking.movie_title,
        seat_numbers: seatNumbers,
        showtime_id: booking.showtime_id,
        showtime: showtimeMap[booking.showtime_id] || `Showtime ${booking.showtime_id}`,
        total_amount: booking.total_amount,
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        customer_phone: booking.customer_phone,
        status: booking.status,
        status_text: statusInfo.text,
        status_class: statusInfo.class,
        booking_date: booking.booking_date,
        is_verified: booking.is_verified,
        verified_at: booking.verified_at,
        qr_code_data: booking.qr_code_data,
        formatted_booking_date: new Date(booking.booking_date).toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };
    });
    
    res.json({
      success: true,
      data: parsedBookings,
      summary: {
        total: parsedBookings.length,
        confirmed: parsedBookings.filter(b => b.status === 'confirmed').length,
        pending: parsedBookings.filter(b => b.status === 'pending').length,
        cancelled: parsedBookings.filter(b => b.status === 'cancelled').length
      }
    });
    
} catch (error) {
    console.error('❌ ERROR in /my-bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
      data: []
    });
  } finally {
    if (connection) connection.release();
  }
});





// Configure multer untuk file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/payments/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    // Hanya terima image dan PDF
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed!'), false);
    }
  }
});


// ✅ UPLOAD PAYMENT PROOF ENDPOINT - PERBAIKAN
router.post('/upload-payment', upload.single('payment_proof'), async (req, res) => {
  let connection;
  try {
    console.log('📁 Payment proof upload received');
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }
    
    if (!req.body.booking_reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Booking reference is required' 
      });
    }
    
    console.log('File info:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    console.log('Booking reference:', req.body.booking_reference);
    
    connection = await pool.promise().getConnection();
    
    // Cek dulu apakah booking exists
    const [bookings] = await connection.execute(
      'SELECT id, status FROM bookings WHERE booking_reference = ?',
      [req.body.booking_reference]
    );
    
    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    const booking = bookings[0];
    console.log('Found booking:', booking);
    
    // Update booking dengan payment proof
    const [result] = await connection.execute(
      'UPDATE bookings SET payment_proof = ? WHERE booking_reference = ?',
      [req.file.filename, req.body.booking_reference]
    );
    
    console.log('Update result:', result);
    
    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update booking with payment proof'
      });
    }
    
    console.log('✅ Payment proof uploaded for booking:', req.body.booking_reference);
    
    res.json({
      success: true,
      message: 'Payment proof uploaded successfully',
      fileName: req.file.filename,
      filePath: `/uploads/payments/${req.file.filename}`,
      originalName: req.file.originalname,
      bookingReference: req.body.booking_reference
    });
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ GET UPLOADED PAYMENT PROOFS
router.get('/uploaded-payments', async (req, res) => {
  let connection;
  try {
    connection = await pool.promise().getConnection();
    
    const [payments] = await connection.execute(`
      SELECT 
        booking_reference,
        customer_name,
        movie_title,
        total_amount,
        payment_proof,
        status,
        booking_date
      FROM bookings 
      WHERE payment_proof IS NOT NULL 
      ORDER BY booking_date DESC
    `);
    
    console.log('💰 Uploaded payments found:', payments.length);
    
    res.json({
      success: true,
      count: payments.length,
      data: payments
    });
    
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ BUNDLE - CREATE BUNDLE ORDER (NEW ENDPOINT)
// ✅ BUNDLE - CREATE BUNDLE ORDER (FINAL FIX)
router.post('/create-bundle-order', async (req, res) => {
  let connection;
  try {
    const {
      order_reference,
      bundle_id,
      bundle_name,
      bundle_description,
      bundle_price,
      original_price,
      savings,
      quantity,
      total_price,
      customer_name,
      customer_phone,
      customer_email
    } = req.body;

    console.log('🎁 Creating bundle order:', { order_reference, bundle_name, customer_name });

    // Validasi required fields
    if (!order_reference || !bundle_name || !customer_name || !customer_phone || !customer_email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    connection = await pool.promise().getConnection();

    // Cari atau buat showtime khusus untuk bundle
    let bundleShowtimeId = null;
    try {
      // Cari movie_id yang ada untuk digunakan sebagai referensi
      const [movies] = await connection.execute('SELECT id FROM movies LIMIT 1');
      const movieId = movies.length > 0 ? movies[0].id : 1;
      
      // Cari theater_id yang ada
      const [theaters] = await connection.execute('SELECT id FROM theaters LIMIT 1');
      const theaterId = theaters.length > 0 ? theaters[0].id : 1;

      // Cek apakah sudah ada showtime untuk bundle
      const [existingShowtimes] = await connection.execute(
        'SELECT id FROM showtimes WHERE movie_id = ? AND theater_id = ? AND start_time = "2024-01-01 12:00:00"',
        [movieId, theaterId]
      );

      if (existingShowtimes.length > 0) {
        bundleShowtimeId = existingShowtimes[0].id;
        console.log('✅ Using existing bundle showtime_id:', bundleShowtimeId);
      } else {
        // Buat showtime khusus untuk bundle
        const [showtimeResult] = await connection.execute(
          `INSERT INTO showtimes (
            movie_id, theater_id, start_time, end_time, price, available_seats
          ) VALUES (?, ?, '2024-01-01 12:00:00', '2024-01-01 14:00:00', 0, 999)`,
          [movieId, theaterId]
        );
        bundleShowtimeId = showtimeResult.insertId;
        console.log('✅ Created bundle showtime with ID:', bundleShowtimeId);
      }
    } catch (showtimeError) {
      console.log('❌ Error creating bundle showtime:', showtimeError.message);
      // Fallback: cari showtime_id yang ada
      const [showtimes] = await connection.execute('SELECT id FROM showtimes LIMIT 1');
      bundleShowtimeId = showtimes.length > 0 ? showtimes[0].id : 1;
      console.log('🔄 Using fallback showtime_id:', bundleShowtimeId);
    }

    // INSERT bundle order dengan showtime_id yang valid
    const query = `
      INSERT INTO bookings (
        booking_reference,
        customer_name,
        customer_email,
        customer_phone,
        total_amount,
        status,
        payment_status,
        movie_title,
        order_type,
        bundle_id,
        bundle_name,
        bundle_description,
        original_price,
        savings,
        quantity,
        showtime_id,
        seat_numbers
      ) VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, 'bundle', ?, ?, ?, ?, ?, ?, ?, '[]')
    `;

    const values = [
      order_reference,
      customer_name,
      customer_email,
      customer_phone,
      total_price,
      bundle_name, // untuk movie_title
      bundle_id || null,
      bundle_name,
      bundle_description || null,
      original_price || bundle_price,
      savings || 0,
      quantity || 1,
      bundleShowtimeId // Gunakan showtime_id yang valid
    ];

    console.log('📝 Executing query with showtime_id:', bundleShowtimeId);

    const [result] = await connection.execute(query, values);

    console.log('✅ Bundle order created with ID:', result.insertId);

    // Get the created order
    const [orders] = await connection.execute(
      'SELECT * FROM bookings WHERE id = ?',
      [result.insertId]
    );

    res.json({
      success: true,
      message: 'Bundle order created successfully',
      orderId: result.insertId,
      orderReference: order_reference,
      data: orders[0]
    });

  } catch (error) {
    console.error('❌ Bundle order creation error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create bundle order: ' + error.message,
      sqlError: error.sqlMessage
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ BUNDLE - UPLOAD PAYMENT PROOF (NEW ENDPOINT)
router.post('/bundle-upload-payment', upload.single('payment_proof'), async (req, res) => {
  let connection;
  try {
    console.log('📁 NEW Bundle payment proof upload received');
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }
    
    if (!req.body.order_reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order reference is required' 
      });
    }
    
    console.log('Bundle payment file:', req.file.filename);
    console.log('Order reference:', req.body.order_reference);
    
    connection = await pool.promise().getConnection();
    
    // Cek apakah bundle order exists
    const [orders] = await connection.execute(
      `SELECT id FROM bookings WHERE booking_reference = ? AND order_type = 'bundle'`,
      [req.body.order_reference]
    );
    
    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bundle order not found'
      });
    }
    
    // Update dengan payment proof
    const [result] = await connection.execute(
      `UPDATE bookings SET 
        payment_proof = ?,
        payment_status = 'pending',
        payment_date = CURRENT_TIMESTAMP
       WHERE booking_reference = ?`,
      [req.file.filename, req.body.order_reference]
    );
    
    console.log('✅ NEW Payment proof uploaded for bundle order:', req.body.order_reference);
    
    res.json({
      success: true,
      message: 'Bundle payment proof uploaded successfully',
      fileName: req.file.filename,
      filePath: `/uploads/payments/${req.file.filename}`,
      orderReference: req.body.order_reference
    });
    
  } catch (error) {
    console.error('❌ NEW Bundle payment upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ BUNDLE ORDER - CREATE NEW BUNDLE ORDER (CLEAN VERSION)
router.post('/bundle-order', async (req, res) => {
  let connection;
  try {
    const {
      order_reference,
      bundle_id,
      bundle_name,
      bundle_description,
      bundle_price,
      original_price,
      savings,
      quantity,
      total_price,
      customer_name,
      customer_phone,
      customer_email
    } = req.body;

    console.log('🛒 Creating bundle order:', { order_reference, bundle_name, customer_name });

    // Validasi required fields
    if (!order_reference || !bundle_name || !customer_name || !customer_phone || !customer_email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: order_reference, bundle_name, customer_name, customer_phone, customer_email'
      });
    }

    connection = await pool.promise().getConnection();

    // HANYA gunakan kolom yang ADA di struktur tabel
    const query = `
      INSERT INTO bookings (
        booking_reference,
        customer_name,
        customer_email,
        customer_phone,
        total_amount,
        status,
        payment_status,
        movie_title,
        order_type,
        bundle_id,
        bundle_name,
        bundle_description,
        original_price,
        savings,
        quantity,
        showtime_id,
        seat_numbers
      ) VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, 'bundle', ?, ?, ?, ?, ?, ?, 0, '[]')
    `;

    const values = [
      order_reference,
      customer_name,
      customer_email,
      customer_phone,
      total_price,
      bundle_name, // untuk movie_title
      bundle_id || null,
      bundle_name,
      bundle_description || null,
      original_price || bundle_price,
      savings || 0,
      quantity || 1
    ];

    console.log('📝 Executing query:', query);
    console.log('📦 With values:', values);

    const [result] = await connection.execute(query, values);

    console.log('✅ Bundle order created with ID:', result.insertId);

    // Get the created order
    const [orders] = await connection.execute(
      'SELECT * FROM bookings WHERE id = ?',
      [result.insertId]
    );

    res.json({
      success: true,
      message: 'Bundle order created successfully',
      orderId: result.insertId,
      orderReference: order_reference,
      data: orders[0]
    });

  } catch (error) {
    console.error('❌ Bundle order creation error:', error);
    
    // Berikan error message yang sangat detail
    let errorMessage = 'Failed to create bundle order';
    if (error.sqlMessage) {
      errorMessage += `: ${error.sqlMessage}`;
      console.log('🔍 SQL Error Details:', {
        code: error.code,
        errno: error.errno,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState
      });
    } else {
      errorMessage += `: ${error.message}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      sqlError: error.sqlMessage,
      errorCode: error.code
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ BUNDLE ORDER - UPLOAD PAYMENT PROOF (FIXED)
router.post('/bundle-order/upload-payment', upload.single('payment_proof'), async (req, res) => {
  let connection;
  try {
    console.log('📁 Bundle payment proof upload received');
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }
    
    if (!req.body.order_reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order reference is required' 
      });
    }
    
    console.log('Bundle payment file info:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    console.log('Bundle order reference:', req.body.order_reference);
    
    connection = await pool.promise().getConnection();
    
    // Cek apakah bundle order exists
    const [orders] = await connection.execute(
      `SELECT id, order_type FROM bookings 
       WHERE booking_reference = ? AND order_type = 'bundle'`,
      [req.body.order_reference]
    );
    
    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bundle order not found'
      });
    }
    
    const order = orders[0];
    console.log('Found bundle order:', order);
    
    // Update bundle order dengan payment proof - HANYA kolom yang ada
    const [result] = await connection.execute(
      `UPDATE bookings SET 
        payment_proof = ?,
        payment_status = 'pending',
        payment_date = CURRENT_TIMESTAMP
       WHERE booking_reference = ? AND order_type = 'bundle'`,
      [req.file.filename, req.body.order_reference]
    );
    
    console.log('Bundle order update result:', result);
    
    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update bundle order with payment proof'
      });
    }
    
    console.log('✅ Payment proof uploaded for bundle order:', req.body.order_reference);
    
    res.json({
      success: true,
      message: 'Bundle payment proof uploaded successfully',
      fileName: req.file.filename,
      filePath: `/uploads/payments/${req.file.filename}`,
      originalName: req.file.originalname,
      orderReference: req.body.order_reference
    });
    
  } catch (error) {
    console.error('❌ Bundle payment upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  } finally {
    if (connection) connection.release();
  }
});
// ✅ BUNDLE ORDER - CONFIRM PAYMENT
router.post('/bundle-order/confirm-payment', async (req, res) => {
  let connection;
  try {
    const { order_reference, payment_proof } = req.body;

    console.log('✅ Confirming bundle payment for:', order_reference);

    if (!order_reference) {
      return res.status(400).json({
        success: false,
        message: 'Order reference is required'
      });
    }

    connection = await pool.promise().getConnection();

    // Update status bundle order
    const [result] = await connection.execute(
      `UPDATE bookings SET 
        status = 'waiting_verification',
        payment_status = 'pending',
        payment_date = CURRENT_TIMESTAMP
       WHERE booking_reference = ? AND order_type = 'bundle'`,
      [order_reference]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bundle order not found'
      });
    }

    console.log('✅ Bundle payment confirmed:', order_reference);

    // Get updated order data
    const [orders] = await connection.execute(
      `SELECT * FROM bookings WHERE booking_reference = ? AND order_type = 'bundle'`,
      [order_reference]
    );

    res.json({
      success: true,
      message: 'Bundle payment confirmed successfully',
      data: orders[0]
    });

  } catch (error) {
    console.error('❌ Bundle payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm bundle payment: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// ✅ GET ALL BUNDLE ORDERS (untuk admin)
router.get('/bundle-orders', async (req, res) => {
  let connection;
  try {
    connection = await pool.promise().getConnection();
    
    const [orders] = await connection.execute(`
      SELECT 
        id,
        booking_reference,
        bundle_name,
        bundle_description,
        total_amount,
        original_price,
        savings,
        quantity,
        customer_name,
        customer_phone,
        customer_email,
        payment_proof,
        payment_status,
        status,
        order_date,
        payment_date
      FROM bookings 
      WHERE order_type = 'bundle'
      ORDER BY order_date DESC
    `);
    
    console.log('📦 Bundle orders found:', orders.length);
    
    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
    
  } catch (error) {
    console.error('Error fetching bundle orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bundle orders: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;