const mongoose = require('mongoose');
const config = require('../config');

async function connectDb() {
  if (!config.mongoUri) {
    throw new Error('MONGODB_URI não definida. O Ômot precisa do Mongo para gatilhos, perfis e calls.');
  }

  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('✅ MongoDB conectado');
}

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isDbReady };
