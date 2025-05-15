const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  players: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String, enum: ['player1', 'player2'], required: true },
    },
  ],
  selectedWeapons: [{ type: String }],
  bans: [
    {
      weaponId: { type: String, required: true },
      team: { type: String, enum: ['team1', 'team2'], required: true },
    },
  ],
  picks: [
    {
      weaponId: { type: String, required: true },
      team: { type: String, enum: ['team1', 'team2'], required: true },
    },
  ],
  banCount: { type: Number, default: 0 },
  pickCount: { type: Number, default: 0 },
  firstTurn: { type: String, enum: ['team1', 'team2', null], default: null },
  currentTurn: { type: String, enum: ['team1', 'team2', null], default: null },
  actionType: { type: String, enum: ['ban', 'pick', null], default: null },
  isCompleted: { type: Boolean, default: false },
  timerId: { type: String, default: null },
  readyStatus: {
    player1Ready: { type: Boolean, default: false },
    player2Ready: { type: Boolean, default: false },
  },
});

module.exports = mongoose.model('Session', sessionSchema);