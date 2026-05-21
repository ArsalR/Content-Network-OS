import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const siteStatusEnum = pgEnum("site_status", [
  "active",
  "paused",
  "error",
]);

export const imageProviderEnum = pgEnum("image_provider_type", ["dalle", "gemini"]);

export const siteKindEnum = pgEnum("site_kind", ["wordpress", "pinterest-cms"]);

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "archived",
]);

export const keywordStatusEnum = pgEnum("keyword_status", [
  "new",
  "briefed",
  "generated",
  "published",
  "skipped",
]);

export const keywordIntentEnum = pgEnum("keyword_intent", [
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);

export const briefStatusEnum = pgEnum("brief_status", [
  "draft",
  "ready",
  "generating",
  "generated",
  "published",
]);

export const draftStatusEnum = pgEnum("draft_status", [
  "generating",
  "draft",
  "review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
]);

export const promptKindEnum = pgEnum("prompt_kind", [
  "outline",
  "draft",
  "image_prompt",
  "social_caption",
]);

export const apiCallKindEnum = pgEnum("api_call_kind", [
  "openai",
  "cms_publish",
  "cms_upload",
  "pexels",
  "unsplash",
]);

export const apiCallStatusEnum = pgEnum("api_call_status", ["success", "error"]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

// Better-Auth required tables
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  apiBaseUrl: text("api_base_url").notNull(),
  apiKey: text("api_key").notNull(),
  // Which CMS dialect this site speaks. Defaults to wordpress so every
  // existing row is treated as a WP site. New Pinterest CMS installs set
  // this to "pinterest-cms" explicitly.
  kind: siteKindEnum("kind").default("wordpress").notNull(),
  status: siteStatusEnum("status").default("active").notNull(),
  defaultCategory: text("default_category"),
  defaultTone: text("default_tone"),
  notes: text("notes"),
  imageProvider: imageProviderEnum("image_provider").default("dalle").notNull(),
  imageStyle: text("image_style"),
  // Pinterest-optimized generation settings
  pinterestMode: boolean("pinterest_mode").default(false).notNull(),
  pinterestCoverPromptExtra: text("pinterest_cover_prompt_extra"),
  pinterestSectionPromptExtra: text("pinterest_section_prompt_extra"),
  pinterestContentStyle: text("pinterest_content_style"),
  pinterestImageSize: text("pinterest_image_size").default("1000x1500"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tones = pgTable("tones", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").default("active").notNull(),
  defaultSiteId: uuid("default_site_id").references(() => sites.id),
  defaultCategory: text("default_category"),
  defaultWordCount: integer("default_word_count").default(1200).notNull(),
  defaultTone: text("default_tone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const keywords = pgTable(
  "keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    difficulty: integer("difficulty"),
    intent: keywordIntentEnum("intent"),
    cluster: text("cluster"),
    status: keywordStatusEnum("status").default("new").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("keywords_project_id_idx").on(t.projectId),
    index("keywords_status_idx").on(t.status),
  ]
);

export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    keywordId: uuid("keyword_id").references(() => keywords.id),
    title: text("title").notNull(),
    targetKeyword: text("target_keyword").notNull(),
    outline: jsonb("outline").notNull(),
    wordCount: integer("word_count").default(1200).notNull(),
    toneId: uuid("tone_id").references(() => tones.id),
    customInstructions: text("custom_instructions"),
    faqQuestions: jsonb("faq_questions"),
    internalLinks: jsonb("internal_links"),
    status: briefStatusEnum("status").default("draft").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("briefs_project_id_idx").on(t.projectId)]
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    briefId: uuid("brief_id").references(() => briefs.id),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    contentHtml: text("content_html").notNull(),
    contentMarkdown: text("content_markdown"),
    coverImageUrl: text("cover_image_url"),
    coverImageAlt: text("cover_image_alt"),
    galleryImages: jsonb("gallery_images").default([]).notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    seoKeywords: text("seo_keywords"),
    status: draftStatusEnum("status").default("draft").notNull(),
    scheduledFor: timestamp("scheduled_for"),
    publishedAt: timestamp("published_at"),
    targetSiteId: uuid("target_site_id").references(() => sites.id),
    targetCategory: text("target_category"),
    publishedPostId: text("published_post_id"),
    publishedUrl: text("published_url"),
    failureReason: text("failure_reason"),
    generationCostUsd: numeric("generation_cost_usd", {
      precision: 8,
      scale: 4,
    }),
    generationModel: text("generation_model"),
    generationTokensIn: integer("generation_tokens_in"),
    generationTokensOut: integer("generation_tokens_out"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("drafts_project_id_idx").on(t.projectId),
    index("drafts_status_idx").on(t.status),
    index("drafts_scheduled_for_idx").on(t.scheduledFor),
    // Used to look up a draft by its CMS post id during republish (PUT vs POST).
    index("drafts_published_post_id_idx").on(t.publishedPostId),
  ]
);

export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: promptKindEnum("kind").notNull(),
  template: text("template").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiCalls = pgTable(
  "api_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: apiCallKindEnum("kind").notNull(),
    driverId: text("driver_id"),
    status: apiCallStatusEnum("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    costUsd: numeric("cost_usd", { precision: 8, scale: 4 }).default("0").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("api_calls_created_at_idx").on(t.createdAt)]
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    status: jobStatusEnum("status").notNull(),
    inputId: text("input_id"),
    inngestRunId: text("inngest_run_id"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_created_at_idx").on(t.createdAt),
  ]
);
