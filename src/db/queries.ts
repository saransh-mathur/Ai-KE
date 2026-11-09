import { db } from './index.ts';
import { users, vendors, assets, businessUnits, incidents, knowledgeChunks, savedQueries } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

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
