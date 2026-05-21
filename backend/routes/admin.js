const router = require('express').Router();
const ctrl   = require('../controllers/adminController');
const pCtrl  = require('../controllers/productController');
const oCtrl  = require('../controllers/orderController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin); // All admin routes locked down

// Dashboard
router.get('/dashboard',            ctrl.getDashboard);

// Users
router.get('/users',                ctrl.getUsers);

// Products
router.get('/products',             pCtrl.getProducts);
router.post('/products',            pCtrl.createProduct);
router.patch('/products/:id',       pCtrl.updateProduct);
router.delete('/products/:id',      pCtrl.deleteProduct);
router.patch('/variants/:id/stock', pCtrl.updateStock);

// Orders
router.get('/orders',               oCtrl.adminGetOrders);
router.patch('/orders/:id/status',  oCtrl.adminUpdateStatus);

// Reviews
router.get('/reviews',              ctrl.getReviews);
router.patch('/reviews/:id',        ctrl.moderateReview);

// Newsletter
router.get('/newsletter',           ctrl.getSubscribers);

// Discounts
router.get('/discount-codes',       ctrl.getDiscountCodes);
router.post('/discount-codes',      ctrl.createDiscountCode);

module.exports = router;
