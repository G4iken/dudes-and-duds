const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

// Verify JWT, attach user to req
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'No token provided' });

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!rows.length)
      return res.status(401).json({ success: false, message: 'User not found' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Token expired' });
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Must be admin
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin access required' });
  next();
};

// Optional auth — attaches user if token present, continues either way
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [rows] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = ?',
        [decoded.id]
      );
      if (rows.length) req.user = rows[0];
    }
  } catch (_) { /* ignore */ }
  next();
};

module.exports = { authenticate, requireAdmin, optionalAuth };
