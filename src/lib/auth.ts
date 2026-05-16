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

export const auth = betterAuth({
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
