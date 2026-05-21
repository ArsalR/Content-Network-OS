/**
 * Constants shared between the publisher (server-side Inngest function) and
 * the client-side editor UI. Kept in their own file so the client bundle
 * doesn't have to import publish-draft.ts (which pulls in drizzle / db).
 */

/** Maximum publish retries per attempt before the publisher gives up. */
export const MAX_PUBLISH_ATTEMPTS = 5;
