const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// Public routes (no authentication required)
router.post('/login', sessionController.login);
router.get('/verify', sessionController.verifyToken);

// Protected routes (require authentication)
router.use(sessionController.authenticateToken);
router.get('/', sessionController.getSession);
router.post('/logout', sessionController.logout);
router.post('/update', sessionController.update);
router.post('/select', sessionController.selectWeapon);
router.post('/ready', sessionController.setReady);
router.post('/lockin', sessionController.lockIn);
router.post('/ban', sessionController.banWeapon);
router.post('/pick', sessionController.pickWeapon);
router.post('/coinflip', sessionController.coinFlip);
router.post('/reset', sessionController.resetSession);

module.exports = router;