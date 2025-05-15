const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

router.post('/register', roomController.register);
router.post('/login', roomController.login);
router.get('/verify', roomController.authenticateToken, roomController.verifyToken);
router.get('/rooms', roomController.getRooms);
router.post('/join', roomController.authenticateToken, roomController.joinRoom);
router.post('/approve', roomController.authenticateToken, roomController.approvePlayer);
router.post('/leave', roomController.authenticateToken, roomController.leaveRoom);
router.get('/:code', roomController.authenticateToken, roomController.getRoom);
router.post('/select', roomController.authenticateToken, roomController.selectWeapon);
router.post('/update', roomController.authenticateToken, roomController.update);
router.post('/ban', roomController.authenticateToken, roomController.banWeapon);
router.post('/pick', roomController.authenticateToken, roomController.pickWeapon);
router.post('/coinflip', roomController.authenticateToken, roomController.coinFlip);
router.post('/reset', roomController.authenticateToken, roomController.resetRoom);

module.exports = router;