const mongoose = require('mongoose');
const Room = require('./models/Room');

const initRooms = async () => {
  try {
    await Room.deleteMany({}); // Xóa phòng cũ (tùy chọn)
    const rooms = Array.from({ length: 100 }, (_, i) => ({
      code: `ROOM${String(i + 1).padStart(3, '0')}`, // ROOM001, ROOM002, ..., ROOM100
      banCount: 0,
      pickCount: 0,
      selectedWeapons: [],
      bans: [],
      picks: [],
      players: [],
    }));
    await Room.insertMany(rooms);
    console.log('Initialized 100 rooms');
  } catch (error) {
    console.error('Error initializing rooms:', error);
  }
};

module.exports = initRooms;