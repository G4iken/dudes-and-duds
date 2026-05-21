const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/productController');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Public
router.get('/categories',      ctrl.getCategories);
router.get('/',                ctrl.getProducts);
router.get('/:slug',           ctrl.getProduct);

// Reviews (optional auth for verified badge)
router.post('/:id/reviews', optionalAuth, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating 1–5 required'),
  body('body').isLength({ min: 10, max: 2000 }).withMessage('Review body required (10–2000 chars)'),
  body('name').optional().isLength({ min: 2, max: 120 }),
], validate, ctrl.addReview);

// Admin
router.post('/',               authenticate, requireAdmin, ctrl.createProduct);
router.patch('/:id',           authenticate, requireAdmin, ctrl.updateProduct);
router.delete('/:id',          authenticate, requireAdmin, ctrl.deleteProduct);
router.patch('/variants/:id/stock', authenticate, requireAdmin, ctrl.updateStock);

module.exports = router;
