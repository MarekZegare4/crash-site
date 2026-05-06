import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load .env before any other module reads process.env
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "../../.env") });

// Dynamic import ensures app.ts (and all its transitive imports) loads
// after dotenv has populated process.env
const { app } = await import("./app.js");

const isProd = process.env.NODE_ENV === "production";

const insecureSecrets = new Set(["change-this-in-production", "dev-only-secret-change-in-production"]);
if (isProd && (!process.env.AUTH_JWT_SECRET || insecureSecrets.has(process.env.AUTH_JWT_SECRET))) {
  console.error("FATAL: AUTH_JWT_SECRET is not set or is the default value. Set a strong secret before running in production.");
  process.exit(1);
}

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}${isProd ? " [production]" : " [development]"}`);
});
