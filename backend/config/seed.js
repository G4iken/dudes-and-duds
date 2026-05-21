require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  console.log('🌱 Seeding database…');

  // ─── CATEGORIES
  await conn.query(`
    INSERT IGNORE INTO categories (slug, name, sort_order) VALUES
    ('shirts',   'Shirts & Tops', 1),
    ('hoodies',  'Hoodies',       2),
    ('pants',    'Pants & Bottoms', 3),
    ('caps',     'Caps & Accessories', 4);
  `);

  // ─── PRODUCTS
  await conn.query(`
    INSERT IGNORE INTO products
      (sku, name, slug, description, category_id, price, compare_price, emoji, badge, badge_text, featured)
    VALUES
    ('DND-001','Clean Slate Oversized Tee','clean-slate-oversized-tee',
     'Our bestselling drop-shoulder tee. 220gsm 100% combed cotton. Boxy fit that flatters every build.',
     1, 699.00, NULL, '👕', 'best', 'Best Seller', 1),

    ('DND-002','Minimal Pullover Hoodie','minimal-pullover-hoodie',
     'Heavyweight fleece pullover. 380gsm fleece-lined interior. Kangaroo pocket, ribbed cuffs and hem.',
     2, 1299.00, 1599.00, '🧥', 'new', 'New Arrival', 1),

    ('DND-003','Utility Cargo Pants','utility-cargo-pants',
     '8-pocket cargo pants in durable ripstop fabric. Straight-leg cut with zip fly and adjustable hem.',
     3, 1599.00, NULL, '👖', 'new', 'New Arrival', 1),

    ('DND-004','D&D Signature 6-Panel Cap','dd-signature-cap',
     'Unstructured 6-panel cap with tonal embroidery. Adjustable strapback. One size fits most.',
     4, 549.00, NULL, '🧢', '', NULL, 1),

    ('DND-005','Graphic Drop Tee Vol. 3','graphic-drop-tee-vol-3',
     'Limited-edition graphic tee. 200gsm ring-spun cotton. Screen printed original artwork.',
     1, 899.00, NULL, '🎨', 'sold', 'Sold Out', 0),

    ('DND-006','Quarter-Zip Fleece','quarter-zip-fleece',
     'Quarter-zip polar fleece in a slim athletic fit. Anti-pilling fabric. Side seam pockets.',
     2, 1099.00, 1399.00, '🧤', 'new', 'New Arrival', 1),

    ('DND-007','Linen Lounge Shorts','linen-lounge-shorts',
     'Breathable linen shorts for hot days. Elastic waistband with drawstring. Side and back pockets.',
     3, 849.00, NULL, '🩲', 'best', 'Best Seller', 1),

    ('DND-008','The Weekend Overshirt','weekend-overshirt',
     'Garment-dyed overshirt in midweight twill. Chest pockets. Can be worn open as a layer.',
     1, 1249.00, NULL, '👔', 'new', 'New Arrival', 1);
  `);

  // ─── VARIANTS for product 1 (Oversized Tee)
  await conn.query(`
    INSERT IGNORE INTO product_variants (product_id, size, color, color_hex, sku_suffix, stock)
    SELECT p.id, v.size, v.color, v.hex, v.suffix, v.stock FROM products p
    JOIN (SELECT 'DND-001' AS sku UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001'
          UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001'
          UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001'
          UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001' UNION ALL SELECT 'DND-001') skus ON p.sku = skus.sku
    CROSS JOIN (
      SELECT 'S' AS size,'Black' AS color,'#1A1A1A' AS hex,'-BLK-S'   AS suffix, 50 AS stock UNION ALL
      SELECT 'M',        'Black',         '#1A1A1A',          '-BLK-M',           80 UNION ALL
      SELECT 'L',        'Black',         '#1A1A1A',          '-BLK-L',           60 UNION ALL
      SELECT 'S',        'Cream',         '#F0EDE8',          '-CRM-S',           40 UNION ALL
      SELECT 'M',        'Cream',         '#F0EDE8',          '-CRM-M',           55 UNION ALL
      SELECT 'L',        'Cream',         '#F0EDE8',          '-CRM-L',           45 UNION ALL
      SELECT 'S',        'Navy',          '#4A4A6A',          '-NVY-S',           30 UNION ALL
      SELECT 'M',        'Navy',          '#4A4A6A',          '-NVY-M',           40 UNION ALL
      SELECT 'L',        'Navy',          '#4A4A6A',          '-NVY-L',           35 UNION ALL
      SELECT 'S',        'Forest',        '#3B5E3C',          '-FOR-S',           25 UNION ALL
      SELECT 'M',        'Forest',        '#3B5E3C',          '-FOR-M',           38 UNION ALL
      SELECT 'L',        'Forest',        '#3B5E3C',          '-FOR-L',           28
    ) v;
  `);

  // ─── ADMIN USER
  const hash = await bcrypt.hash('Admin@DnD2025!', 12);
  await conn.query(`
    INSERT IGNORE INTO users (name, email, password_hash, role)
    VALUES ('D&D Admin', 'admin@dudesandduds.ph', '${hash}', 'admin');
  `);

  // ─── DISCOUNT CODES
  await conn.query(`
    INSERT IGNORE INTO discount_codes (code, type, value, min_order, max_uses, expires_at)
    VALUES
    ('DUDE20',   'percent', 20.00, 500.00,  NULL, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
    ('WELCOME10','percent', 10.00, 0,        500, DATE_ADD(NOW(), INTERVAL 6 MONTH)),
    ('FLAT150',  'fixed',  150.00, 1500.00, NULL, DATE_ADD(NOW(), INTERVAL 1 YEAR));
  `);

  await pool.query(`
  INSERT IGNORE INTO reviews (product_id, name, location, rating, body, verified, approved)
  SELECT p.id, r.name, r.loc, r.rating, r.body, 1, 1
  FROM products p
  JOIN (
    SELECT 'DND-001' AS sku, 'Miguel R.' AS name, 'Makati City' AS loc, 5 AS rating,
           'Finally a brand that gets it. Oversized tee fits exactly right. Fabric is thick and premium. Worth every peso.' AS body
    UNION ALL
    SELECT 'DND-002' AS sku, 'Josh D.' AS name, 'Quezon City' AS loc, 5 AS rating,
           'Ordered the hoodie — arrived in 2 days. Packaging fire, quality is great. So comfortable I haven\\'t taken it off.' AS body
    UNION ALL
    SELECT 'DND-004' AS sku, 'Kyle C.' AS name, 'Cebu City' AS loc, 5 AS rating,
           'Cap is my daily driver now. Clean, minimal, goes with everything. Best purchase this year.' AS body
  ) r ON p.sku = r.sku;
`);
  await conn.end();
  console.log('✅ Seed complete. Admin: admin@dudesandduds.ph / Admin@DnD2025!');
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
