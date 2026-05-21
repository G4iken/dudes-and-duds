const pool = require('../config/db');

const CART_QUERY = `
  SELECT
    ci.id        AS cart_item_id,
    ci.quantity,
    pv.id        AS variant_id,
    pv.size,
    pv.color,
    pv.color_hex,
    pv.stock,
    p.id         AS product_id,
    p.name,
    p.slug,
    p.emoji,
    p.price,
    p.compare_price,
    p.badge,
    (p.price * ci.quantity) AS line_total
  FROM cart_items ci
  JOIN product_variants pv ON pv.id = ci.variant_id
  JOIN products p           ON p.id  = pv.product_id
  WHERE ci.user_id = ? AND p.is_active = 1
  ORDER BY ci.created_at DESC
`;

const formatCart = (rows) => {
  const subtotal   = rows.reduce((s, r) => s + parseFloat(r.line_total), 0);
  const itemCount  = rows.reduce((s, r) => s + r.quantity, 0);
  const shippingFee = subtotal >= 1500 ? 0 : 150;
  return {
    items: rows,
    item_count:   itemCount,
    subtotal:     subtotal.toFixed(2),
    shipping_fee: shippingFee.toFixed(2),
    total:        (subtotal + shippingFee).toFixed(2),
    free_shipping: subtotal >= 1500,
  };
};

// GET /api/cart
const getCart = async (req, res) => {
  try {
    const [rows] = await pool.query(CART_QUERY, [req.user.id]);
    res.json({ success: true, data: formatCart(rows) });
  } catch (err) {
    console.error('getCart:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/cart   { variant_id, quantity }
const addToCart = async (req, res) => {
  try {
    const { variant_id, quantity = 1 } = req.body;
    if (!variant_id)
      return res.status(400).json({ success: false, message: 'variant_id required' });

    // Check stock
    const [variants] = await pool.query(
      'SELECT stock FROM product_variants WHERE id = ?', [variant_id]
    );
    if (!variants.length)
      return res.status(404).json({ success: false, message: 'Variant not found' });
    if (variants[0].stock < 1)
      return res.status(400).json({ success: false, message: 'Out of stock' });

    // Upsert
    await pool.query(
      `INSERT INTO cart_items (user_id, variant_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [req.user.id, variant_id, quantity]
    );

    const [rows] = await pool.query(CART_QUERY, [req.user.id]);
    res.json({ success: true, message: 'Added to cart', data: formatCart(rows) });
  } catch (err) {
    console.error('addToCart:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/cart/:cartItemId   { quantity }
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const cartItemId   = parseInt(req.params.cartItemId);

    if (quantity < 1) {
      await pool.query(
        'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
        [cartItemId, req.user.id]
      );
    } else {
      await pool.query(
        'UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?',
        [quantity, cartItemId, req.user.id]
      );
    }

    const [rows] = await pool.query(CART_QUERY, [req.user.id]);
    res.json({ success: true, data: formatCart(rows) });
  } catch (err) {
    console.error('updateCartItem:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/cart/:cartItemId
const removeCartItem = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
      [req.params.cartItemId, req.user.id]
    );
    const [rows] = await pool.query(CART_QUERY, [req.user.id]);
    res.json({ success: true, message: 'Item removed', data: formatCart(rows) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/cart
const clearCart = async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Cart cleared', data: formatCart([]) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart };
