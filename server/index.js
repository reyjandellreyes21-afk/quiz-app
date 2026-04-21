import "dotenv/config";
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
  process.exit(1);
});
