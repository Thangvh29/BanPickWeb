const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

// Middleware
router.use(sessionController.authenticateToken);

// Routes
router.get('/', sessionController.getSession);
router.post('/update', sessionController.update);
router.post('/select', sessionController.selectWeapon);
router.post('/ready', sessionController.setReady);
router.post('/lockin', sessionController.lockIn);
router.post('/ban', sessionController.banWeapon);
router.post('/pick', sessionController.pickWeapon);
router.post('/coinflip', sessionController.coinFlip);
router.post('/reset', sessionController.resetSession);
router.post('/logout', sessionController.logout);
router.get('/verify', sessionController.verifyToken);
router.post('/login', sessionController.login);

module.exports = router;