import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { requireAuth, optionalAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  getAllVendors,
  getAllAssets,
  getAllIncidents,
  getAllKnowledgeChunks,
  recordSavedQuery,
  getRecentSavedQueries,
} from './src/db/queries.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // ---------------------------------------------------------------------------
  // API Routes
  // ---------------------------------------------------------------------------

  // User synchronization with Firebase Auth and Cloud SQL
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Unauthorized: missing user context' });
      }

      const email = req.user.email || `${req.user.uid}@firebase.user`;
      const displayName = req.user.name || null;
      const photoURL = req.user.picture || null;

      const dbUser = await getOrCreateUser(req.user.uid, email, displayName, photoURL);
      res.json({ success: true, user: dbUser });
    } catch (error: any) {
      console.error('Error syncing user:', error);
      res.status(500).json({ error: 'User synchronization failed' });
    }
  });

  // Current session user profile from Cloud SQL
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const dbUser = await getOrCreateUser(req.user.uid, req.user.email || '');
      res.json(dbUser);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  // Fetch vendors from Cloud SQL
  app.get('/api/vendors', async (_req, res) => {
    try {
      const data = await getAllVendors();
      res.json(data);
    } catch (error: any) {
      console.error('Failed to get vendors:', error);
      res.status(500).json({ error: 'Failed to fetch vendors from Cloud SQL' });
    }
  });

  // Fetch assets from Cloud SQL
  app.get('/api/assets', async (_req, res) => {
    try {
      const data = await getAllAssets();
      res.json(data);
    } catch (error: any) {
      console.error('Failed to get assets:', error);
      res.status(500).json({ error: 'Failed to fetch assets from Cloud SQL' });
    }
  });

  // Fetch incidents from Cloud SQL
  app.get('/api/incidents', async (_req, res) => {
    try {
      const data = await getAllIncidents();
      res.json(data);
    } catch (error: any) {
      console.error('Failed to get incidents:', error);
      res.status(500).json({ error: 'Failed to fetch incidents from Cloud SQL' });
    }
  });

  // Fetch knowledge chunks from Cloud SQL
  app.get('/api/knowledge-chunks', async (_req, res) => {
    try {
      const data = await getAllKnowledgeChunks();
      res.json(data);
    } catch (error: any) {
      console.error('Failed to get knowledge chunks:', error);
      res.status(500).json({ error: 'Failed to fetch knowledge chunks from Cloud SQL' });
    }
  });

  // Get recent saved queries from Cloud SQL
  app.get('/api/saved-queries', async (_req, res) => {
    try {
      const data = await getRecentSavedQueries(15);
      res.json(data);
    } catch (error: any) {
      console.error('Failed to get saved queries:', error);
      res.status(500).json({ error: 'Failed to fetch saved queries from Cloud SQL' });
    }
  });

  // Record a query run into Cloud SQL
  app.post('/api/saved-queries', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { queryText, filtersApplied, topResultDoc, rrfScore } = req.body;
      if (!queryText) {
        return res.status(400).json({ error: 'queryText is required' });
      }

      let userEmail = 'guest@enterprise-engine.local';
      let userId: number | undefined = undefined;

      if (req.user && req.user.uid) {
        const u = await getOrCreateUser(req.user.uid, req.user.email || '');
        userId = u.id;
        userEmail = u.email;
      }

      const saved = await recordSavedQuery(
        userEmail,
        queryText,
        filtersApplied || {},
        topResultDoc,
        rrfScore,
        userId
      );
      res.json(saved);
    } catch (error: any) {
      console.error('Failed to record saved query:', error);
      res.status(500).json({ error: 'Failed to record query to database' });
    }
  });

  // ---------------------------------------------------------------------------
  // Vite Integration (Development vs Production)
  // ---------------------------------------------------------------------------
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
