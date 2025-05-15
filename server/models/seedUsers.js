const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./User');

const uri = 'mongodb+srv://giang:eODPvocJOHfqoOEZ@cluster0.o8ucqn3.mongodb.net/BanPick?retryWrites=true&w=majority&appName=Cluster0';

// Kết nối đến MongoDB
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Kết nối MongoDB thành công');

    // Xóa dữ liệu cũ
    await User.deleteMany({});

    // Mã hóa mật khẩu và thêm tài khoản mới
    const salt = await bcrypt.genSalt(10);
    const hashedPassword1 = await bcrypt.hash('admin123', salt);
    const hashedPassword2 = await bcrypt.hash('player123', salt);

    await User.create([
      {
        username: 'player1',
        password: hashedPassword1,
        role: 'player1'
      },
      {
        username: 'player2',
        password: hashedPassword2,
        role: 'player2'
      }
    ]);

    console.log('Tạo tài khoản thành công');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Lỗi kết nối MongoDB:', err);
  });