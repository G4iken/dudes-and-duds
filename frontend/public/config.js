// ─── RUNTIME CONFIG ───────────────────────────────────────────────────────────
// This file is auto-generated during deploy.
// Locally: points to localhost:5000
// Production: replaced by deploy script with real Railway URL
window.__DND_CONFIG__ = {
  API_BASE: typeof __RAILWAY_URL__ !== 'undefined'
    ? __RAILWAY_URL__
    : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000/api'
      : '/api'   // falls through Vercel proxy defined in vercel.json
};
