import { db, pool } from './index.ts';
import {
  users,
  vendors,
  assets,
  businessUnits,
  incidents,
  knowledgeChunks,
  savedQueries,
  webhookEvents,
  feedbackLogs,
  audioTranscripts,
} from './schema.ts';
import { eq, desc, and } from 'drizzle-orm';
import { buildSeedPayloads } from '../lib/seed-data.ts';
import {
  parseNaturalLanguageQuery,
  executeHybridRetrievalWithDataset,
} from '../lib/hybrid-search.ts';
import { validateReadOnlySqlQuery } from '../lib/sql-runner.ts';
import type {
  Asset,
  AssetType,
  BusinessUnit,
  ContractStatus,
  Incident,
  IncidentSeverity,
  KnowledgeChunk,
  SecurityClearanceLevel,
  Vendor,
  VendorTier,
} from '../lib/types.ts';

/**
 * User Registration & Synchronization helper using upsert to avoid race conditions.
 */
export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  photoURL?: string | null
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || null,
        photoURL: photoURL || null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || null,
          photoURL: photoURL || null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to get or create user:', error);
    throw new Error('User synchronization failed', { cause: error });
  }
}

/**
 * Fetch all vendors from Cloud SQL
 */
export async function getAllVendors() {
  try {
    return await db.select().from(vendors);
  } catch (error) {
    console.error('Failed to fetch vendors:', error);
    throw new Error('Database query for vendors failed', { cause: error });
  }
}

/**
 * Fetch all assets with joined vendor and business unit
 */
export async function getAllAssets() {
  try {
    return await db
      .select({
        id: assets.id,
        name: assets.name,
        type: assets.type,
        region: assets.region,
        criticality: assets.criticality,
        specs: assets.specs,
        vendorId: assets.vendorId,
        vendorName: vendors.name,
        vendorTier: vendors.tier,
        vendorStatus: vendors.contractStatus,
        businessUnitId: assets.businessUnitId,
        businessUnitName: businessUnits.name,
        costCenter: businessUnits.costCenter,
      })
      .from(assets)
      .innerJoin(vendors, eq(assets.vendorId, vendors.id))
      .innerJoin(businessUnits, eq(assets.businessUnitId, businessUnits.id));
  } catch (error) {
    console.error('Failed to fetch assets:', error);
    throw new Error('Database query for assets failed', { cause: error });
  }
}

/**
 * Fetch all incidents with associated asset details
 */
export async function getAllIncidents() {
  try {
    return await db
      .select({
        id: incidents.id,
        title: incidents.title,
        severity: incidents.severity,
        rootCause: incidents.rootCause,
        downtimeMinutes: incidents.downtimeMinutes,
        resolvedAt: incidents.resolvedAt,
        assetId: incidents.assetId,
        assetName: assets.name,
        assetType: assets.type,
      })
      .from(incidents)
      .innerJoin(assets, eq(incidents.assetId, assets.id));
  } catch (error) {
    console.error('Failed to fetch incidents:', error);
    throw new Error('Database query for incidents failed', { cause: error });
  }
}

/**
 * Fetch all knowledge chunks
 */
export async function getAllKnowledgeChunks() {
  try {
    return await db.select().from(knowledgeChunks);
  } catch (error) {
    console.error('Failed to fetch knowledge chunks:', error);
    throw new Error('Database query for knowledge chunks failed', { cause: error });
  }
}

/**
 * Save user audit query in Cloud SQL
 */
