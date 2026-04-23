import "./load-env.js";
import { app } from "./src/app.js";
import { config } from "./src/config/config.js";
import { connectDatabase } from "./src/config/database.js";

const bootstrap = async () => {
  await connectDatabase();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Quiz API running on http://localhost:${config.port}`);
  });
};

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  const msg = String(error?.message || "");
  const causeCode = error?.cause?.code;
  if (
    causeCode === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" ||
    msg.includes("tlsv1 alert internal error") ||
    msg.includes("SSL alert number 80")
  ) {
    // eslint-disable-next-line no-console
    console.error(
      "\nMongoDB TLS handshake failed (common with Atlas on Windows/VPN).\n" +
        "Try in order:\n" +
        "  1. Atlas → Network Access: allow your current IP (or 0.0.0.0/0 for dev).\n" +
        "  2. Atlas → Database user: confirm user/password; URL-encode special chars in MONGO_URI (e.g. @ → %40).\n" +
        "  3. Copy a fresh URI from Atlas → Connect → Drivers (mongodb+srv://…).\n" +
        "  4. Disable VPN/proxy or try another network; corporate firewalls often break TLS to Atlas.\n" +
        "  5. Confirm the cluster is not paused; retry in a few minutes if Atlas was overloaded.\n" +
        "  6. Local dev: run MongoDB locally and set MONGO_URI=mongodb://127.0.0.1:27017/quiz_app\n" +
        "  7. Temporary API-only: SKIP_DATABASE=true in server/.env (quiz/auth need a real DB).\n",
    );
  }
  if (msg.includes("whitelist")) {
    // eslint-disable-next-line no-console
    console.error(
      "\nMongoDB Atlas: open https://cloud.mongodb.com/ → Network Access → Add IP Address (your current IP, or 0.0.0.0/0 for dev only).\nUntil the DB connects, the API never listens and the client shows \"Failed to fetch\".\n",
    );
    // eslint-disable-next-line no-console
    console.error(
      'Temporary dev bypass: add SKIP_DATABASE=true to server/.env, run npm run dev again (only /health works reliably until MongoDB connects).\n',
    );
  }
  process.exit(1);
});
