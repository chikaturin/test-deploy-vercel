import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.test" });

const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/drug_be";

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(TEST_MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
    } catch (error) {
      console.warn("MongoDB connection failed. Some tests may fail.");
      console.warn("Please ensure MongoDB is running or set TEST_MONGODB_URI environment variable.");
      throw error;
    }
  }
}, 30000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    try {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
      await mongoose.connection.close();
    } catch (error) {
      console.warn("Error closing MongoDB connection:", error.message);
    }
  }
}, 30000);

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    } catch (error) {
      console.warn("Error cleaning collections:", error.message);
    }
  }
});

