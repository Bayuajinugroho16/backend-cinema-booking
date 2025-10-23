const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

class Booking {
  static async create(bookingData) {
    const {
      showtime_id,
      customer_name,
      customer_email,
      total_amount,
      seat_numbers
    } = bookingData;

    const bookingReference = `CINEMA-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const verificationCode = Math.random().toString(36).substr(2, 6).toUpperCase();

    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Create booking
      const [bookingResult] = await connection.execute(
        `INSERT INTO bookings 
        (showtime_id, customer_name, customer_email, total_amount, seat_numbers, booking_reference, verification_code) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [showtime_id, customer_name, customer_email, total_amount, JSON.stringify(seat_numbers), bookingReference, verificationCode]
      );

      const bookingId = bookingResult.insertId;

      // 2. Generate QR Code data
      const qrData = {
        bookingId: bookingId,
        reference: bookingReference,
        verificationCode: verificationCode,
        customerName: customer_name,
        seats: seat_numbers,
        timestamp: new Date().toISOString()
      };

      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData));

      // 3. Update booking with QR code
      await connection.execute(
        'UPDATE bookings SET qr_code_data = ? WHERE id = ?',
        [qrCodeDataURL, bookingId]
      );

      // 4. Get complete booking details
      const [bookings] = await connection.execute(`
        SELECT b.*, m.title as movie_title, m.duration, s.start_time, s.price, t.name as theater_name
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN theaters t ON s.theater_id = t.id
        WHERE b.id = ?
      `, [bookingId]);

      await connection.commit();

      return {
        ...bookings[0],
        qrCodeData: qrCodeDataURL,
        seat_numbers: JSON.parse(bookings[0].seat_numbers)
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async verifyTicket(verificationCode) {
    const [bookings] = await pool.execute(`
      SELECT b.*, m.title as movie_title, s.start_time, t.name as theater_name
      FROM bookings b
      JOIN showtimes s ON b.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      WHERE b.verification_code = ? AND b.is_verified = FALSE
    `, [verificationCode]);

    if (bookings.length === 0) {
      return null;
    }

    const booking = bookings[0];
    
    // Mark as verified
    await pool.execute(
      'UPDATE bookings SET is_verified = TRUE, verified_at = NOW() WHERE id = ?',
      [booking.id]
    );

    return {
      ...booking,
      seat_numbers: JSON.parse(booking.seat_numbers),
      is_verified: true,
      verified_at: new Date()
    };
  }

  static async getByReference(bookingReference) {
    const [bookings] = await pool.execute(`
      SELECT b.*, m.title as movie_title, m.duration, s.start_time, s.price, t.name as theater_name
      FROM bookings b
      JOIN showtimes s ON b.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      WHERE b.booking_reference = ?
    `, [bookingReference]);

    if (bookings.length === 0) {
      return null;
    }

    return {
      ...bookings[0],
      seat_numbers: JSON.parse(bookings[0].seat_numbers)
    };
  }
}

module.exports = Booking;