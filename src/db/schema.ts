import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  doublePrecision,
  jsonb,
} from 'drizzle-orm/pg-core';

// 1. Users Table (synchronized with Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoURL: text('photo_url'),
  role: text('role').default('enterprise-architect').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Vendors Table (Master Data)
export const vendors = pgTable('vendors', {
  id: text('id').primaryKey(), // e.g. ven-001
  name: text('name').notNull(),
  tier: text('tier').notNull(), // '1', '2', '3'
  contractStatus: text('contract_status').notNull(), // 'active', 'under_review', etc.
  category: text('category').notNull(),
  accountManager: text('account_manager').notNull(),
  slaPercentage: doublePrecision('sla_percentage').notNull(),
  headquarters: text('headquarters').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Business Units Table (Taxonomy & Organization)
export const businessUnits = pgTable('business_units', {
  id: text('id').primaryKey(), // e.g. bu-pay
  name: text('name').notNull().unique(),
  costCenter: text('cost_center').notNull(),
  leadContact: text('lead_contact').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Assets Table (Hardware & Cloud Infrastructure Inventory)
export const assets = pgTable('assets', {
  id: text('id').primaryKey(), // e.g. ast-rds-01
  name: text('name').notNull(),
  type: text('type').notNull(), // 'database', 'server', 'storage', etc.
  region: text('region').notNull(), // 'us-east-1', etc.
  vendorId: text('vendor_id')
    .references(() => vendors.id, { onDelete: 'restrict' })
    .notNull(),
  businessUnitId: text('business_unit_id')
    .references(() => businessUnits.id, { onDelete: 'restrict' })
    .notNull(),
  criticality: text('criticality').notNull(), // 'mission-critical', etc.
  specs: jsonb('specs').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Incidents Table (Structural Graph Nodes for Post-Mortems)
export const incidents = pgTable('incidents', {
  id: text('id').primaryKey(), // e.g. inc-9021
  title: text('title').notNull(),
  severity: text('severity').notNull(), // 'SEV-1', 'SEV-2', 'SEV-3'
  rootCause: text('root_cause').notNull(),
  assetId: text('asset_id')
    .references(() => assets.id, { onDelete: 'cascade' })
    .notNull(),
  downtimeMinutes: integer('downtime_minutes').default(0).notNull(),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Knowledge Chunks Table (Semantic Text & Vector Metadata)
export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: text('id').primaryKey(), // e.g. chk-001
  assetId: text('asset_id')
    .references(() => assets.id, { onDelete: 'cascade' })
    .notNull(),
  documentTitle: text('document_title').notNull(),
  docType: text('doc_type').notNull(),
  chunkIndex: integer('chunk_index').default(1).notNull(),
  chunkText: text('chunk_text').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. Saved Queries & Audit Trail
export const savedQueries = pgTable('saved_queries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  userEmail: text('user_email').notNull(),
  queryText: text('query_text').notNull(),
  filtersApplied: jsonb('filters_applied').default({}).notNull(),
  topResultDoc: text('top_result_doc'),
  rrfScore: doublePrecision('rrf_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Webhook Events (Real-Time Ingestion from PagerDuty, Jira, CloudWatch)
export const webhookEvents = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(), // 'pagerduty', 'jira', 'cloudwatch', 'simulator'
  eventAction: text('event_action').notNull(),
  rawPayload: jsonb('raw_payload').default({}).notNull(),
  extractedAssetId: text('extracted_asset_id'),
  generatedIncidentId: text('generated_incident_id'),
  generatedChunkId: text('generated_chunk_id'),
  status: text('status').default('processed').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Feedback Logs (Automated Feedback Loop & RLHF Dataset)
export const feedbackLogs = pgTable('feedback_logs', {
  id: serial('id').primaryKey(),
  queryText: text('query_text').notNull(),
  answerSnippet: text('answer_snippet').notNull(),
  rating: text('rating').notNull(), // 'positive' | 'negative'
  feedbackNote: text('feedback_note'),
  selectedDocId: text('selected_doc_id'),
  suggestedDocId: text('suggested_doc_id'),
  userEmail: text('user_email').default('guest@enterprise-engine.local').notNull(),
  rrfWeightAdjustment: jsonb('rrf_weight_adjustment').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  savedQueries: many(savedQueries),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  assets: many(assets),
}));

export const businessUnitsRelations = relations(businessUnits, ({ many }) => ({
  assets: many(assets),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [assets.vendorId],
    references: [vendors.id],
  }),
  businessUnit: one(businessUnits, {
    fields: [assets.businessUnitId],
    references: [businessUnits.id],
  }),
  incidents: many(incidents),
  knowledgeChunks: many(knowledgeChunks),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  asset: one(assets, {
    fields: [incidents.assetId],
    references: [assets.id],
  }),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  asset: one(assets, {
    fields: [knowledgeChunks.assetId],
    references: [assets.id],
  }),
}));

export const savedQueriesRelations = relations(savedQueries, ({ one }) => ({
  user: one(users, {
    fields: [savedQueries.userId],
    references: [users.id],
  }),
}));

