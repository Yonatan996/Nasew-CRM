import mongoose from 'mongoose';

export const connectMongo = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set. Add your MongoDB connection string to Backend/.env.');
  }

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB || undefined,
  });

  console.log('MongoDB connected');
};
