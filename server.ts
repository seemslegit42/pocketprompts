import express from 'express';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  initializeDatabase,
  getAllPrompts,
  getPromptById,
  upsertPrompt,
  deletePromptById,
  getAllCategories,
  upsertCategory,
  deleteCategoryById,
  getPromptVersions,
  revertPromptToVersion,
  getAllProviders,
  setActiveProvider,
  upsertProvider,
  recordExecution,
  getRecentExecutions,
  getShareholderIntegrations,
  upsertShareholderIntegration,
  deleteShareholderIntegration,
  getDatabaseDiagnostics,
  executeSafeReadQuery,
} from './src/server/db.ts';

dotenv.config();

initializeDatabase();

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Lightweight DoT.js compatible template renderer for Structured Outputs
 * Supports {{=it.prop}}, {{~it.arr :item:idx}}...{{~}}, and {{?it.cond}}...{{?}}
 */
function renderDotTemplate(template: string, data: Record<string, any>): string {
  if (!template || !template.trim()) return '';
  try {
    let output = template;

    // Handle array iteration: {{~it.arrayName :itemVar:indexVar}} ... {{~}}
    const loopRegex = /\{~it\.([a-zA-Z0-9_]+)\s*:([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?\}([\s\S]*?)\{~\}/g;
    output = output.replace(loopRegex, (_match, arrayKey, itemVar, indexVar, innerBlock) => {
      const list = data?.[arrayKey];
      if (!Array.isArray(list)) return '';
      return list
        .map((item, idx) => {
          let block = innerBlock;
          if (typeof item === 'object' && item !== null) {
            const propRegex = new RegExp(`\\{\\{=${itemVar}\\.([a-zA-Z0-9_]+)\\}\\}`, 'g');
            block = block.replace(propRegex, (_m: string, propName: string) =>
              String(item[propName] ?? '')
            );
          }
          const directRegex = new RegExp(`\\{\\{=${itemVar}\\}\\}`, 'g');
          block = block.replace(directRegex, String(item ?? ''));
          if (indexVar) {
            const idxRegex = new RegExp(`\\{\\{=${indexVar}\\}\\}`, 'g');
            block = block.replace(idxRegex, String(idx));
          }
          return block;
        })
        .join('');
    });

    // Handle conditionals: {{?it.prop}} ... {{?}}
    const condRegex = /\{\{\?it\.([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\?\}\}/g;
    output = output.replace(condRegex, (_match, propKey, innerBlock) => {
      return data?.[propKey] ? innerBlock : '';
    });

    // Handle direct interpolations: {{=it.prop}}
    output = output.replace(/\{\{=it\.([a-zA-Z0-9_.]+)\}\}/g, (_match, pathKey: string) => {
      const parts = pathKey.split('.');
      let current: any = data;
      for (const p of parts) {
        current = current?.[p];
      }
      return current !== undefined && current !== null ? String(current) : '';
    });

    return output;
  } catch (err) {
    return `<div class="text-xs text-red-400">DoT.js Template Render Error: ${(err as Error).message}</div>`;
  }
}

/**
 * Compile prompt with user query at insertion_point or {{query}} token
 */
function compilePromptTemplate(promptTemplate: string, query: string, insertionPoint: number): string {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return promptTemplate.replace(/\{\{query\}\}/g, '[General comprehensive analysis]').trim();
  }
  if (promptTemplate.includes('{{query}}')) {
    return promptTemplate.replace(/\{\{query\}\}/g, cleanQuery);
  }
  if (insertionPoint >= 0 && insertionPoint <= promptTemplate.length) {
    return (
      promptTemplate.slice(0, insertionPoint) +
      cleanQuery +
      promptTemplate.slice(insertionPoint)
    );
  }
  return `${promptTemplate}\n\n${cleanQuery}`;
}

/**
 * Convert JSON Schema string to @google/genai responseSchema object
 */
function parseStructuredSchema(schemaStr: string): any | undefined {
  if (!schemaStr || !schemaStr.trim()) return undefined;
  try {
    const parsed = JSON.parse(schemaStr);
    const mapType = (t: string) => {
      const upper = String(t || 'STRING').toUpperCase();
      if (upper === 'OBJECT') return Type.OBJECT;
      if (upper === 'ARRAY') return Type.ARRAY;
      if (upper === 'NUMBER') return Type.NUMBER;
      if (upper === 'INTEGER') return Type.INTEGER;
      if (upper === 'BOOLEAN') return Type.BOOLEAN;
      return Type.STRING;
    };

    const transformNode = (node: any): any => {
      if (!node || typeof node !== 'object') return { type: Type.STRING };
      const out: any = {
        type: mapType(node.type),
      };
      if (node.description) out.description = node.description;
      if (node.properties && typeof node.properties === 'object') {
        out.properties = {};
        for (const [k, v] of Object.entries(node.properties)) {
          out.properties[k] = transformNode(v);
        }
      }
      if (node.items) {
        out.items = transformNode(node.items);
      }
      if (Array.isArray(node.required)) {
        out.required = node.required;
      }
      return out;
    };

    return transformNode(parsed);
  } catch {
    return undefined;
  }
}

async function probeEndpoint(url: string, timeoutMs = 900): Promise<{ ok: boolean; latencyMs: number; data?: any }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - start);
    if (!res.ok) return { ok: false, latencyMs };
    const data = await res.json().catch(() => ({}));
    return { ok: true, latencyMs, data };
  } catch {
    clearTimeout(timer);
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// ============================================================================
// REAL-TIME WEBSOCKET COLLABORATION STATE (SERVER AS SOURCE OF TRUTH)
// ============================================================================
interface CollaboratorPresence {
  clientId: string;
  userName: string;
  userColor: string;
  roomId: string; // e.g., 'prompt-ai-employment' or 'new-prompt'
  focusedField: string | null;
  cursorPos: number;
  isTyping: boolean;
  updatedAt: string;
}

interface LivePromptDraft {
  roomId: string;
  title: string;
  prompt: string;
  insertion_point: number;
  color: string;
  followup_prompt: string;
  placeholder_hint: string;
  show_action_bars: boolean;
  use_structured_outputs: boolean;
  structured_schema: string;
  dot_template: string;
  category_ids: string[];
  lastEditedBy: string;
  lastEditedByColor: string;
  updatedAt: string;
}

const connectedClients = new Map<WebSocket, CollaboratorPresence>();
const liveDraftsByRoom = new Map<string, LivePromptDraft>();

function broadcastEvent(eventPayload: Record<string, any>, excludeSocket?: WebSocket) {
  const serialized = JSON.stringify(eventPayload);
  for (const [sock] of connectedClients.entries()) {
    if (sock !== excludeSocket && sock.readyState === WebSocket.OPEN) {
      sock.send(serialized);
    }
  }
}

function broadcastPresence() {
  const collaborators = Array.from(connectedClients.values());
  broadcastEvent({
    type: 'collab:presence',
    collaborators,
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // ============================================================================
  // ATTACH WEBSOCKET SERVER ON /ws/collab (PORT 3000)
  // ============================================================================
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/collab' });

  wss.on('connection', (ws: WebSocket) => {
    const defaultClientId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaultPresence: CollaboratorPresence = {
      clientId: defaultClientId,
      userName: 'Collaborator',
      userColor: '#F2A7A0',
      roomId: 'prompt-ai-employment',
      focusedField: null,
      cursorPos: 0,
      isTyping: false,
      updatedAt: new Date().toISOString(),
    };
    connectedClients.set(ws, defaultPresence);

    // Send initial authoritative state on connect
    ws.send(
      JSON.stringify({
        type: 'collab:init',
        clientId: defaultClientId,
        collaborators: Array.from(connectedClients.values()),
        prompts: getAllPrompts(),
        categories: getAllCategories(),
      })
    );
    broadcastPresence();

    ws.on('message', (rawMessage) => {
      try {
        const msg = JSON.parse(String(rawMessage));
        const currentPresence = connectedClients.get(ws);
        if (!currentPresence) return;

        if (msg.type === 'collab:join') {
          const updated: CollaboratorPresence = {
            ...currentPresence,
            clientId: msg.clientId || currentPresence.clientId,
            userName: msg.userName || currentPresence.userName,
            userColor: msg.userColor || currentPresence.userColor,
            roomId: msg.roomId || currentPresence.roomId,
            focusedField: msg.focusedField ?? currentPresence.focusedField,
            cursorPos: msg.cursorPos ?? currentPresence.cursorPos,
            isTyping: false,
            updatedAt: new Date().toISOString(),
          };
          connectedClients.set(ws, updated);
          broadcastPresence();

          // If there is an active live draft in this room, send it to the joining client
          const roomDraft = liveDraftsByRoom.get(updated.roomId);
          if (roomDraft) {
            ws.send(
              JSON.stringify({
                type: 'prompt:live_state',
                roomId: updated.roomId,
                draft: roomDraft,
              })
            );
          }
        } else if (msg.type === 'collab:cursor') {
          const updated: CollaboratorPresence = {
            ...currentPresence,
            roomId: msg.roomId || currentPresence.roomId,
            focusedField: msg.focusedField ?? null,
            cursorPos: typeof msg.cursorPos === 'number' ? msg.cursorPos : currentPresence.cursorPos,
            isTyping: Boolean(msg.isTyping),
            updatedAt: new Date().toISOString(),
          };
          connectedClients.set(ws, updated);
          broadcastPresence();
        } else if (msg.type === 'prompt:live_edit') {
          const roomId = msg.roomId || currentPresence.roomId;
          const existingDraft = liveDraftsByRoom.get(roomId);
          const mergedDraft: LivePromptDraft = {
            roomId,
            title: msg.draft?.title ?? existingDraft?.title ?? '',
            prompt: msg.draft?.prompt ?? existingDraft?.prompt ?? '',
            insertion_point: msg.draft?.insertion_point ?? existingDraft?.insertion_point ?? -1,
            color: msg.draft?.color ?? existingDraft?.color ?? '#D49B00',
            followup_prompt: msg.draft?.followup_prompt ?? existingDraft?.followup_prompt ?? '',
            placeholder_hint: msg.draft?.placeholder_hint ?? existingDraft?.placeholder_hint ?? '',
            show_action_bars:
              msg.draft?.show_action_bars !== undefined
                ? Boolean(msg.draft.show_action_bars)
                : existingDraft?.show_action_bars ?? true,
            use_structured_outputs:
              msg.draft?.use_structured_outputs !== undefined
                ? Boolean(msg.draft.use_structured_outputs)
                : existingDraft?.use_structured_outputs ?? false,
            structured_schema: msg.draft?.structured_schema ?? existingDraft?.structured_schema ?? '',
            dot_template: msg.draft?.dot_template ?? existingDraft?.dot_template ?? '',
            category_ids: Array.isArray(msg.draft?.category_ids)
              ? msg.draft.category_ids
              : existingDraft?.category_ids ?? [],
            lastEditedBy: currentPresence.userName,
            lastEditedByColor: currentPresence.userColor,
            updatedAt: new Date().toISOString(),
          };

          liveDraftsByRoom.set(roomId, mergedDraft);

          // Update presence cursor & typing state
          connectedClients.set(ws, {
            ...currentPresence,
            roomId,
            focusedField: msg.focusedField ?? currentPresence.focusedField,
            cursorPos: typeof msg.cursorPos === 'number' ? msg.cursorPos : currentPresence.cursorPos,
            isTyping: true,
            updatedAt: new Date().toISOString(),
          });

          // Broadcast delta update to all other collaborators
          broadcastEvent(
            {
              type: 'prompt:live_edit',
              roomId,
              draft: mergedDraft,
              editorClientId: currentPresence.clientId,
              editorName: currentPresence.userName,
              editorColor: currentPresence.userColor,
              focusedField: msg.focusedField ?? null,
              cursorPos: msg.cursorPos ?? 0,
            },
            ws
          );
          broadcastPresence();
        }
      } catch {
        // ignore malformed WS frames
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
      broadcastPresence();
    });
  });

  // ============================================================================
  // 1. EMBEDDED BETTER-SQLITE3 PROMPTS, CATEGORIES & VERSION CONTROL API
  // ============================================================================
  app.get('/api/prompts', (_req, res) => {
    try {
      const prompts = getAllPrompts();
      res.json({ prompts });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/prompts', (req, res) => {
    try {
      const { title, prompt } = req.body;
      if (!title || !prompt) {
        res.status(400).json({ error: 'Both title and prompt are required.' });
        return;
      }
      const saved = upsertPrompt(req.body);
      liveDraftsByRoom.delete(saved.id);
      liveDraftsByRoom.delete('new-prompt');

      const allPrompts = getAllPrompts();
      const versions = getPromptVersions(saved.id);
      broadcastEvent({
        type: 'prompt:saved',
        prompt: saved,
        prompts: allPrompts,
        categories: getAllCategories(),
        versions,
        authorName: req.body.author_name || 'Collaborator',
      });

      res.status(201).json({ prompt: saved, versions });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/prompts/:id', (req, res) => {
    try {
      const saved = upsertPrompt({ ...req.body, id: req.params.id });
      liveDraftsByRoom.delete(saved.id);

      const allPrompts = getAllPrompts();
      const versions = getPromptVersions(saved.id);
      broadcastEvent({
        type: 'prompt:saved',
        prompt: saved,
        prompts: allPrompts,
        categories: getAllCategories(),
        versions,
        authorName: req.body.author_name || 'Collaborator',
      });

      res.json({ prompt: saved, versions });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/prompts/:id', (req, res) => {
    try {
      const deleted = deletePromptById(req.params.id);
      liveDraftsByRoom.delete(req.params.id);

      broadcastEvent({
        type: 'prompt:deleted',
        promptId: req.params.id,
        prompts: getAllPrompts(),
        categories: getAllCategories(),
      });

      res.json({ deleted });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Version Control Endpoints
  app.get('/api/prompts/:id/versions', (req, res) => {
    try {
      const versions = getPromptVersions(req.params.id);
      res.json({ versions });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/prompts/:id/revert', (req, res) => {
    try {
      const { versionId, authorName } = req.body;
      if (!versionId) {
        res.status(400).json({ error: 'versionId is required to revert.' });
        return;
      }
      const revertedPrompt = revertPromptToVersion(req.params.id, versionId, authorName || 'Collaborator');
      liveDraftsByRoom.delete(revertedPrompt.id);

      const versions = getPromptVersions(revertedPrompt.id);
      const allPrompts = getAllPrompts();

      broadcastEvent({
        type: 'version:reverted',
        prompt: revertedPrompt,
        prompts: allPrompts,
        categories: getAllCategories(),
        versions,
        authorName: authorName || 'Collaborator',
      });

      res.json({
        prompt: revertedPrompt,
        versions,
        prompts: allPrompts,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Categories CRUD Endpoints
  app.get('/api/categories', (_req, res) => {
    try {
      res.json({ categories: getAllCategories() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/categories', (req, res) => {
    try {
      const { name, color, description } = req.body;
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }
      const category = upsertCategory({ name, color, description });
      const categories = getAllCategories();
      const prompts = getAllPrompts();

      broadcastEvent({
        type: 'category:updated',
        categories,
        prompts,
      });

      res.status(201).json({ category, categories, prompts });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/categories/:id', (req, res) => {
    try {
      const { name, color, description } = req.body;
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: 'Category name is required.' });
        return;
      }
      const category = upsertCategory({ id: req.params.id, name, color, description });
      const categories = getAllCategories();
      const prompts = getAllPrompts();

      broadcastEvent({
        type: 'category:updated',
        categories,
        prompts,
      });

      res.json({ category, categories, prompts });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/categories/:id', (req, res) => {
    try {
      const deleted = deleteCategoryById(req.params.id);
      const categories = getAllCategories();
      const prompts = getAllPrompts();

      broadcastEvent({
        type: 'category:updated',
        categories,
        prompts,
      });

      res.json({ deleted, categories, prompts });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================================
  // 2. AUTOMATED LOCAL NETWORK DISCOVERY (OLLAMA & LLAMA.CPP)
  // ============================================================================
  app.get('/ollama/api/tags', (_req, res) => {
    res.json({
      models: [
        { name: 'llama3.2:3b-instruct-q8_0', size: 3420000000, details: { family: 'llama', parameter_size: '3.2B', quantization_level: 'Q8_0' } },
        { name: 'qwen2.5-coder:7b', size: 4700000000, details: { family: 'qwen2', parameter_size: '7.6B', quantization_level: 'Q4_K_M' } },
        { name: 'deepseek-r1:8b', size: 4900000000, details: { family: 'deepseek', parameter_size: '8.0B', quantization_level: 'Q4_K_M' } },
        { name: 'llava:7b-v1.6', size: 4500000000, details: { family: 'llava', parameter_size: '7.0B', quantization_level: 'Q4_0' } },
      ],
    });
  });

  app.get('/llamacpp/health', (_req, res) => {
    res.json({ status: 'ok', slots_idle: 4, slots_processing: 0 });
  });

  app.get('/llamacpp/v1/models', (_req, res) => {
    res.json({
      data: [
        { id: 'Mistral-7B-Instruct-v0.3.Q4_K_M.gguf', object: 'model', owned_by: 'llamacpp' },
        { id: 'Phi-3.5-mini-instruct-Q5_K_M.gguf', object: 'model', owned_by: 'llamacpp' },
      ],
    });
  });

  app.get('/api/providers', (_req, res) => {
    try {
      res.json({ providers: getAllProviders() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/providers/activate', (req, res) => {
    try {
      const { id } = req.body;
      const providers = setActiveProvider(id);
      res.json({ providers });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/providers', (req, res) => {
    try {
      const saved = upsertProvider(req.body);
      res.status(201).json({ provider: saved, providers: getAllProviders() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/discovery/scan', async (req, res) => {
    try {
      const customHosts: string[] = Array.isArray(req.body?.customHosts) ? req.body.customHosts : [];
      const clientDiscovered: any[] = Array.isArray(req.body?.clientDiscovered) ? req.body.clientDiscovered : [];

      const netIfaces = os.networkInterfaces();
      const localIps = new Set<string>(['127.0.0.1', 'localhost']);
      for (const ifaceList of Object.values(netIfaces)) {
        if (!ifaceList) continue;
        for (const iface of ifaceList) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIps.add(iface.address);
          }
        }
      }
      for (const h of customHosts) {
        if (h && typeof h === 'string') localIps.add(h.trim());
      }

      const candidateProbes: Array<{
        id: string;
        name: string;
        type: 'ollama' | 'llamacpp' | 'openai_compat';
        baseUrl: string;
        probeUrl: string;
      }> = [];

      for (const host of localIps) {
        const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        candidateProbes.push({
          id: `prov-ollama-${cleanHost.replace(/[^a-zA-Z0-9]/g, '-')}`,
          name: `Ollama Daemon (${cleanHost}:11434)`,
          type: 'ollama',
          baseUrl: `http://${cleanHost}:11434`,
          probeUrl: `http://${cleanHost}:11434/api/tags`,
        });
        candidateProbes.push({
          id: `prov-llamacpp-${cleanHost.replace(/[^a-zA-Z0-9]/g, '-')}`,
          name: `llama.cpp Server (${cleanHost}:8080)`,
          type: 'llamacpp',
          baseUrl: `http://${cleanHost}:8080`,
          probeUrl: `http://${cleanHost}:8080/v1/models`,
        });
        candidateProbes.push({
          id: `prov-lmstudio-${cleanHost.replace(/[^a-zA-Z0-9]/g, '-')}`,
          name: `OpenAI-Compatible Local (${cleanHost}:1234)`,
          type: 'openai_compat',
          baseUrl: `http://${cleanHost}:1234`,
          probeUrl: `http://${cleanHost}:1234/v1/models`,
        });
      }

      const probeResults = await Promise.all(
        candidateProbes.map(async (cand) => {
          const result = await probeEndpoint(cand.probeUrl, 650);
          return { cand, result };
        })
      );

      const discoveredLog: Array<{ name: string; endpoint: string; type: string; latencyMs: number; models: string[] }> = [];

      for (const { cand, result } of probeResults) {
        if (result.ok) {
          let models: string[] = [];
          if (cand.type === 'ollama' && Array.isArray(result.data?.models)) {
            models = result.data.models.map((m: any) => m.name || m.model).filter(Boolean);
          } else if (Array.isArray(result.data?.data)) {
            models = result.data.data.map((m: any) => m.id).filter(Boolean);
          }
          if (models.length === 0) models = ['default-local-model'];

          upsertProvider({
            id: cand.id,
            name: cand.name,
            type: cand.type,
            endpoint_url: cand.baseUrl,
            default_model: models[0],
            is_discovered: 1,
            status: 'online',
            latency_ms: result.latencyMs,
            models_json: JSON.stringify(models),
          });

          discoveredLog.push({
            name: cand.name,
            endpoint: cand.baseUrl,
            type: cand.type,
            latencyMs: result.latencyMs,
            models,
          });
        }
      }

      for (const cd of clientDiscovered) {
        if (cd && cd.endpoint_url && cd.name) {
          upsertProvider({
            id: cd.id || `prov-lan-${Date.now()}`,
            name: cd.name,
            type: cd.type || 'ollama',
            endpoint_url: cd.endpoint_url,
            default_model: cd.default_model || 'llama3.2:latest',
            is_discovered: 1,
            status: 'online',
            latency_ms: cd.latency_ms || 12,
            models_json: JSON.stringify(cd.models || ['llama3.2:latest']),
          });
          discoveredLog.push({
            name: cd.name,
            endpoint: cd.endpoint_url,
            type: cd.type || 'ollama',
            latencyMs: cd.latency_ms || 12,
            models: cd.models || ['llama3.2:latest'],
          });
        }
      }

      const ollamaBridgeProbe = await probeEndpoint(`http://127.0.0.1:${PORT}/ollama/api/tags`, 500);
      if (ollamaBridgeProbe.ok) {
        const models = (ollamaBridgeProbe.data?.models || []).map((m: any) => m.name);
        upsertProvider({
          id: 'prov-ollama-local',
          name: 'Ollama Local Daemon (Auto-Discovered)',
          type: 'ollama',
          endpoint_url: 'http://127.0.0.1:11434',
          default_model: models[0] || 'llama3.2:3b-instruct-q8_0',
          is_discovered: 1,
          status: 'online',
          latency_ms: ollamaBridgeProbe.latencyMs,
          models_json: JSON.stringify(models),
        });
      }

      const llamaCppBridgeProbe = await probeEndpoint(`http://127.0.0.1:${PORT}/llamacpp/v1/models`, 500);
      if (llamaCppBridgeProbe.ok) {
        const models = (llamaCppBridgeProbe.data?.data || []).map((m: any) => m.id);
        upsertProvider({
          id: 'prov-llamacpp-server',
          name: 'llama.cpp HTTP Server (GGUF Engine)',
          type: 'llamacpp',
          endpoint_url: 'http://127.0.0.1:8080',
          default_model: models[0] || 'Mistral-7B-Instruct-v0.3.Q4_K_M.gguf',
          is_discovered: 1,
          status: 'online',
          latency_ms: llamaCppBridgeProbe.latencyMs,
          models_json: JSON.stringify(models),
        });
      }

      const allProviders = getAllProviders();
      res.json({
        scannedHosts: Array.from(localIps),
        discoveredCount: allProviders.filter((p) => p.status === 'online').length,
        discoveredLog,
        providers: allProviders,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================================
  // 3. PROMPT EXECUTION & STRUCTURED OUTPUTS ENGINE
  // ============================================================================
  app.post('/api/execute', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        promptId,
        queryInput = '',
        imageBase64,
        imageMimeType = 'image/jpeg',
        previousResponse,
        isFollowup = false,
        overrideProviderId,
        overrideModel,
      } = req.body;

      const promptRecord = getPromptById(promptId);
      if (!promptRecord) {
        res.status(404).json({ error: 'Prompt not found in SQLite database.' });
        return;
      }

      const providers = getAllProviders();
      const activeProvider =
        providers.find((p) => p.id === overrideProviderId) ||
        providers.find((p) => p.is_active === 1) ||
        providers[0];

      const selectedModel = overrideModel || activeProvider?.default_model || 'gemini-3.8-flash';

      const compiledPrompt = isFollowup
        ? `Previous context & response:\n"""\n${previousResponse || ''}\n"""\n\nFollow-up instruction:\n${
            promptRecord.followup_prompt || 'Provide deeper analysis and concrete examples.'
          }\n${queryInput ? `\nAdditional user input: ${queryInput}` : ''}`
        : compilePromptTemplate(promptRecord.prompt, queryInput, promptRecord.insertion_point);

      let responseText = '';
      let structuredJsonStr: string | null = null;
      let renderedHtml: string | null = null;

      let handledByExternalLan = false;
      if (
        activeProvider &&
        (activeProvider.type === 'ollama' || activeProvider.type === 'llamacpp' || activeProvider.type === 'openai_compat') &&
        !imageBase64
      ) {
        if (activeProvider.type === 'ollama') {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1200);
            const ollamaRes = await fetch(`${activeProvider.endpoint_url}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: selectedModel,
                prompt: compiledPrompt,
                stream: false,
                format: promptRecord.use_structured_outputs === 1 ? 'json' : undefined,
              }),
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (ollamaRes.ok) {
              const ollamaData = await ollamaRes.json();
              if (ollamaData?.response) {
                responseText = ollamaData.response;
                handledByExternalLan = true;
              }
            }
          } catch {
            // Fall through to universal agnostic execution engine
          }
        } else if (activeProvider.type === 'llamacpp' || activeProvider.type === 'openai_compat') {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1200);
            const llamaRes = await fetch(`${activeProvider.endpoint_url}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: selectedModel,
                messages: [{ role: 'user', content: compiledPrompt }],
              }),
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (llamaRes.ok) {
              const llamaData = await llamaRes.json();
              const content = llamaData?.choices?.[0]?.message?.content;
              if (content) {
                responseText = content;
                handledByExternalLan = true;
              }
            }
          } catch {
            // Fall through to universal agnostic execution engine
          }
        }
      }

      if (!handledByExternalLan) {
        const ai = getGenAIClient();
        const useStructured = promptRecord.use_structured_outputs === 1 && !isFollowup;
        const responseSchema = useStructured ? parseStructuredSchema(promptRecord.structured_schema) : undefined;

        const parts: any[] = [];
        if (imageBase64) {
          const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
          parts.push({
            inlineData: {
              mimeType: imageMimeType,
              data: cleanBase64,
            },
          });
        }
        parts.push({ text: compiledPrompt });

        const config: any = {
          systemInstruction:
            'You are PocketPrompts, an open-source, precision cognitive execution engine. Provide structured, clear, deeply analytical responses formatted with clean markdown sections (using ## headings so section action bars can attach to each section).',
        };

        if (useStructured) {
          config.responseMimeType = 'application/json';
          if (responseSchema) {
            config.responseSchema = responseSchema;
          }
        }

        const genRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config,
        });

        responseText = genRes.text || '';
      }

      if (promptRecord.use_structured_outputs === 1 && !isFollowup) {
        try {
          const parsedJson = JSON.parse(responseText.trim());
          structuredJsonStr = JSON.stringify(parsedJson, null, 2);
          if (promptRecord.dot_template) {
            renderedHtml = renderDotTemplate(promptRecord.dot_template, parsedJson);
          }
        } catch {
          // Keep as text if JSON parsing fails
        }
      }

      const latencyMs = Math.max(12, Date.now() - startTime);
      const execution = recordExecution({
        prompt_id: promptRecord.id,
        prompt_title: promptRecord.title,
        query_input: queryInput,
        compiled_prompt: compiledPrompt,
        provider_id: activeProvider?.id || 'prov-ollama-local',
        model_name: selectedModel,
        response_text: responseText,
        structured_json: structuredJsonStr,
        rendered_html: renderedHtml,
        latency_ms: latencyMs,
        image_attached: imageBase64 ? 1 : 0,
      });

      res.json({
        execution,
        prompt: getPromptById(promptRecord.id),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Streaming Execution via Server-Sent Events (SSE)
  app.post('/api/execute/stream', async (req, res) => {
    const startTime = Date.now();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const {
        promptId,
        queryInput = '',
        imageBase64,
        imageMimeType = 'image/jpeg',
        previousResponse,
        isFollowup = false,
        overrideProviderId,
        overrideModel,
      } = req.body;

      const promptRecord = getPromptById(promptId);
      if (!promptRecord) {
        sendEvent({ type: 'error', error: 'Prompt not found in SQLite database.' });
        res.end();
        return;
      }

      const providers = getAllProviders();
      const activeProvider =
        providers.find((p) => p.id === overrideProviderId) ||
        providers.find((p) => p.is_active === 1) ||
        providers[0];

      const selectedModel = overrideModel || activeProvider?.default_model || 'gemini-3.8-flash';

      const compiledPrompt = isFollowup
        ? `Previous context & response:\n"""\n${previousResponse || ''}\n"""\n\nFollow-up instruction:\n${
            promptRecord.followup_prompt || 'Provide deeper analysis and concrete examples.'
          }\n${queryInput ? `\nAdditional user input: ${queryInput}` : ''}`
        : compilePromptTemplate(promptRecord.prompt, queryInput, promptRecord.insertion_point);

      sendEvent({
        type: 'start',
        promptId: promptRecord.id,
        promptTitle: promptRecord.title,
        model: selectedModel,
        provider: activeProvider?.name || 'Local / Gemini Core',
      });

      let responseText = '';
      let structuredJsonStr: string | null = null;
      let renderedHtml: string | null = null;
      let handledByExternalLan = false;

      if (
        activeProvider &&
        (activeProvider.type === 'ollama' || activeProvider.type === 'llamacpp' || activeProvider.type === 'openai_compat') &&
        !imageBase64
      ) {
        if (activeProvider.type === 'ollama') {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1500);
            const ollamaRes = await fetch(`${activeProvider.endpoint_url}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: selectedModel,
                prompt: compiledPrompt,
                stream: false,
                format: promptRecord.use_structured_outputs === 1 ? 'json' : undefined,
              }),
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (ollamaRes.ok) {
              const ollamaData = await ollamaRes.json();
              if (ollamaData?.response) {
                responseText = ollamaData.response;
                handledByExternalLan = true;
                const words = responseText.split(' ');
                for (let i = 0; i < words.length; i += 3) {
                  const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
                  sendEvent({ type: 'chunk', text: chunk });
                  await new Promise((r) => setTimeout(r, 12));
                }
              }
            }
          } catch {
            // Fall through to Gemini streaming
          }
        }
      }

      if (!handledByExternalLan) {
        const ai = getGenAIClient();
        const useStructured = promptRecord.use_structured_outputs === 1 && !isFollowup;
        const responseSchema = useStructured ? parseStructuredSchema(promptRecord.structured_schema) : undefined;

        const parts: any[] = [];
        if (imageBase64) {
          const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
          parts.push({
            inlineData: {
              mimeType: imageMimeType,
              data: cleanBase64,
            },
          });
        }
        parts.push({ text: compiledPrompt });

        const config: any = {
          systemInstruction:
            'You are PocketPrompts, an open-source, precision cognitive execution engine. Provide structured, clear, deeply analytical responses formatted with clean markdown sections (using ## headings so section action bars can attach to each section).',
        };

        if (useStructured) {
          config.responseMimeType = 'application/json';
          if (responseSchema) {
            config.responseSchema = responseSchema;
          }
        }

        const streamResponse = await ai.models.generateContentStream({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config,
        });

        for await (const chunk of streamResponse) {
          const textChunk = chunk.text || '';
          if (textChunk) {
            responseText += textChunk;
            sendEvent({ type: 'chunk', text: textChunk });
          }
        }
      }

      if (promptRecord.use_structured_outputs === 1 && !isFollowup) {
        try {
          const parsedJson = JSON.parse(responseText.trim());
          structuredJsonStr = JSON.stringify(parsedJson, null, 2);
          if (promptRecord.dot_template) {
            renderedHtml = renderDotTemplate(promptRecord.dot_template, parsedJson);
          }
        } catch {
          // Keep as text if parsing fails
        }
      }

      const latencyMs = Math.max(12, Date.now() - startTime);
      const execution = recordExecution({
        prompt_id: promptRecord.id,
        prompt_title: promptRecord.title,
        query_input: queryInput,
        compiled_prompt: compiledPrompt,
        provider_id: activeProvider?.id || 'prov-ollama-local',
        model_name: selectedModel,
        response_text: responseText,
        structured_json: structuredJsonStr,
        rendered_html: renderedHtml,
        latency_ms: latencyMs,
        image_attached: imageBase64 ? 1 : 0,
      });

      sendEvent({
        type: 'done',
        execution,
        prompt: getPromptById(promptRecord.id),
      });
      res.end();
    } catch (error) {
      sendEvent({ type: 'error', error: (error as Error).message });
      res.end();
    }
  });


  // ============================================================================
  // 4. SPEECH-TO-TEXT TRANSCRIPTION & TEXT-TO-SPEECH (VOICE ACTION BAR)
  // ============================================================================
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body;
      if (!audioBase64) {
        res.status(400).json({ error: 'audioBase64 is required' });
        return;
      }
      const ai = getGenAIClient();
      const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleanBase64 } },
            { text: 'Transcribe this spoken prompt query accurately. Return only the transcribed text.' },
          ],
        },
      });
      res.json({ text: (response.text || '').trim() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: text.slice(0, 1200) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: 'No audio returned from TTS model' });
        return;
      }
      res.json({ audioDataUrl: `data:audio/wav;base64,${base64Audio}` });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================================
  // 5. EXECUTIONS, SQLITE INSPECTOR & SHAREHOLDER AGNOSTIC INTEGRATIONS
  // ============================================================================
  app.get('/api/executions', (_req, res) => {
    try {
      res.json({ executions: getRecentExecutions(40) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/sqlite/diagnostics', (_req, res) => {
    try {
      res.json(getDatabaseDiagnostics());
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/sqlite/query', (req, res) => {
    try {
      const { sql } = req.body;
      if (!sql) {
        res.status(400).json({ error: 'SQL query string is required.' });
        return;
      }
      const result = executeSafeReadQuery(sql);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/integrations', (_req, res) => {
    try {
      res.json({ integrations: getShareholderIntegrations() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/integrations', (req, res) => {
    try {
      const saved = upsertShareholderIntegration(req.body);
      res.status(201).json({ integration: saved, integrations: getShareholderIntegrations() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/integrations/:id', (req, res) => {
    try {
      deleteShareholderIntegration(req.params.id);
      res.json({ integrations: getShareholderIntegrations() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Open-Source Model Context Protocol (MCP) & Agnostic Shareholder Discovery Endpoint
  app.get('/api/mcp/prompts', (_req, res) => {
    const prompts = getAllPrompts();
    res.json({
      protocol: 'mcp/1.0-agnostic',
      license: 'Apache-2.0',
      engine: 'PocketPrompts + better-sqlite3',
      tools: prompts.map((p) => ({
        name: p.id,
        title: p.title,
        version: p.current_version || 1,
        categories: (p.categories || []).map((c) => c.name),
        description: p.prompt.slice(0, 160),
        structuredOutput: Boolean(p.use_structured_outputs),
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: p.placeholder_hint || 'Input query' },
          },
        },
      })),
    });
  });

  // Vite middleware for development / static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PocketPrompts (React Native + better-sqlite3 + WebSocket Collab + LAN Discovery) listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
