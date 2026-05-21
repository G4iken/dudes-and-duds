const router = require('express').Router();
const ctrl   = require('../controllers/newsletterController');

router.post('/subscribe',   ctrl.subscribe);
router.post('/unsubscribe', ctrl.unsubscribe);

// Discount validation (used on checkout page)
router.post('/discount/validate', ctrl.validateDiscount);

module.exports = router;
