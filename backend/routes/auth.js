const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Register
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must have uppercase, lowercase, and a number'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
], validate, ctrl.register);

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, ctrl.login);

// Protected
router.get('/me',              authenticate, ctrl.getMe);
router.patch('/me',            authenticate, ctrl.updateMe);
router.post('/change-password',authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
], validate, ctrl.changePassword);
router.post('/address',        authenticate, ctrl.addAddress);

module.exports = router;
