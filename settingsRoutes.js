const express = require('express');
const cartController = require('../controllers/cartController');
const { requireAuth } = require('../middleware/auth');
const { addItemRules, updateQuantityRules } = require('../middleware/validators/cartValidators');

const router = express.Router();

router.use(requireAuth);

router.get('/', cartController.getCart);
router.post('/items', addItemRules, cartController.addItem);
router.patch('/items/:itemId', updateQuantityRules, cartController.updateItemQuantity);
router.delete('/items/:itemId', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
