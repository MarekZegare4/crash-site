// Runs before each test file (in its own Vitest worker).
// Set env vars here so db.ts and mockAuth.ts pick them up at module-init time.
process.env.DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
process.env.AUTH_JWT_SECRET = "test-secret-vitest-32-chars-padding";
// "google:admin-test-id" will be treated as admin by roleForSocialUser()
process.env.ADMIN_SOCIAL_IDS = "google:admin-test-id";
