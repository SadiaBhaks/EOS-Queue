import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "";

interface GlobalMongo {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var __mongo: GlobalMongo | undefined;
}

const cached: GlobalMongo = global.__mongo ?? { conn: null, promise: null };
global.__mongo = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands:              false,
        maxPoolSize:                 5,
        serverSelectionTimeoutMS:    5000,  // fail fast — don't hang for 30s
        socketTimeoutMS:             10000,
        connectTimeoutMS:            5000,
        heartbeatFrequencyMS:        30000,
      })
      .then((m) => { console.log("[DB] MongoDB connected ✓"); return m; })
      .catch((err) => { cached.promise = null; throw err; });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;