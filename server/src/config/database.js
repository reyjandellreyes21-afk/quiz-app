import mongoose from "mongoose";
import { config } from "./config.js";

export const connectDatabase = async () => {
  await mongoose.connect(config.mongoUri);
};
