import mongoose from "mongoose";
import { config } from "./config.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const connectDatabase = async () => {
  if (config.skipDatabaseConnect) {
    mongoose.set("bufferCommands", false);
    // eslint-disable-next-line no-console
    console.warn(
      "[SKIP_DATABASE] MongoDB connect skipped. /health will work; set SKIP_DATABASE=false and fix Atlas IP when you need the full API.",
    );
    return;
  }

  const opts = {
    serverSelectionTimeoutMS: 20_000,
    // Prefer IPv4 — avoids some Windows/IPv6 DNS paths that break TLS to Atlas.
    family: 4,
  };

  const maxAttempts = 5;
  const backoffMs = 4000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(config.mongoUri, opts);
      return;
    } catch (err) {
      const retryable =
        typeof err?.errorLabelSet?.has === "function" &&
        err.errorLabelSet.has("RetryableError");
      const last = attempt === maxAttempts;
      if (!retryable || last) throw err;
      // eslint-disable-next-line no-console
      console.warn(
        `[MongoDB] Connection failed (${attempt}/${maxAttempts}), Atlas sometimes returns retryable TLS/overload errors. Retrying in ${backoffMs / 1000}s…`,
      );
      await sleep(backoffMs);
    }
  }
};
