import { db } from './index.ts';
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
} from './schema.ts';
import { eq, desc, count, sql } from 'drizzle-orm';

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
