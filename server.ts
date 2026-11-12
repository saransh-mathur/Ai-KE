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
  ingestLiveIncidentAlert,
  getRecentWebhookEvents,
  recordFeedbackLog,
  getFeedbackStats,
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
  // 1. Real-Time Webhook Ingestion Pipeline (PagerDuty, Jira, CloudWatch)
  // ---------------------------------------------------------------------------

  app.post('/api/webhooks/incidents', async (req, res) => {
    try {
      const payload = req.body || {};
      const sourceHeader = req.headers['x-webhook-source'] as string;
      const source = (sourceHeader || payload.source || 'pagerduty').toLowerCase();

      // Normalize fields across PagerDuty, Jira, and AWS CloudWatch
      let title = payload.title || payload.summary || payload.event_description || 'Unspecified Incident Alert';
      let severity = payload.severity || payload.priority || 'SEV-2';
      let rootCause = payload.rootCause || payload.details || payload.alarm_reason || 'Automated health check alert triggered by monitoring agent.';
      let assetId = payload.assetId || payload.asset_id || 'ast-rds-01';
      let downtimeMinutes = Number(payload.downtimeMinutes || payload.downtime_minutes || 15);
      const alertId = payload.alertId || payload.id || `alert-${Date.now().toString().slice(-6)}`;

      // PagerDuty payload mapping
      if (source === 'pagerduty' && payload.event) {
        title = payload.event.data?.title || payload.event.summary || title;
        severity = payload.event.data?.urgency === 'high' ? 'SEV-1' : 'SEV-2';
        rootCause = payload.event.data?.custom_details?.summary || rootCause;
      }
      // AWS CloudWatch alarm mapping
      else if (source === 'cloudwatch' && payload.AlarmName) {
        title = `AWS CloudWatch Alarm: ${payload.AlarmName}`;
        severity = payload.NewStateValue === 'ALARM' ? 'SEV-1' : 'SEV-2';
        rootCause = payload.NewStateReason || 'CloudWatch metric threshold breached cross-AZ.';
      }
      // Jira incident issue mapping
      else if (source === 'jira' && payload.issue) {
        title = `JIRA ${payload.issue.key}: ${payload.issue.fields?.summary || title}`;
        severity = payload.issue.fields?.priority?.name?.includes('High') ? 'SEV-1' : 'SEV-2';
        rootCause = payload.issue.fields?.description || rootCause;
      }

      // Ingest dynamically into Cloud SQL (incidents + knowledge_chunks + webhook_events)
      const ingested = await ingestLiveIncidentAlert({
        source,
        alertId,
        title,
        severity,
        rootCause,
        assetId,
        downtimeMinutes,
        rawPayload: payload,
      });

      res.status(201).json({
        success: true,
        message: `Successfully ingested ${severity} alert from ${source.toUpperCase()}`,
        ingested,
      });
    } catch (error: any) {
      console.error('Webhook ingestion error:', error);
      res.status(500).json({ error: error.message || 'Webhook ingestion failed' });
    }
  });

  // Recent webhook events log
  app.get('/api/webhooks/recent', async (_req, res) => {
    try {
      const events = await getRecentWebhookEvents(15);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch webhook events' });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Automated Feedback Loop & RLHF Dataset Logging
  // ---------------------------------------------------------------------------

  app.post('/api/feedback', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const {
        queryText,
        answerSnippet,
        rating,
        feedbackNote,
        selectedDocId,
        suggestedDocId,
        rrfWeightAdjustment,
      } = req.body;

      if (!queryText || !rating) {
        return res.status(400).json({ error: 'queryText and rating are required' });
      }

      let userEmail = 'guest@enterprise-engine.local';
      if (req.user && req.user.email) {
        userEmail = req.user.email;
      }

      const log = await recordFeedbackLog({
        queryText,
        answerSnippet: answerSnippet || 'N/A',
        rating,
        feedbackNote,
        selectedDocId,
        suggestedDocId,
        userEmail,
        rrfWeightAdjustment: rrfWeightAdjustment || {
          kAdjustment: rating === 'positive' ? 0 : 5,
          timestamp: new Date().toISOString(),
        },
      });

      res.status(201).json({
        success: true,
        message: `Logged ${rating} feedback to RLHF dataset.`,
        feedback: log,
      });
    } catch (error: any) {
      console.error('Feedback recording error:', error);
      res.status(500).json({ error: error.message || 'Failed to record feedback' });
    }
  });

  // RLHF Feedback Metrics & Recommended RRF Weights
  app.get('/api/feedback/stats', async (_req, res) => {
    try {
      const stats = await getFeedbackStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch feedback stats' });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Modal Document & Architecture Diagram Parsing
  // ---------------------------------------------------------------------------

  app.post('/api/multimodal/parse-diagram', async (req, res) => {
    try {
      const {
        diagramPreset = 'aws_multi_az_payment',
        diagramTitle = 'AWS Multi-AZ Payment Processing Architecture',
        imageBase64,
      } = req.body;

      // Built-in high-fidelity presets for immediate zero-config exploration
      const PRESET_TOPOLOGIES: Record<string, any> = {
        aws_multi_az_payment: {
          diagramTitle: 'AWS Multi-AZ Payment Processing Architecture',
          cloudProvider: 'Amazon Web Services (AWS)',
          detectedTopology: 'Multi-AZ Active-Passive Database Cluster with API Gateway Ingress & NVMe Storage Cache',
          nodes: [
            { id: 'diag-ast-01', name: 'AWS Aurora PostgreSQL Primary', type: 'database', vendor: 'Amazon Web Services (AWS)', region: 'us-east-1a', criticality: 'mission-critical', securityClearance: 'L3_RESTRICTED' },
            { id: 'diag-ast-02', name: 'AWS Aurora Read Replica Standby', type: 'database', vendor: 'Amazon Web Services (AWS)', region: 'us-east-1b', criticality: 'mission-critical', securityClearance: 'L2_CONFIDENTIAL' },
            { id: 'diag-ast-03', name: 'Payment Ingress API Gateway (NLB)', type: 'cloud_service', vendor: 'Amazon Web Services (AWS)', region: 'us-east-1', criticality: 'mission-critical', securityClearance: 'L1_PUBLIC' },
            { id: 'diag-ast-04', name: 'Pure Storage NVMe Flash Cache Array', type: 'storage', vendor: 'Pure Storage Systems', region: 'us-east-1', criticality: 'mission-critical', securityClearance: 'L2_CONFIDENTIAL' },
            { id: 'diag-ast-05', name: 'Cisco Spine Ingress Switch SW-01', type: 'network_switch', vendor: 'Cisco Systems Enterprise', region: 'us-east-1', criticality: 'business-operational', securityClearance: 'L1_PUBLIC' },
          ],
          edges: [
            { source: 'diag-ast-03', target: 'diag-ast-01', relationship: 'ROUTES_TRAFFIC_TO', protocol: 'mTLS HTTPS' },
            { source: 'diag-ast-01', target: 'diag-ast-02', relationship: 'REPLICATES_TO', protocol: 'Async WAL Stream' },
            { source: 'diag-ast-01', target: 'diag-ast-04', relationship: 'IMPACTS', protocol: 'NVMe-oF Fiber' },
            { source: 'diag-ast-05', target: 'diag-ast-03', relationship: 'PROTECTS', protocol: 'BGP EVPN' },
          ],
          extractedSlaRisks: [
            'Single-AZ cross-connect bottleneck between Aurora Primary (us-east-1a) and Standby (us-east-1b)',
            'NVMe Flash Cache relies on single SAN controller firmware SLA §14.2',
            'Cross-region replication lag during microcode hypervisor patching',
          ],
        },
        hybrid_cloud_backbone: {
          diagramTitle: 'Global Hybrid Cloud & Financial Clearing Backbone',
          cloudProvider: 'Hybrid (AWS + On-Prem + CloudScale EU)',
          detectedTopology: 'Cross-Continent Multi-Cloud Spine-Leaf with Hardware Security Modules',
          nodes: [
            { id: 'diag-net-01', name: 'Cisco Nexus 9336C DC Core Spine', type: 'network_switch', vendor: 'Cisco Systems Enterprise', region: 'us-west-2', criticality: 'mission-critical', securityClearance: 'L2_CONFIDENTIAL' },
            { id: 'diag-srv-01', name: 'SRV-Alpha (CloudScale V-101 EU)', type: 'server', vendor: 'Amazon Web Services (AWS)', region: 'europe-west1', criticality: 'mission-critical', securityClearance: 'L1_PUBLIC' },
            { id: 'diag-db-01', name: 'Snowflake Analytics Core Cluster', type: 'cloud_service', vendor: 'Snowflake Computing Inc.', region: 'us-east-1', criticality: 'business-operational', securityClearance: 'L1_PUBLIC' },
          ],
          edges: [
            { source: 'diag-net-01', target: 'diag-srv-01', relationship: 'ROUTES_TRAFFIC_TO', protocol: 'IPsec VPN Tunnel' },
            { source: 'diag-srv-01', target: 'diag-db-01', relationship: 'REPLICATES_TO', protocol: 'Kafka CDC Pipe' },
          ],
          extractedSlaRisks: [
            'Transatlantic transit latency spike during European GDPR data reconciliation runs',
            'Cisco BGP flapping risk during MTU jumbo frame mismatch (>9000 bytes)',
          ],
        },
      };

      // 1. If Gemini API key is present and an image was provided, run Vision analysis
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' && imageBase64) {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({});

          const visionPrompt = `You are an Enterprise Infrastructure Architect & Vision Parser.
Analyze this architecture diagram image. Identify and extract:
1. All infrastructure nodes (databases, servers, switches, cloud services, storage arrays) with their detected Vendor and Region.
2. All relationship edges connecting them (e.g., ROUTES_TRAFFIC_TO, REPLICATES_TO, SUPPLIES, IMPACTS).
3. Any single-point-of-failure or SLA risks shown in the topology.
Format your output strictly as a JSON object matching this schema:
{
  "diagramTitle": "Extracted Diagram Title",
  "cloudProvider": "AWS / Azure / GCP / Hybrid",
  "detectedTopology": "Short summary",
  "nodes": [{ "id": "ast-id", "name": "...", "type": "database|server|storage|network_switch|cloud_service", "vendor": "...", "region": "...", "criticality": "mission-critical", "securityClearance": "L1_PUBLIC|L2_CONFIDENTIAL|L3_RESTRICTED" }],
  "edges": [{ "source": "ast-id-1", "target": "ast-id-2", "relationship": "ROUTES_TRAFFIC_TO", "protocol": "..." }],
  "extractedSlaRisks": ["Risk 1", "Risk 2"]
}`;

          const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: cleanBase64,
                },
              },
              { text: visionPrompt },
            ],
          });

          if (response && response.text) {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              return res.json({
                success: true,
                source: 'gemini-vision-extracted',
                diagram: parsed,
              });
            }
          }
        } catch (visionErr: any) {
          console.warn('Gemini vision extraction fallback to preset:', visionErr?.message);
        }
      }

      // 2. Return high-fidelity preset topology
      const selectedPreset = PRESET_TOPOLOGIES[diagramPreset] || PRESET_TOPOLOGIES.aws_multi_az_payment;
      res.json({
        success: true,
        source: 'preset-vision-parser',
        diagram: {
          ...selectedPreset,
          diagramTitle: diagramTitle || selectedPreset.diagramTitle,
        },
      });
    } catch (error: any) {
      console.error('Multi-modal diagram parsing error:', error);
      res.status(500).json({ error: error.message || 'Diagram parsing failed' });
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
