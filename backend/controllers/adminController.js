const pool = require('../config/db');

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
  try {
    const [[revenue]]   = await pool.query(
      `SELECT COALESCE(SUM(total),0) AS total_revenue,
              COUNT(*) AS total_orders
       FROM orders WHERE status NOT IN ('cancelled','refunded') AND payment_status = 'paid'`
    );
    const [[pending]]   = await pool.query(
      `SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'`
    );
    const [[customers]] = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE role = 'customer'`
    );
    const [[products]]  = await pool.query(
      `SELECT COUNT(*) AS count FROM products WHERE is_active = 1`
    );
    const [[lowStock]]  = await pool.query(
      `SELECT COUNT(*) AS count FROM product_variants WHERE stock < 5`
    );

    // Revenue last 7 days
    const [revenueChart] = await pool.query(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders
       FROM orders
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         AND status NOT IN ('cancelled','refunded')
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    );

    // Top products by order count
    const [topProducts] = await pool.query(
      `SELECT p.name, p.emoji, SUM(oi.quantity) AS units_sold,
              SUM(oi.subtotal) AS revenue
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       GROUP BY p.id ORDER BY units_sold DESC LIMIT 5`
    );

    // Recent orders
    const [recentOrders] = await pool.query(
      `SELECT o.order_number, o.status, o.total, o.created_at,
              COALESCE(u.name, o.shipping_name) AS customer
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 8`
    );

    res.json({
      success: true,
      data: {
        stats: {
          total_revenue: parseFloat(revenue.total_revenue).toFixed(2),
          total_orders:  revenue.total_orders,
          pending_orders: pending.count,
          total_customers: customers.count,
          active_products: products.count,
          low_stock_variants: lowStock.count,
        },
        revenue_chart:  revenueChart,
        top_products:   topProducts,
        recent_orders:  recentOrders,
      },
    });
  } catch (err) {
    console.error('getDashboard:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/users
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 25, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = [], params = [];

    if (search) {
      where.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const whereStr = where.length ? 'WHERE '+where.join(' AND ') : '';

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
              COUNT(DISTINCT o.id) AS order_count,
              COALESCE(SUM(o.total),0) AS lifetime_value
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id AND o.status NOT IN ('cancelled','refunded')
       ${whereStr}
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${whereStr}`, params
    );

    res.json({ success: true, data: users, total });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/reviews
const getReviews = async (req, res) => {
  try {
    const { approved } = req.query;
    let where = [], params = [];
    if (approved !== undefined) { where.push('r.approved = ?'); params.push(parseInt(approved)); }
    const whereStr = where.length ? 'WHERE '+where.join(' AND ') : '';

    const [reviews] = await pool.query(
      `SELECT r.*, p.name AS product_name
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       ${whereStr}
       ORDER BY r.created_at DESC LIMIT 50`,
      params
    );
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/admin/reviews/:id
const moderateReview = async (req, res) => {
  try {
    const { approved } = req.body;
    await pool.query('UPDATE reviews SET approved = ? WHERE id = ?', [approved ? 1 : 0, req.params.id]);
    res.json({ success: true, message: `Review ${approved ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/newsletter
const getSubscribers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/admin/discount-codes
const getDiscountCodes = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM discount_codes ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/admin/discount-codes
const createDiscountCode = async (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, expires_at } = req.body;
    await pool.query(
      'INSERT INTO discount_codes (code, type, value, min_order, max_uses, expires_at) VALUES (?,?,?,?,?,?)',
      [code.toUpperCase(), type, value, min_order || 0, max_uses || null, expires_at || null]
    );
    res.status(201).json({ success: true, message: 'Discount code created' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ success: false, message: 'Code already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getDashboard, getUsers, getReviews, moderateReview,
  getSubscribers, getDiscountCodes, createDiscountCode,
};
