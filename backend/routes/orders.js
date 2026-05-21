const router = require('express').Router();
const ctrl   = require('../controllers/orderController');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');

// Place order (optional auth — guests allowed)
router.post('/', optionalAuth, ctrl.placeOrder);

// User order history
router.get('/', authenticate, ctrl.getMyOrders);

// Single order (optional auth — guest can view via order number)
router.get('/:orderNumber', optionalAuth, ctrl.getOrder);

// Cancel (must own order)
router.post('/:orderNumber/cancel', authenticate, ctrl.cancelOrder);

// Admin
router.get('/admin/all',              authenticate, requireAdmin, ctrl.adminGetOrders);
router.patch('/admin/:id/status',     authenticate, requireAdmin, ctrl.adminUpdateStatus);

module.exports = router;
