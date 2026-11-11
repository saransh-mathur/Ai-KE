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
      console.error('Failed to save query:', error);
      res.status(500).json({ error: 'Failed to record query in Cloud SQL' });
    }
  });

  // Check AI Provider availability (Gemini API vs Local Ollama)
  app.get('/api/ai-status', (_req, res) => {
    res.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      geminiModel: 'gemini-3.8-flash',
      localOllamaSupported: true,
      defaultOllamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
      defaultOllamaModel: 'llama3',
      defaultEmbeddingModel: 'nomic-embed-text (768-dim)',
    });
  });

  // Generate grounded AI response using Gemini API or Local Ollama
  app.post('/api/generate-ai-answer', async (req, res) => {
    try {
      const {
        query,
        context,
        provider = 'auto',
        ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434',
        ollamaModel = 'llama3',
      } = req.body;

      if (!query || !context) {
        return res.status(400).json({ error: 'Query and context are required' });
      }

      const systemPrompt = `You are an Enterprise Systems Architect & Knowledge Assistant.
Answer the user's question clearly and factually using EXCLUSIVELY the verified enterprise context provided below.
Rules:
1. Base every claim on the provided vendor contracts, asset specs, and incident post-mortems.
2. If an incident or outage is mentioned, cite the severity and root cause.
3. Keep the answer structured, concise, and professional with bullet points where appropriate.
4. Do NOT hallucinate entities not in the context.

Context:
${context}`;

      // 1. Try Google Gemini if requested or auto with API key available
      if ((provider === 'gemini' || provider === 'auto') && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({});
          
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API call timed out after 5000ms')), 5000)
          );

          const geminiPromise = ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `${systemPrompt}\n\nUser Question:\n${query}`,
          });

          const response = await Promise.race([geminiPromise, timeoutPromise]);

          if (response && response.text) {
            return res.json({
              answer: response.text,
              provider: 'Google Gemini (gemini-3.8-flash)',
              source: 'cloud_llm',
            });
          }
        } catch (geminiError: any) {
          console.warn('Gemini generation fallback:', geminiError?.message || geminiError);
          if (provider === 'gemini') {
            return res.status(500).json({
              error: `Gemini API error: ${geminiError?.message || 'Failed to generate content'}. Configure a valid GEMINI_API_KEY in Secrets.`,
              provider: 'Google Gemini (gemini-3.8-flash)',
              fallback: true,
            });
          }
        }
      }

      // 2. Try Local Ollama if requested
      if (provider === 'ollama') {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);

          const ollamaRes = await fetch(`${ollamaHost}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: ollamaModel,
              prompt: `${systemPrompt}\n\nUser Question:\n${query}`,
              stream: false,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (ollamaRes.ok) {
            const data = await ollamaRes.json();
            return res.json({
              answer: data.response,
              provider: `Local Ollama (${ollamaModel})`,
              source: 'local_llm',
            });
          } else {
            throw new Error(`Ollama returned status ${ollamaRes.status}`);
          }
        } catch (ollamaErr: any) {
          console.warn('Ollama local connection error:', ollamaErr?.message);
          return res.status(503).json({
            error: `Could not connect to local Ollama at ${ollamaHost}. Is 'ollama run ${ollamaModel}' running?`,
            provider: `Local Ollama (${ollamaModel})`,
            fallback: true,
          });
        }
      }

      // 3. Deterministic Grounded Engine Fallback (Instant, Zero Egress Cost)
      return res.json({
        answer: null, // Signals frontend to use deterministic grounding engine
        provider: 'Deterministic Grounding Engine',
        source: 'rule_synthesis',
      });
    } catch (error: any) {
      console.error('AI answer generation error:', error);
      res.status(500).json({ error: error.message || 'Generation failed' });
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
