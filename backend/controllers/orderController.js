const pool = require('../config/db');

const generateOrderNumber = () => {
  const date = new Date();
  const ymd  = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.random().toString(36).substring(2,7).toUpperCase();
  return `DND-${ymd}-${rand}`;
};

// POST /api/orders
const placeOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items,           // [{ variant_id, quantity }] — for guest/merge
      use_cart = true, // if true, pull from server cart
      shipping,        // { full_name, phone, line1, line2, city, province, zip }
      payment_method,  // 'gcash' | 'maya' | 'credit_card' | 'cod'
      discount_code,
      notes,
    } = req.body;

    // ── Resolve cart items ──────────────────────────────────
    let cartItems = [];
    if (use_cart && req.user) {
      const [rows] = await conn.query(
        `SELECT ci.quantity, pv.id AS variant_id, pv.stock,
                p.id AS product_id, p.name, p.price, p.sku,
                pv.size, pv.color
         FROM cart_items ci
         JOIN product_variants pv ON pv.id = ci.variant_id
         JOIN products p           ON p.id  = pv.product_id
         WHERE ci.user_id = ? AND p.is_active = 1`,
        [req.user.id]
      );
      cartItems = rows;
    } else if (items && items.length) {
      for (const item of items) {
        const [rows] = await conn.query(
          `SELECT pv.id AS variant_id, pv.stock,
                  p.id AS product_id, p.name, p.price, p.sku,
                  pv.size, pv.color
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           WHERE pv.id = ? AND p.is_active = 1`,
          [item.variant_id]
        );
        if (rows.length) cartItems.push({ ...rows[0], quantity: item.quantity || 1 });
      }
    }

    if (!cartItems.length)
      return res.status(400).json({ success: false, message: 'No items in cart' });

    // ── Stock check ─────────────────────────────────────────
    for (const item of cartItems) {
      if (item.stock < item.quantity) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `${item.name} (${item.size}${item.color ? ' / '+item.color : ''}) has insufficient stock`,
        });
      }
    }

    // ── Discount code ───────────────────────────────────────
    let discountAmount = 0;
    if (discount_code) {
      const [codes] = await conn.query(
        `SELECT * FROM discount_codes
         WHERE code = ? AND is_active = 1
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR used_count < max_uses)`,
        [discount_code.toUpperCase()]
      );
      if (codes.length) {
        const code    = codes[0];
        const subtotal = cartItems.reduce((s, i) => s + (i.price * i.quantity), 0);
        if (subtotal >= parseFloat(code.min_order)) {
          discountAmount = code.type === 'percent'
            ? (subtotal * code.value) / 100
            : parseFloat(code.value);
          await conn.query(
            'UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?',
            [code.id]
          );
        }
      }
    }

    // ── Calculate totals ────────────────────────────────────
    const subtotal    = cartItems.reduce((s, i) => s + (parseFloat(i.price) * i.quantity), 0);
    const shippingFee = subtotal >= 1500 ? 0 : 150;
    const total       = subtotal + shippingFee - discountAmount;

    // ── Create order ────────────────────────────────────────
    const orderNumber = generateOrderNumber();
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (order_number, user_id, guest_email, payment_method, subtotal, shipping_fee, discount, total,
          shipping_name, shipping_phone, shipping_line1, shipping_line2,
          shipping_city, shipping_province, shipping_zip, notes, status, payment_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
               ?,?)`,
      [
        orderNumber,
        req.user?.id || null,
        req.user ? null : req.body.guest_email,
        payment_method || 'cod',
        subtotal.toFixed(2),
        shippingFee.toFixed(2),
        discountAmount.toFixed(2),
        total.toFixed(2),
        shipping.full_name,
        shipping.phone,
        shipping.line1,
        shipping.line2 || null,
        shipping.city,
        shipping.province,
        shipping.zip,
        notes || null,
        payment_method === 'cod' ? 'confirmed' : 'pending',
        payment_method === 'cod' ? 'unpaid'    : 'unpaid',
      ]
    );

    const orderId = orderResult.insertId;

    // ── Order items + deduct stock ──────────────────────────
    for (const item of cartItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_info, sku, price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.variant_id,
          item.name,
          `${item.size}${item.color ? ' / '+item.color : ''}`,
          item.sku,
          item.price,
          item.quantity,
          (parseFloat(item.price) * item.quantity).toFixed(2),
        ]
      );
      await conn.query(
        'UPDATE product_variants SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.variant_id]
      );
    }

    // ── Clear cart ──────────────────────────────────────────
    if (req.user) {
      await conn.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    }

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { order_number: orderNumber, order_id: orderId, total: total.toFixed(2) },
    });
  } catch (err) {
    await conn.rollback();
    console.error('placeOrder:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET /api/orders   (user's own orders)
const getMyOrders = async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
              o.subtotal, o.shipping_fee, o.discount, o.total,
              o.shipping_city, o.shipping_province, o.created_at,
              COUNT(oi.id) AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ?
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/orders/:orderNumber
const getOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM orders WHERE order_number = ?',
      [orderNumber]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];

    // Auth check: must be owner or admin
    if (req.user && req.user.role !== 'admin' && order.user_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.id]
    );

    res.json({ success: true, data: { ...order, items } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/orders/:orderNumber/cancel
const cancelOrder = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM orders WHERE order_number = ?',
      [req.params.orderNumber]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];
    if (order.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Access denied' });

    if (!['pending','confirmed'].includes(order.status))
      return res.status(400).json({ success: false, message: `Cannot cancel a ${order.status} order` });

    await pool.query(
      "UPDATE orders SET status = 'cancelled' WHERE id = ?",
      [order.id]
    );

    // Restock
    const [items] = await pool.query(
      'SELECT variant_id, quantity FROM order_items WHERE order_id = ?',
      [order.id]
    );
    for (const item of items) {
      await pool.query(
        'UPDATE product_variants SET stock = stock + ? WHERE id = ?',
        [item.quantity, item.variant_id]
      );
    }

    res.json({ success: true, message: 'Order cancelled and stock restored' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

// GET /api/admin/orders
const adminGetOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 25, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where  = [];
    let params = [];

    if (status)  { where.push('o.status = ?');   params.push(status); }
    if (search)  {
      where.push('(o.order_number LIKE ? OR u.email LIKE ? OR o.shipping_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereStr = where.length ? 'WHERE '+where.join(' AND ') : '';

    const [orders] = await pool.query(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email,
              COUNT(oi.id) AS item_count
       FROM orders o
       LEFT JOIN users u       ON u.id  = o.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${whereStr}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [countRow] = await pool.query(
      `SELECT COUNT(DISTINCT o.id) AS total FROM orders o LEFT JOIN users u ON u.id = o.user_id ${whereStr}`,
      params
    );

    res.json({ success: true, data: orders, total: countRow[0].total });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/admin/orders/:id/status
const adminUpdateStatus = async (req, res) => {
  try {
    const { status, payment_status } = req.body;
    const updates = [];
    const vals    = [];

    if (status)         { updates.push('status = ?');         vals.push(status); }
    if (payment_status) { updates.push('payment_status = ?'); vals.push(payment_status); }
    if (status === 'shipped')   { updates.push('shipped_at = NOW()');    }
    if (status === 'delivered') { updates.push('delivered_at = NOW()');  }

    vals.push(req.params.id);
    await pool.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, vals);

    res.json({ success: true, message: 'Order status updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  placeOrder, getMyOrders, getOrder, cancelOrder,
  adminGetOrders, adminUpdateStatus,
};
