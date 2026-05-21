require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  console.log('🔧 Running migrations…');

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
  await conn.query(`USE \`${process.env.DB_NAME}\`;`);

  const schema = `
  -- ─── USERS ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120)        NOT NULL,
    email         VARCHAR(191)        NOT NULL UNIQUE,
    password_hash VARCHAR(255)        NOT NULL,
    role          ENUM('customer','admin') DEFAULT 'customer',
    phone         VARCHAR(30),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  -- ─── ADDRESSES ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS addresses (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT           NOT NULL,
    label       VARCHAR(50)   DEFAULT 'Home',
    full_name   VARCHAR(120)  NOT NULL,
    phone       VARCHAR(30)   NOT NULL,
    line1       VARCHAR(255)  NOT NULL,
    line2       VARCHAR(255),
    city        VARCHAR(100)  NOT NULL,
    province    VARCHAR(100)  NOT NULL,
    zip         VARCHAR(20)   NOT NULL,
    country     VARCHAR(60)   DEFAULT 'Philippines',
    is_default  TINYINT(1)    DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ─── CATEGORIES ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS categories (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(80)   NOT NULL UNIQUE,
    name        VARCHAR(120)  NOT NULL,
    description TEXT,
    sort_order  INT           DEFAULT 0
  );

  -- ─── PRODUCTS ────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS products (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    sku           VARCHAR(60)   NOT NULL UNIQUE,
    name          VARCHAR(200)  NOT NULL,
    slug          VARCHAR(200)  NOT NULL UNIQUE,
    description   TEXT,
    category_id   INT,
    price         DECIMAL(10,2) NOT NULL,
    compare_price DECIMAL(10,2),
    cost_price    DECIMAL(10,2),
    emoji         VARCHAR(10)   DEFAULT '👕',
    badge         ENUM('new','best','sold','') DEFAULT '',
    badge_text    VARCHAR(50),
    featured      TINYINT(1)    DEFAULT 0,
    is_active     TINYINT(1)    DEFAULT 1,
    weight_g      INT           DEFAULT 300,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  -- ─── PRODUCT VARIANTS ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS product_variants (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT           NOT NULL,
    size       VARCHAR(20)   NOT NULL,
    color      VARCHAR(50),
    color_hex  VARCHAR(10),
    sku_suffix VARCHAR(30),
    stock      INT           DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  -- ─── PRODUCT IMAGES ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS product_images (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT          NOT NULL,
    url        VARCHAR(500) NOT NULL,
    alt_text   VARCHAR(200),
    sort_order INT          DEFAULT 0,
    is_primary TINYINT(1)   DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  -- ─── CART (server-side, linked to user) ──────────────────────
  CREATE TABLE IF NOT EXISTS cart_items (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    variant_id INT NOT NULL,
    quantity   INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cart (user_id, variant_id),
    FOREIGN KEY (user_id)    REFERENCES users(id)            ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
  );

  -- ─── ORDERS ──────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS orders (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_number    VARCHAR(20)     NOT NULL UNIQUE,
    user_id         INT,
    guest_email     VARCHAR(191),
    status          ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')
                    DEFAULT 'pending',
    payment_status  ENUM('unpaid','paid','partially_refunded','refunded') DEFAULT 'unpaid',
    payment_method  VARCHAR(60),
    payment_ref     VARCHAR(120),
    subtotal        DECIMAL(10,2)   NOT NULL,
    shipping_fee    DECIMAL(10,2)   DEFAULT 0.00,
    discount        DECIMAL(10,2)   DEFAULT 0.00,
    total           DECIMAL(10,2)   NOT NULL,
    shipping_name   VARCHAR(120),
    shipping_phone  VARCHAR(30),
    shipping_line1  VARCHAR(255),
    shipping_line2  VARCHAR(255),
    shipping_city   VARCHAR(100),
    shipping_province VARCHAR(100),
    shipping_zip    VARCHAR(20),
    notes           TEXT,
    shipped_at      TIMESTAMP NULL,
    delivered_at    TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- ─── ORDER ITEMS ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS order_items (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    order_id     INT           NOT NULL,
    product_id   INT,
    variant_id   INT,
    product_name VARCHAR(200)  NOT NULL,
    variant_info VARCHAR(100),
    sku          VARCHAR(80),
    price        DECIMAL(10,2) NOT NULL,
    quantity     INT           NOT NULL,
    subtotal     DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id)   REFERENCES orders(id)           ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)         ON DELETE SET NULL,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
  );

  -- ─── REVIEWS ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS reviews (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT          NOT NULL,
    user_id    INT,
    name       VARCHAR(120) NOT NULL,
    location   VARCHAR(100),
    rating     TINYINT      NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title      VARCHAR(200),
    body       TEXT         NOT NULL,
    verified   TINYINT(1)   DEFAULT 0,
    approved   TINYINT(1)   DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
  );

  -- ─── NEWSLETTER ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    email      VARCHAR(191) NOT NULL UNIQUE,
    name       VARCHAR(120),
    subscribed TINYINT(1)   DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- ─── DISCOUNT CODES ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS discount_codes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(50)  NOT NULL UNIQUE,
    type            ENUM('percent','fixed') DEFAULT 'percent',
    value           DECIMAL(10,2) NOT NULL,
    min_order       DECIMAL(10,2) DEFAULT 0,
    max_uses        INT          DEFAULT NULL,
    used_count      INT          DEFAULT 0,
    expires_at      TIMESTAMP    NULL,
    is_active       TINYINT(1)   DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `;

  await conn.query(schema);
  await conn.end();
  console.log('✅ All tables created successfully.');
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
