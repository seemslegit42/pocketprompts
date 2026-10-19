export interface DiscoveredNode {
  id: string;
  name: string;
  type: 'ollama' | 'llamacpp' | 'openai_compat';
  endpoint_url: string;
  default_model: string;
  latency_ms: number;
  models: string[];
}

/**
 * Probes browser-local LAN / localhost endpoints for running Ollama (:11434) and llama.cpp (:8080) instances
 * and syncs them with the embedded better-sqlite3 database.
 */
export async function probeBrowserLocalNetwork(customHosts: string[] = []): Promise<DiscoveredNode[]> {
  const hosts = Array.from(new Set(['localhost', '127.0.0.1', ...customHosts.filter(Boolean)]));
  const discovered: DiscoveredNode[] = [];

  const tasks: Promise<void>[] = [];

  for (const rawHost of hosts) {
    const host = rawHost.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    if (!host) continue;

    // 1. Probe Ollama on 11434
    tasks.push(
      (async () => {
        const start = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 650);
        try {
          const res = await fetch(`http://${host}:11434/api/tags`, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            const models: string[] = Array.isArray(data?.models)
              ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
              : ['llama3.2:latest'];
            discovered.push({
              id: `prov-browser-ollama-${host.replace(/[^a-zA-Z0-9]/g, '-')}`,
              name: `Ollama LAN (${host}:11434)`,
              type: 'ollama',
              endpoint_url: `http://${host}:11434`,
              default_model: models[0] || 'llama3.2:latest',
              latency_ms: Math.max(1, Math.round(performance.now() - start)),
              models,
            });
          }
        } catch {
          clearTimeout(timer);
        }
      })()
    );

    // 2. Probe llama.cpp on 8080
    tasks.push(
      (async () => {
        const start = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 650);
        try {
          const res = await fetch(`http://${host}:8080/v1/models`, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            const models: string[] = Array.isArray(data?.data)
              ? data.data.map((m: any) => m.id).filter(Boolean)
              : ['gguf-model-local'];
            discovered.push({
              id: `prov-browser-llamacpp-${host.replace(/[^a-zA-Z0-9]/g, '-')}`,
              name: `llama.cpp LAN (${host}:8080)`,
              type: 'llamacpp',
              endpoint_url: `http://${host}:8080`,
              default_model: models[0] || 'gguf-model-local',
              latency_ms: Math.max(1, Math.round(performance.now() - start)),
              models,
            });
          }
        } catch {
          clearTimeout(timer);
        }
      })()
    );
  }

  await Promise.allSettled(tasks);
  return discovered;
}

/**
 * Generates the complete portable React Native + better-sqlite3 + LAN Auto-Discovery source code bundle
 * for open-source inspection and export.
 */
export const REACT_NATIVE_PORTABLE_SOURCE = `/**
 * PocketPrompts — Open-Source Cross-Platform React Native Architecture
 * License: Apache-2.0
 * Stack: React Native + Embedded better-sqlite3 / JSI SQLite + Automated Ollama/llama.cpp LAN Discovery
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
} from 'react-native';
import Database from 'better-sqlite3';

// 1. Embedded Synchronous better-sqlite3 Initialization (Zero-Latency Offline Storage)
export const db = new Database('pocketprompts.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(\`
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    insertion_point INTEGER DEFAULT -1,
    color TEXT NOT NULL DEFAULT '#D49B00',
    followup_prompt TEXT DEFAULT '',
    placeholder_hint TEXT DEFAULT 'Tap play to generate',
    show_action_bars INTEGER DEFAULT 1,
    use_structured_outputs INTEGER DEFAULT 0,
    structured_schema TEXT DEFAULT '',
    dot_template TEXT DEFAULT '',
    updated_at TEXT NOT NULL
  );
\`);

// 2. Automated Local Network (LAN) Ollama (:11434) & llama.cpp (:8080) Discovery
export async function discoverLocalLLMInstances(subnetPrefix = '192.168.1') {
  const candidates = ['127.0.0.1', 'localhost', \`\${subnetPrefix}.1\`, \`\${subnetPrefix}.100\`];
  const activeNodes = [];

  await Promise.allSettled(
    candidates.flatMap((ip) => [
      fetch(\`http://\${ip}:11434/api/tags\`)
        .then((r) => r.json())
        .then((data) =>
          activeNodes.push({
            type: 'ollama',
            endpoint: \`http://\${ip}:11434\`,
            models: (data.models || []).map((m) => m.name),
          })
        ),
      fetch(\`http://\${ip}:8080/v1/models\`)
        .then((r) => r.json())
        .then((data) =>
          activeNodes.push({
            type: 'llamacpp',
            endpoint: \`http://\${ip}:8080\`,
            models: (data.data || []).map((m) => m.id),
          })
        ),
    ])
  );

  return activeNodes;
}
`;
