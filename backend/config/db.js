const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected...');
    return true;
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
    return false;
    //process.exit(1);
  }
};

module.exports = connectDB;