import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { appRouter } from "./routes.js";
import { verifyToken } from "./mockAuth.js";
import { dbGetListingOwnerByImage } from "./db.js";

const isProd = process.env.NODE_ENV === "production";

export const app = express();

// Backend sits behind the frontend nginx container (and Cloudflare in production)
app.set("trust proxy", 1);

const repoRoot = process.cwd().endsWith(`${path.sep}backend`) ? path.resolve(process.cwd(), "..") : process.cwd();
const uploadsDir = path.join(repoRoot, "uploads");

app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "64kb" }));

const isTest = process.env.NODE_ENV === "test";

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many requests, please slow down" },
});
app.use("/api", globalLimiter);

const uploadsLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

app.get("/uploads/:filename", uploadsLimiter, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  const listing = dbGetListingOwnerByImage(filename);

  if (listing && !listing.isPublic) {
    const pt = typeof req.query.pt === "string" ? req.query.pt : undefined;
    const tokenMatch = pt !== undefined && listing.privateToken !== null &&
      (() => {
        const a = Buffer.from(pt);
        const b = Buffer.from(listing.privateToken!);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      })();
    if (tokenMatch) {
      // valid private-link access
    } else {
      const auth = req.headers.authorization;
      const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
      const user = bearerToken ? verifyToken(bearerToken) : undefined;
      if (!user || (user.id !== listing.ownerId && user.role !== "admin")) {
        res.status(403).end();
        return;
      }
    }
  }

  res.sendFile(filePath);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", appRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack ?? err.message);
  res.status(500).json({ error: isProd ? "Internal server error" : err.message });
});
