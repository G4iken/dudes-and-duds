const pool = require('../config/db');

// POST /api/newsletter/subscribe
const subscribe = async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    await pool.query(
      `INSERT INTO newsletter_subscribers (email, name) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE subscribed = 1, name = COALESCE(VALUES(name), name)`,
      [email.toLowerCase().trim(), name || null]
    );

    res.json({ success: true, message: "You're subscribed! Welcome to the Dudes Club 🤙" });
  } catch (err) {
    console.error('subscribe:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/newsletter/unsubscribe
const unsubscribe = async (req, res) => {
  try {
    const { email } = req.body;
    await pool.query(
      'UPDATE newsletter_subscribers SET subscribed = 0 WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/discount/validate
const validateDiscount = async (req, res) => {
  try {
    const { code, cart_total } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code required' });

    const [rows] = await pool.query(
      `SELECT * FROM discount_codes
       WHERE code = ? AND is_active = 1
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [code.toUpperCase()]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Invalid or expired discount code' });

    const dc = rows[0];
    if (parseFloat(cart_total) < parseFloat(dc.min_order))
      return res.status(400).json({
        success: false,
        message: `Minimum order of ₱${parseFloat(dc.min_order).toLocaleString()} required`,
      });

    const discount = dc.type === 'percent'
      ? (parseFloat(cart_total) * dc.value / 100).toFixed(2)
      : dc.value.toFixed(2);

    res.json({
      success: true,
      data: {
        code:     dc.code,
        type:     dc.type,
        value:    dc.value,
        discount: parseFloat(discount),
        message:  dc.type === 'percent' ? `${dc.value}% off applied!` : `₱${dc.value} off applied!`,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { subscribe, unsubscribe, validateDiscount };