export async function recordSavedQuery(
  userEmail: string,
  queryText: string,
  filtersApplied: Record<string, any>,
  topResultDoc?: string,
  rrfScore?: number,
  userId?: number
) {
  try {
    const res = await db
      .insert(savedQueries)
      .values({
        userId: userId || null,
        userEmail,
        queryText,
        filtersApplied,
        topResultDoc: topResultDoc || null,
        rrfScore: rrfScore || null,
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Failed to record saved query:', error);
    throw new Error('Failed to record query to database', { cause: error });
  }
}

/**
 * Fetch recent queries for the user or team
 */
export async function getRecentSavedQueries(limitCount: number = 10) {
  try {
    return await db
      .select()
      .from(savedQueries)
      .orderBy(desc(savedQueries.createdAt))
      .limit(limitCount);
  } catch (error) {
    console.error('Failed to fetch saved queries:', error);
    throw new Error('Failed to fetch saved queries from database', { cause: error });
  }
}

/**
  * Ingest a live incident alert from Webhooks (PagerDuty, Jira, CloudWatch)
  * Dynamically creates incident node, knowledge chunk, and webhook event.
  */
export async function ingestLiveIncidentAlert(data: {
  source: string;
  alertId?: string;
  title: string;
  severity: string;
  rootCause: string;
  assetId: string;
  downtimeMinutes?: number;
  rawPayload?: Record<string, any>;
}) {
  try {
    const incId = data.alertId || `inc-${Date.now().toString().slice(-6)}`;
    const chunkId = `chk-live-${Date.now().toString().slice(-6)}`;

    // 1. Insert incident into Cloud SQL
    const [newIncident] = await db
      .insert(incidents)
      .values({
        id: incId,
        title: data.title,
        severity: data.severity,
        rootCause: data.rootCause,
        assetId: data.assetId,
        downtimeMinutes: data.downtimeMinutes || 0,
      })
      .onConflictDoUpdate({
        target: incidents.id,
        set: {
          title: data.title,
          severity: data.severity,
          rootCause: data.rootCause,
          downtimeMinutes: data.downtimeMinutes || 0,
        },
      })
      .returning();

    // 2. Generate knowledge chunk for semantic vector search
    const [newChunk] = await db
      .insert(knowledgeChunks)
      .values({
        id: chunkId,
        assetId: data.assetId,
        documentTitle: `Live Alert (${data.source.toUpperCase()}): ${data.title}`,
        docType: 'incident_postmortem',
        chunkText: `[Live Ingest: ${data.source.toUpperCase()}] Incident ${incId} (${data.severity}): ${data.title}. Root Cause: ${data.rootCause}. Target Asset ID: ${data.assetId}. Downtime: ${data.downtimeMinutes || 0} minutes. Dynamic vector chunk generated via webhook stream.`,
        metadata: {
          source: data.source,
          alertId: incId,
          ingestionTimestamp: new Date().toISOString(),
          tags: ['live-webhook', data.source, data.severity.toLowerCase(), 'dynamic-ingest'],
          security_clearance: data.severity === 'SEV-1' ? 'L3_RESTRICTED' : 'L2_CONFIDENTIAL',
        },
      })
      .returning();

    // 3. Log webhook event
    const [event] = await db
      .insert(webhookEvents)
      .values({
        source: data.source,
        eventAction: 'incident.ingested',
        rawPayload: data.rawPayload || { title: data.title, severity: data.severity },
        extractedAssetId: data.assetId,
        generatedIncidentId: incId,
        generatedChunkId: chunkId,
        status: 'processed',
      })
      .returning();

    return {
      incident: newIncident,
      chunk: newChunk,
      webhookEvent: event,
    };
  } catch (error) {
    console.error('Failed to ingest live incident alert:', error);
    throw new Error('Failed to ingest webhook alert into database', { cause: error });
  }
}

/**
 * Fetch recent webhook events
 */
export async function getRecentWebhookEvents(limitCount: number = 10) {
  try {
    return await db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(limitCount);
  } catch (error) {
    console.error('Failed to fetch webhook events:', error);
    throw new Error('Failed to fetch webhook events from database', { cause: error });
  }
}

/**
 * Record user feedback for RLHF and dynamic RRF parameter tuning
 */
export async function recordFeedbackLog(data: {
  queryText: string;
  answerSnippet: string;
  rating: 'positive' | 'negative';
  feedbackNote?: string;
  selectedDocId?: string;
  suggestedDocId?: string;
  userEmail?: string;
  rrfWeightAdjustment?: Record<string, any>;
}) {
  try {
    const [res] = await db
      .insert(feedbackLogs)
      .values({
        queryText: data.queryText,
        answerSnippet: data.answerSnippet,
        rating: data.rating,
        feedbackNote: data.feedbackNote || null,
        selectedDocId: data.selectedDocId || null,
        suggestedDocId: data.suggestedDocId || null,
        userEmail: data.userEmail || 'guest@enterprise-engine.local',
        rrfWeightAdjustment: data.rrfWeightAdjustment || {},
      })
      .returning();
    return res;
  } catch (error) {
    console.error('Failed to record feedback log:', error);
    throw new Error('Failed to record feedback in database', { cause: error });
  }
}

/**
 * Fetch feedback metrics and RLHF training statistics
 */
export async function getFeedbackStats() {
  try {
    const logs = await db
      .select()
      .from(feedbackLogs)
      .orderBy(desc(feedbackLogs.createdAt))
      .limit(20);

    let positiveCount = 0;
    let negativeCount = 0;
    for (const log of logs) {
      if (log.rating === 'positive') positiveCount++;
      else if (log.rating === 'negative') negativeCount++;
    }

    const total = positiveCount + negativeCount;
    const satisfactionRate = total > 0 ? Math.round((positiveCount / total) * 100) : 100;

    return {
      totalFeedbackCount: total,
      positiveCount,
      negativeCount,
      satisfactionRate,
      recommendedRrfK: negativeCount > positiveCount ? 65 : 60,
      recentLogs: logs,
    };
  } catch (error) {
    console.error('Failed to get feedback stats:', error);
    throw new Error('Failed to fetch feedback statistics', { cause: error });
  }
}

/**
 * Persist an audio transcription generated via gemini-3.5-transcribe in Cloud SQL
 */
export async function saveAudioTranscript(data: {
  userId?: number;
  userEmail?: string;
  mimeType: string;
  durationSeconds?: number;
  transcriptText: string;
  modelUsed?: string;
  targetContext?: string;
}) {
  try {
    const [res] = await db
      .insert(audioTranscripts)
      .values({
        userId: data.userId || null,
        userEmail: data.userEmail || 'guest@enterprise-engine.local',
        mimeType: data.mimeType,
        durationSeconds: Math.max(0, Math.floor(data.durationSeconds || 0)),
        transcriptText: data.transcriptText,
        modelUsed: data.modelUsed || 'gemini-3.5-transcribe',
        targetContext: data.targetContext || 'search_query',
      })
      .returning();
    return res;
  } catch (error) {
    console.error('Failed to save audio transcript:', error);
    throw new Error('Failed to persist audio transcript in database', { cause: error });
  }
}

/**
 * Fetch recent audio transcriptions from Cloud SQL
 */
export async function getRecentAudioTranscripts(limitCount: number = 20, userId?: number) {
  try {
    const baseQuery = db.select().from(audioTranscripts);
    if (typeof userId === 'number') {
      return await baseQuery
        .where(eq(audioTranscripts.userId, userId))
        .orderBy(desc(audioTranscripts.createdAt))
        .limit(limitCount);
    }
    return await baseQuery
      .orderBy(desc(audioTranscripts.createdAt))
      .limit(limitCount);
  } catch (error) {
    console.error('Failed to fetch audio transcripts:', error);
    throw new Error('Failed to fetch audio transcripts from database', { cause: error });
  }
}

/**
 * Delete an audio transcript record by ID
 */
export async function deleteAudioTranscript(id: number, userId?: number) {
  try {
    const condition =
      typeof userId === 'number'
        ? and(eq(audioTranscripts.id, id), eq(audioTranscripts.userId, userId))
        : eq(audioTranscripts.id, id);

    const deleted = await db
      .delete(audioTranscripts)
      .where(condition)
      .returning();

    return deleted[0] || null;
  } catch (error) {
    console.error('Failed to delete audio transcript:', error);
    throw new Error('Failed to delete audio transcript from database', { cause: error });
  }
}

/**
 * Fetch all business units from Cloud SQL
 */
export async function getAllBusinessUnits() {
  try {
    return await db.select().from(businessUnits);
  } catch (error) {
    console.error('Failed to fetch business units:', error);
    throw new Error('Database query for business units failed', { cause: error });
  }
}

/**
 * Idempotently populate Cloud SQL with demo master data, assets, incidents, and knowledge chunks.
 */
export async function seedDemoData() {
  try {
    const payloads = buildSeedPayloads();

    await db.insert(vendors).values(payloads.vendors).onConflictDoNothing();
    await db.insert(businessUnits).values(payloads.businessUnits).onConflictDoNothing();
    await db.insert(assets).values(payloads.assets).onConflictDoNothing();
    await db.insert(incidents).values(payloads.incidents).onConflictDoNothing();
    await db.insert(knowledgeChunks).values(payloads.knowledgeChunks).onConflictDoNothing();

    const [vendorRows, buRows, assetRows, incidentRows, chunkRows] = await Promise.all([
      db.select().from(vendors),
      db.select().from(businessUnits),
      db.select().from(assets),
      db.select().from(incidents),
      db.select().from(knowledgeChunks),
    ]);

    return {
      vendors: vendorRows.length,
      businessUnits: buRows.length,
      assets: assetRows.length,
      incidents: incidentRows.length,
      knowledgeChunks: chunkRows.length,
    };
  } catch (error) {
    console.error('Failed to seed demo data into Cloud SQL:', error);
    throw new Error('Failed to seed demo data into Cloud SQL', { cause: error });
  }
}

/**
 * Inspect PostgreSQL server health, pgvector extension status, and table row counts.
 */
export async function getDatabaseHealth() {
  try {
    const [versionRes, extRes, vendorRows, buRows, assetRows, incidentRows, chunkRows, savedRows] =
      await Promise.all([
        pool.query('SELECT current_database() AS db, version() AS pg_version'),
        pool.query("SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pg_trgm')"),
        db.select().from(vendors),
        db.select().from(businessUnits),
        db.select().from(assets),
        db.select().from(incidents),
        db.select().from(knowledgeChunks),
        db.select().from(savedQueries),
      ]);

    const extensions = extRes.rows.map((r) => `${r.extname}@${r.extversion}`);

    return {
      connected: true,
      database: versionRes.rows[0]?.db || process.env.SQL_DB_NAME || 'ai_knowledge_engine',
      postgresVersion: String(versionRes.rows[0]?.pg_version || '').split(',')[0],
      extensions,
      pgvectorEnabled: extRes.rows.some((r) => r.extname === 'vector'),
      counts: {
        vendors: vendorRows.length,
        businessUnits: buRows.length,
        assets: assetRows.length,
        incidents: incidentRows.length,
        knowledgeChunks: chunkRows.length,
        savedQueries: savedRows.length,
      },
    };
  } catch (error) {
    console.error('Database healthcheck failed:', error);
    throw new Error('PostgreSQL database healthcheck failed', { cause: error });
  }
}

/**
 * Execute Hybrid Retrieval + RBAC Pre-Filtering directly over live PostgreSQL tables via Drizzle ORM.
 */
export async function executePostgresHybridSearch(params: {
  query: string;
  overrideRegion?: string;
  overrideTier?: string;
  userClearance?: SecurityClearanceLevel;
  kConstant?: number;
  maxResults?: number;
}) {
  try {
    const [vendorRows, buRows, assetRows, incidentRows, chunkRows] = await Promise.all([
      db.select().from(vendors),
      db.select().from(businessUnits),
      db.select().from(assets),
      db.select().from(incidents),
      db.select().from(knowledgeChunks),
    ]);

    const mappedVendors: Vendor[] = vendorRows.map((v) => ({
      id: v.id,
      name: v.name,
      tier: (Number(v.tier) || 2) as VendorTier,
      contract_status: v.contractStatus as ContractStatus,
      metadata: {
        category: v.category,
        account_manager: v.accountManager,
        sla_percentage: v.slaPercentage,
        headquarters: v.headquarters,
      },
    }));

    const mappedBUs: BusinessUnit[] = buRows.map((bu) => ({
      id: bu.id,
      name: bu.name,
      cost_center: bu.costCenter,
      lead: bu.leadContact,
    }));

    const mappedAssets: Asset[] = assetRows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type as AssetType,
      region: a.region,
      vendor_id: a.vendorId,
      business_unit_id: a.businessUnitId,
      criticality: a.criticality as Asset['criticality'],
      specs: (a.specs || {}) as Asset['specs'],
    }));

    const mappedIncidents: Incident[] = incidentRows.map((inc) => ({
      id: inc.id,
      title: inc.title,
      severity: inc.severity as IncidentSeverity,
      root_cause: inc.rootCause,
      asset_id: inc.assetId,
      resolved_at: inc.resolvedAt ? inc.resolvedAt.toISOString() : '',
      downtime_minutes: inc.downtimeMinutes,
      security_clearance:
        inc.severity === 'SEV-1'
          ? 'L3_RESTRICTED'
          : inc.severity === 'SEV-2'
            ? 'L2_CONFIDENTIAL'
            : 'L1_PUBLIC',
    }));

    const mappedChunks: KnowledgeChunk[] = chunkRows.map((chk) => {
      const meta = (chk.metadata || {}) as Record<string, any>;
      const clearance = (meta.security_clearance || 'L1_PUBLIC') as SecurityClearanceLevel;
      return {
        id: chk.id,
        asset_id: chk.assetId,
        document_title: chk.documentTitle,
        doc_type: chk.docType as KnowledgeChunk['doc_type'],
        chunk_index: chk.chunkIndex,
        chunk_text: chk.chunkText,
        security_clearance: clearance,
        metadata: {
          author: String(meta.author || 'Enterprise Platform'),
          last_reviewed: String(meta.last_reviewed || new Date().toISOString().slice(0, 10)),
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          security_clearance: clearance,
          source: meta.source,
          alertId: meta.alertId,
          ingestionTimestamp: meta.ingestionTimestamp,
        },
      };
    });

    const analysis = parseNaturalLanguageQuery(params.query);
    const execution = executeHybridRetrievalWithDataset(
      params.query,
      analysis,
      {
        vendors: mappedVendors,
        businessUnits: mappedBUs,
        assets: mappedAssets,
        incidents: mappedIncidents,
        knowledgeChunks: mappedChunks,
      },
      {
        applySqlFilters: true,
        useGraphRank: true,
        overrideRegion: params.overrideRegion,
        overrideTier: params.overrideTier,
        userClearance: params.userClearance || 'L3_RESTRICTED',
        kConstant: params.kConstant || 60,
        maxResults: params.maxResults || 5,
      }
    );

    return {
      source: 'postgresql',
      rowCount: mappedChunks.length,
      execution,
    };
  } catch (error) {
    console.error('PostgreSQL hybrid search failed:', error);
    throw new Error('PostgreSQL hybrid search failed', { cause: error });
  }
}

