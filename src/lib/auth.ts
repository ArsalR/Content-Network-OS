import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "@/lib/db";
import {
  users,
  sessions,
  accounts,
  verifications,
} from "@/db/schema";

const productionURL = process.env.BETTER_AUTH_URL;

export const auth = betterAuth({
  baseURL: productionURL,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    ...(productionURL ? [productionURL] : []),
    "https://*.vercel.app",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const existing = await db.select().from(users).limit(1);
        if (existing.length > 0) {
          throw new APIError("FORBIDDEN", {
            message: "Registration is closed. Only one account is allowed.",
          });
        }
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
