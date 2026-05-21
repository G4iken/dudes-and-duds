const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

const signToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: user.role === 'admin' ? process.env.JWT_ADMIN_EXPIRES_IN : process.env.JWT_EXPIRES_IN }
  );

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length)
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hash, phone || null]
    );

    const user = { id: result.insertId, name, email, role: 'customer' };
    const token = signToken(user);

    res.status(201).json({ success: true, message: 'Account created', token, user });
  } catch (err) {
    console.error('register:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (!rows.length)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ success: true, message: 'Login successful', token, user: safeUser });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
              COUNT(DISTINCT o.id) AS order_count
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'User not found' });

    // Fetch addresses
    const [addresses] = await pool.query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC',
      [req.user.id]
    );

    res.json({ success: true, user: { ...rows[0], addresses } });
  } catch (err) {
    console.error('getMe:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/auth/me
const updateMe = async (req, res) => {
  try {
    const { name, phone } = req.body;
    await pool.query(
      'UPDATE users SET name = ?, phone = ? WHERE id = ?',
      [name || req.user.name, phone || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    console.error('updateMe:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const [rows] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match)
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('changePassword:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/address
const addAddress = async (req, res) => {
  try {
    const { label, full_name, phone, line1, line2, city, province, zip, is_default } = req.body;

    if (is_default) {
      await pool.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }

    const [result] = await pool.query(
      `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, province, zip, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, label || 'Home', full_name, phone, line1, line2 || null, city, province, zip, is_default ? 1 : 0]
    );

    res.status(201).json({ success: true, message: 'Address added', id: result.insertId });
  } catch (err) {
    console.error('addAddress:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { register, login, getMe, updateMe, changePassword, addAddress };
