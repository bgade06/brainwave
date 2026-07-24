import mongoose from "mongoose";

export async function connectDatabase(uri) {
  await mongoose.connect(uri);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}