/**
 * Execute a validated read-only raw SQL query against PostgreSQL inside a BEGIN READ ONLY transaction.
 */
export async function executeRawSqlQuery(rawSql: string, maxRows: number = 200) {
  const validation = validateReadOnlySqlQuery(rawSql);
  if (!validation.valid) {
    const err = new Error(validation.error || 'Invalid read-only SQL query');
    (err as any).statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  const t0 = performance.now();

  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '8000'");
    const result = await client.query(validation.normalizedSql);
    await client.query('COMMIT');

    const elapsedMs = Number((performance.now() - t0).toFixed(2));
    const columns = result.fields.map((f) => f.name);
    const totalRows = result.rows.length;
    const truncated = totalRows > maxRows;
    const slicedRows = truncated ? result.rows.slice(0, maxRows) : result.rows;

    return {
      columns,
      rows: slicedRows,
      rowCount: slicedRows.length,
      totalRows,
      truncated,
      executionTimeMs: elapsedMs,
      command: result.command || 'SELECT',
    };
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    const err = new Error(error?.message || 'PostgreSQL query execution failed', { cause: error });
    (err as any).statusCode = error?.code ? 400 : 500;
    (err as any).pgCode = error?.code;
    (err as any).pgHint = error?.hint;
    throw err;
  } finally {
    client.release();
  }
}
