require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const app = express();

// ─── TRUST PROXY (Railway / Render) ──────────────────────────────────────────
app.set('trust proxy', 1);

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ─── BODY PARSERS ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      300,
  message:  { success: false, message: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'Too many auth attempts, try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders:   false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'Dudes & Duds API',
    version: '1.0.0',
    status:  'running',
    time:    new Date().toISOString(),
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/cart',      require('./routes/cart'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/newsletter', require('./routes/newsletter'));
// Discount validate is on the newsletter router for now
app.use('/api',           require('./routes/newsletter'));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err.message?.startsWith('CORS blocked'))
    return res.status(403).json({ success: false, message: err.message });
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Dudes & Duds API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
