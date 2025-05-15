const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  banCount: { type: Number, default: 0 },
  pickCount: { type: Number, default: 0 },
  selectedWeapons: [{ type: String }],
  bans: [{ weaponId: String, team: String }],
  picks: [{ weaponId: String, team: String }],
  firstTurn: { type: String, default: null },
  currentTurn: { type: String, default: null },
  actionType: { type: String, default: null },
  isCompleted: { type: Boolean, default: false },
  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['player1', 'player2'] },
    status: { type: String, enum: ['pending', 'approved'], default: 'approved' } // For player2 approval
  }],
});

module.exports = mongoose.model('Room', RoomSchema);