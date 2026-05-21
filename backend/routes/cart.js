const router = require('express').Router();
const ctrl   = require('../controllers/cartController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate); // All cart routes require auth

router.get('/',             ctrl.getCart);
router.post('/',            ctrl.addToCart);
router.patch('/:cartItemId', ctrl.updateCartItem);
router.delete('/:cartItemId', ctrl.removeCartItem);
router.delete('/',          ctrl.clearCart);

module.exports = router;
