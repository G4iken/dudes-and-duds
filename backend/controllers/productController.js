const pool = require('../config/db');

// GET /api/products
const getProducts = async (req, res) => {
  try {
    const { category, badge, featured, search, sort = 'featured', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['p.is_active = 1'];
    let params = [];

    if (category) {
      where.push('c.slug = ?');
      params.push(category);
    }
    if (badge) {
      where.push('p.badge = ?');
      params.push(badge);
    }
    if (featured === 'true') {
      where.push('p.featured = 1');
    }
    if (search) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const sortMap = {
      featured:   'p.featured DESC, p.created_at DESC',
      newest:     'p.created_at DESC',
      price_asc:  'p.price ASC',
      price_desc: 'p.price DESC',
      name:       'p.name ASC',
    };
    const orderBy = sortMap[sort] || sortMap.featured;

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [products] = await pool.query(
      `SELECT p.id, p.sku, p.name, p.slug, p.description, p.price, p.compare_price,
              p.emoji, p.badge, p.badge_text, p.featured,
              c.name AS category_name, c.slug AS category_slug,
              COALESCE(AVG(r.rating), 0) AS avg_rating,
              COUNT(DISTINCT r.id) AS review_count,
              SUM(pv.stock) AS total_stock
       FROM products p
       LEFT JOIN categories c    ON c.id = p.category_id
       LEFT JOIN reviews r       ON r.product_id = p.id AND r.approved = 1
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       ${whereStr}
       GROUP BY p.id
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Count for pagination
    const [countRow] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${whereStr}`,
      params
    );

    res.json({
      success: true,
      data: products,
      pagination: {
        total: countRow[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRow[0].total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('getProducts:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/products/:slug
const getProduct = async (req, res) => {
  try {
    const { slug } = req.params;

    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
              COALESCE(AVG(r.rating), 0) AS avg_rating,
              COUNT(DISTINCT r.id) AS review_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN reviews r    ON r.product_id = p.id AND r.approved = 1
       WHERE (p.slug = ? OR p.id = ?) AND p.is_active = 1
       GROUP BY p.id`,
      [slug, isNaN(slug) ? 0 : parseInt(slug)]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Product not found' });

    const product = rows[0];

    // Variants
    const [variants] = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color',
      [product.id]
    );

    // Reviews (approved)
    const [reviews] = await pool.query(
      `SELECT r.*, u.name AS user_name
       FROM reviews r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? AND r.approved = 1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [product.id]
    );

    res.json({ success: true, data: { ...product, variants, reviews } });
  } catch (err) {
    console.error('getProduct:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/products/categories
const getCategories = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       GROUP BY c.id ORDER BY c.sort_order`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/products/:id/reviews
const addReview = async (req, res) => {
  try {
    const { rating, title, body, name, location } = req.body;
    const productId = parseInt(req.params.id);

    const [product] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
    if (!product.length)
      return res.status(404).json({ success: false, message: 'Product not found' });

    // Verified if user has ordered this product
    let verified = 0;
    if (req.user) {
      const [ordered] = await pool.query(
        `SELECT oi.id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.user_id = ? AND oi.product_id = ? AND o.status NOT IN ('cancelled','refunded')`,
        [req.user.id, productId]
      );
      verified = ordered.length > 0 ? 1 : 0;
    }

    await pool.query(
      `INSERT INTO reviews (product_id, user_id, name, location, rating, title, body, verified, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [productId, req.user?.id || null, name || req.user?.name, location || null, rating, title || null, body, verified]
    );

    res.status(201).json({ success: true, message: 'Review submitted and awaiting approval' });
  } catch (err) {
    console.error('addReview:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

// POST /api/admin/products
const createProduct = async (req, res) => {
  try {
    const { sku, name, slug, description, category_id, price, compare_price,
            cost_price, emoji, badge, badge_text, featured, variants } = req.body;

    const [result] = await pool.query(
      `INSERT INTO products (sku, name, slug, description, category_id, price, compare_price,
       cost_price, emoji, badge, badge_text, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku, name, slug, description, category_id || null, price, compare_price || null,
       cost_price || null, emoji || '👕', badge || '', badge_text || null, featured ? 1 : 0]
    );

    const productId = result.insertId;

    if (variants && variants.length) {
      for (const v of variants) {
        await pool.query(
          'INSERT INTO product_variants (product_id, size, color, color_hex, sku_suffix, stock) VALUES (?,?,?,?,?,?)',
          [productId, v.size, v.color || null, v.color_hex || null, v.sku_suffix || null, v.stock || 0]
        );
      }
    }

    res.status(201).json({ success: true, message: 'Product created', id: productId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ success: false, message: 'SKU or slug already exists' });
    console.error('createProduct:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/admin/products/:id
const updateProduct = async (req, res) => {
  try {
    const fields = ['name','slug','description','category_id','price','compare_price',
                    'cost_price','emoji','badge','badge_text','featured','is_active'];
    const updates = [];
    const values  = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    }
    if (!updates.length)
      return res.status(400).json({ success: false, message: 'No fields to update' });

    values.push(req.params.id);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    console.error('updateProduct:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/admin/products/:id
const deleteProduct = async (req, res) => {
  try {
    // Soft delete
    await pool.query('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/admin/variants/:id/stock
const updateStock = async (req, res) => {
  try {
    const { stock } = req.body;
    await pool.query('UPDATE product_variants SET stock = ? WHERE id = ?', [stock, req.params.id]);
    res.json({ success: true, message: 'Stock updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getProducts, getProduct, getCategories, addReview,
  createProduct, updateProduct, deleteProduct, updateStock,
};
