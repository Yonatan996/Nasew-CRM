import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config(); // load .env

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

async function connectMongo() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 10000, // 10s timeout
    });
    console.log("✅ Connected successfully to MongoDB Atlas!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Connection failed:");
    console.error(err.message);
    process.exit(1);
  }
}

connectMongo();
