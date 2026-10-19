import path from 'node:path';
import fs from 'node:fs';
import Database from './better-sqlite3.ts';

const DB_PATH = path.resolve(process.cwd(), 'data', 'pocketprompts.db');
const db = new Database(DB_PATH);

// Configure high-performance embedded SQLite settings
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

export interface CategoryRecord {
  id: string;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface PromptVersionRecord {
  id: string;
  prompt_id: string;
  version_number: number;
  title: string;
  prompt: string;
  insertion_point: number;
  color: string;
  followup_prompt: string;
  placeholder_hint: string;
  show_action_bars: number;
  use_structured_outputs: number;
  structured_schema: string;
  dot_template: string;
  categories_json: string;
  commit_message: string;
  author_name: string;
  created_at: string;
}

export interface PromptRecord {
  id: string;
  title: string;
  prompt: string;
  insertion_point: number;
  color: string;
  followup_prompt: string;
  placeholder_hint: string;
  show_action_bars: number;
  use_structured_outputs: number;
  structured_schema: string;
  dot_template: string;
  category: string;
  categories?: CategoryRecord[];
  category_ids?: string[];
  current_version?: number;
  is_pinned: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderRecord {
  id: string;
  name: string;
  type: 'ollama' | 'llamacpp' | 'openai_compat' | 'webhook' | 'gemini_engine';
  endpoint_url: string;
  default_model: string;
  is_active: number;
  is_discovered: number;
  status: 'online' | 'offline' | 'standby';
  latency_ms: number;
  models_json: string;
  last_checked_at: string;
}

export interface ExecutionRecord {
  id: string;
  prompt_id: string;
  prompt_title: string;
  query_input: string;
  compiled_prompt: string;
  provider_id: string;
  model_name: string;
  response_text: string;
  structured_json: string | null;
  rendered_html: string | null;
  latency_ms: number;
  image_attached: number;
  created_at: string;
}

export interface ShareholderIntegrationRecord {
  id: string;
  name: string;
  stakeholder_role: string;
  protocol: 'rest_webhook' | 'openai_bridge' | 'mcp_jsonrpc' | 'csv_audit';
  endpoint_url: string;
  auth_header: string;
  auto_forward: number;
  created_at: string;
}

export function initializeDatabase(): void {
  db.exec(`
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
      category TEXT DEFAULT 'General',
      is_pinned INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#F2A7A0',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_categories (
      prompt_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (prompt_id, category_id),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
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
      categories_json TEXT DEFAULT '[]',
      commit_message TEXT DEFAULT 'Saved version',
      author_name TEXT DEFAULT 'Local Engineer',
      created_at TEXT NOT NULL,
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      default_model TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      is_discovered INTEGER DEFAULT 0,
      status TEXT DEFAULT 'standby',
      latency_ms INTEGER DEFAULT 0,
      models_json TEXT DEFAULT '[]',
      last_checked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      prompt_title TEXT NOT NULL,
      query_input TEXT NOT NULL,
      compiled_prompt TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      response_text TEXT NOT NULL,
      structured_json TEXT,
      rendered_html TEXT,
      latency_ms INTEGER DEFAULT 0,
      image_attached INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shareholder_integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stakeholder_role TEXT NOT NULL,
      protocol TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      auth_header TEXT DEFAULT '',
      auto_forward INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const countRow = db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM prompts').get();
  if (!countRow || countRow.count === 0) {
    seedInitialData();
  }

  ensureCategoriesAndVersionsBackfilled();
}

function seedInitialData(): void {
  const now = new Date().toISOString();

  const insertPrompt = db.prepare(`
    INSERT INTO prompts (
      id, title, prompt, insertion_point, color, followup_prompt,
      placeholder_hint, show_action_bars, use_structured_outputs,
      structured_schema, dot_template, category, is_pinned, usage_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialPrompts: PromptRecord[] = [
    {
      id: 'prompt-ai-employment',
      title: 'Impact of AI on employment',
      prompt:
        'Analyze the structural impact of artificial intelligence and autonomous agent workflows on employment across knowledge work, manufacturing, and creative sectors.\n\nFocus context or specific industry query:\n{{query}}\n\nProvide:\n1. Near-term task displacement vs. augmentation dynamics (12-36 months)\n2. Emerging high-leverage human roles\n3. Quantitative productivity & wage elasticity observations',
      insertion_point: 196,
      color: '#D49B00',
      followup_prompt:
        'Provide 3 concrete workforce transition strategies and policy recommendations for organizations adapting to this shift, including measurable upskilling milestones.',
      placeholder_hint: 'Tap play to generate',
      show_action_bars: 1,
      use_structured_outputs: 0,
      structured_schema: '',
      dot_template: '',
      category: 'Economics & Policy',
      is_pinned: 1,
      usage_count: 14,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'prompt-structured-brief',
      title: 'Executive Risk & Stakeholder Matrix',
      prompt:
        'Evaluate the following technical or operational initiative for multi-stakeholder alignment, risks, and measurable KPIs:\n\n{{query}}\n\nReturn a structured assessment covering executive summary, risk level, key stakeholder impacts, and actionable mitigation steps.',
      insertion_point: 123,
      color: '#3EB991',
      followup_prompt:
        'Expand on the highest-severity risk identified above and draft a contingency protocol with clear rollback triggers.',
      placeholder_hint: 'Enter project proposal, architecture change, or quarterly target...',
      show_action_bars: 1,
      use_structured_outputs: 1,
      structured_schema: JSON.stringify(
        {
          type: 'OBJECT',
          properties: {
            initiativeTitle: { type: 'STRING', description: 'Concise title of the analyzed initiative' },
            overallRiskLevel: { type: 'STRING', description: 'LOW, MODERATE, or HIGH' },
            confidenceScore: { type: 'NUMBER', description: 'Confidence score from 0 to 100' },
            executiveSummary: { type: 'STRING', description: '2-3 sentence synthesis for shareholders' },
            stakeholderImpacts: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  group: { type: 'STRING' },
                  impact: { type: 'STRING' },
                  metric: { type: 'STRING' },
                },
              },
            },
            actionItems: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
          },
          required: [
            'initiativeTitle',
            'overallRiskLevel',
            'confidenceScore',
            'executiveSummary',
            'stakeholderImpacts',
            'actionItems',
          ],
        },
        null,
        2
      ),
      dot_template: `<div class="pp-structured-card">
  <div class="pp-sc-header">
    <span class="pp-sc-title">{{=it.initiativeTitle}}</span>
    <span class="pp-sc-badge">{{=it.overallRiskLevel}} RISK · {{=it.confidenceScore}}% CONFIDENCE</span>
  </div>
  <p class="pp-sc-summary">{{=it.executiveSummary}}</p>
  <div class="pp-sc-grid">
    {{~it.stakeholderImpacts :item:index}}
    <div class="pp-sc-item">
      <div class="pp-sc-group">{{=item.group}}</div>
      <div class="pp-sc-impact">{{=item.impact}}</div>
      <div class="pp-sc-metric">KPI: {{=item.metric}}</div>
    </div>
    {{~}}
  </div>
  <div class="pp-sc-actions">
    <div class="pp-sc-actions-title">Recommended Actions</div>
    <ul>
      {{~it.actionItems :act:idx}}
      <li>{{=act}}</li>
      {{~}}
    </ul>
  </div>
</div>`,
      category: 'Structured Outputs',
      is_pinned: 1,
      usage_count: 9,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'prompt-point-query-inspector',
      title: 'Point & Query: Visual Spec Extractor',
      prompt:
        'Examine the captured visual frame in detail. Identify all visible hardware components, text labels, diagrams, or structural anomalies.\n\nUser visual query focus:\n{{query}}\n\nProvide a clear breakdown of what is shown, transcribed labels/metrics, and immediate diagnostic or contextual insights.',
      insertion_point: 162,
      color: '#F2A7A0',
      followup_prompt:
        'Generate a troubleshooting checklist or bill-of-materials table based on the visual elements identified.',
      placeholder_hint: 'Ask about the object, document, or circuit in view...',
      show_action_bars: 1,
      use_structured_outputs: 0,
      structured_schema: '',
      dot_template: '',
      category: 'Point & Query',
      is_pinned: 1,
      usage_count: 7,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'prompt-solid-audit',
      title: 'SOLID & Clean Architecture Refactor',
      prompt:
        'Perform a rigorous senior engineering review of the following code or system design against SOLID principles (SRP, OCP, LSP, ISP, DIP), DRY, and security best practices:\n\n{{query}}\n\nList specific architectural violations, complexity bottlenecks, and provide a clean, refactored implementation.',
      insertion_point: 171,
      color: '#20B2AA',
      followup_prompt:
        'Write a comprehensive unit test suite covering happy paths, boundary conditions, and failure modes for the refactored code.',
      placeholder_hint: 'Paste code snippet or describe module responsibilities...',
      show_action_bars: 1,
      use_structured_outputs: 0,
      structured_schema: '',
      dot_template: '',
      category: 'Engineering',
      is_pinned: 0,
      usage_count: 5,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'prompt-local-llm-benchmark',
      title: 'Local Model Reasoning Benchmark',
      prompt:
        'Solve the following logic, math, or systems synthesis prompt step-by-step with zero fluff and explicit verification:\n\n{{query}}\n\nConclude with a self-verification check of all assumptions.',
      insertion_point: 118,
      color: '#6A0DAD',
      followup_prompt:
        'Verify the edge cases of the solution above and provide a more compact formulation.',
      placeholder_hint: 'Enter logic puzzle, SQL optimization, or systems question...',
      show_action_bars: 1,
      use_structured_outputs: 0,
      structured_schema: '',
      dot_template: '',
      category: 'Benchmarks',
      is_pinned: 0,
      usage_count: 3,
      created_at: now,
      updated_at: now,
    },
  ];

  const insertManyPrompts = db.transaction((items: PromptRecord[]) => {
    for (const p of items) {
      insertPrompt.run(
        p.id,
        p.title,
        p.prompt,
        p.insertion_point,
        p.color,
        p.followup_prompt,
        p.placeholder_hint,
        p.show_action_bars,
        p.use_structured_outputs,
        p.structured_schema,
        p.dot_template,
        p.category,
        p.is_pinned,
        p.usage_count,
        p.created_at,
        p.updated_at
      );
    }
  });
  insertManyPrompts(initialPrompts);

  // Seed default agnostic providers
  const insertProvider = db.prepare(`
    INSERT INTO providers (
      id, name, type, endpoint_url, default_model, is_active, is_discovered,
      status, latency_ms, models_json, last_checked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialProviders: ProviderRecord[] = [
    {
      id: 'prov-ollama-local',
      name: 'Ollama Local Daemon (Auto-Discovered)',
      type: 'ollama',
      endpoint_url: 'http://127.0.0.1:11434',
      default_model: 'llama3.2:3b-instruct-q8_0',
      is_active: 1,
      is_discovered: 1,
      status: 'online',
      latency_ms: 14,
      models_json: JSON.stringify([
        'llama3.2:3b-instruct-q8_0',
        'qwen2.5-coder:7b',
        'deepseek-r1:8b',
        'llava:7b-v1.6',
      ]),
      last_checked_at: now,
    },
    {
      id: 'prov-llamacpp-server',
      name: 'llama.cpp HTTP Server (GGUF Engine)',
      type: 'llamacpp',
      endpoint_url: 'http://127.0.0.1:8080',
      default_model: 'Mistral-7B-Instruct-v0.3.Q4_K_M.gguf',
      is_active: 0,
      is_discovered: 1,
      status: 'online',
      latency_ms: 9,
      models_json: JSON.stringify([
        'Mistral-7B-Instruct-v0.3.Q4_K_M.gguf',
        'Phi-3.5-mini-instruct-Q5_K_M.gguf',
      ]),
      last_checked_at: now,
    },
    {
      id: 'prov-gemini-bridge',
      name: 'Universal Agnostic Bridge (Gemini 3.8 Flash)',
      type: 'gemini_engine',
      endpoint_url: '/api/execute',
      default_model: 'gemini-3.8-flash',
      is_active: 0,
      is_discovered: 0,
      status: 'online',
      latency_ms: 42,
      models_json: JSON.stringify(['gemini-3.8-flash', 'gemini-3.1-flash-lite']),
      last_checked_at: now,
    },
  ];

  for (const prov of initialProviders) {
    insertProvider.run(
      prov.id,
      prov.name,
      prov.type,
      prov.endpoint_url,
      prov.default_model,
      prov.is_active,
      prov.is_discovered,
      prov.status,
      prov.latency_ms,
      prov.models_json,
      prov.last_checked_at
    );
  }

  // Seed default agnostic shareholder integrations
  const insertIntegration = db.prepare(`
    INSERT INTO shareholder_integrations (
      id, name, stakeholder_role, protocol, endpoint_url, auth_header, auto_forward, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertIntegration.run(
    'int-exec-webhook',
    'Executive Governance Digest Sink',
    'Board & Product Stakeholders',
    'rest_webhook',
    'https://api.example-org.internal/v1/webhooks/prompt-artifacts',
    'Bearer oas_live_agnostic_token',
    0,
    now
  );
  insertIntegration.run(
    'int-mcp-bridge',
    'Open-Source MCP Tool Registry',
    'Engineering & Local Agent Mesh',
    'mcp_jsonrpc',
    'http://127.0.0.1:3000/api/mcp/prompts',
    '',
    1,
    now
  );
}

/**
 * Ensures categories, multi-category mappings, and version history records exist even on pre-existing DB files.
 */
function ensureCategoriesAndVersionsBackfilled(): void {
  const now = new Date().toISOString();
  const catCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM categories').get()?.c ?? 0;

  if (catCount === 0) {
    const seedCats: CategoryRecord[] = [
      {
        id: 'cat-economics',
        name: 'Economics & Policy',
        color: '#D49B00',
        description: 'Macroeconomic, labor market, and institutional policy analysis',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cat-structured',
        name: 'Structured Outputs',
        color: '#3EB991',
        description: 'JSON Schema + DoT.js deterministic visual templates',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cat-vision',
        name: 'Point & Query',
        color: '#F2A7A0',
        description: 'Multimodal camera frame & hardware diagnostic prompts',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cat-engineering',
        name: 'Engineering',
        color: '#20B2AA',
        description: 'SOLID architecture, code reviews, and automated test suites',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cat-benchmarks',
        name: 'Benchmarks',
        color: '#6A0DAD',
        description: 'Local Ollama & llama.cpp reasoning and latency evaluations',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'cat-executive',
        name: 'Shareholder Briefs',
        color: '#FFD700',
        description: 'Cross-functional governance and stakeholder reporting',
        created_at: now,
        updated_at: now,
      },
    ];

    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO categories (id, name, color, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertJunction = db.prepare(`
      INSERT OR IGNORE INTO prompt_categories (prompt_id, category_id)
      VALUES (?, ?)
    `);

    for (const c of seedCats) {
      insertCat.run(c.id, c.name, c.color, c.description, c.created_at, c.updated_at);
    }

    // Assign multiple categories to initial prompts to showcase multi-category filtering
    const mappings: Array<[string, string[]]> = [
      ['prompt-ai-employment', ['cat-economics', 'cat-executive']],
      ['prompt-structured-brief', ['cat-structured', 'cat-executive', 'cat-economics']],
      ['prompt-point-query-inspector', ['cat-vision', 'cat-engineering']],
      ['prompt-solid-audit', ['cat-engineering', 'cat-structured']],
      ['prompt-local-llm-benchmark', ['cat-benchmarks', 'cat-engineering']],
    ];

    for (const [promptId, catIds] of mappings) {
      const exists = db.prepare<[string], { id: string }>('SELECT id FROM prompts WHERE id = ?').get(promptId);
      if (exists) {
        for (const cId of catIds) {
          insertJunction.run(promptId, cId);
        }
      }
    }
  }

  // Ensure every prompt has at least v1 in prompt_versions
  const allPrompts = db.prepare<[], PromptRecord>('SELECT * FROM prompts').all();
  const countVersionsStmt = db.prepare<[string], { c: number }>(
    'SELECT COUNT(*) as c FROM prompt_versions WHERE prompt_id = ?'
  );
  const insertVersionStmt = db.prepare(`
    INSERT INTO prompt_versions (
      id, prompt_id, version_number, title, prompt, insertion_point, color,
      followup_prompt, placeholder_hint, show_action_bars, use_structured_outputs,
      structured_schema, dot_template, categories_json, commit_message, author_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of allPrompts) {
    const vCount = countVersionsStmt.get(p.id)?.c ?? 0;
    if (vCount === 0) {
      const cats = getCategoriesForPrompt(p.id);
      const catNames = cats.map((c) => c.name);
      if (p.id === 'prompt-ai-employment') {
        // Seed v1 (initial draft) and v2 (refined production version) so version diff & revert is immediately demonstrable
        const earlierTime = new Date(Date.now() - 1000 * 60 * 45).toISOString();
        insertVersionStmt.run(
          `ver-${p.id}-1`,
          p.id,
          1,
          'Impact of AI on employment (Initial Draft)',
          'Summarize how AI affects employment across major industries.\n\nQuery:\n{{query}}',
          68,
          '#D49B00',
          'Suggest 2 policy responses.',
          'Tap play to generate',
          1,
          0,
          '',
          '',
          JSON.stringify(catNames),
          'Initial baseline prompt template',
          'A. Rivera (Lead Architect)',
          earlierTime
        );
        insertVersionStmt.run(
          `ver-${p.id}-2`,
          p.id,
          2,
          p.title,
          p.prompt,
          p.insertion_point,
          p.color,
          p.followup_prompt,
          p.placeholder_hint,
          p.show_action_bars,
          p.use_structured_outputs,
          p.structured_schema,
          p.dot_template,
          JSON.stringify(catNames),
          'Added 3-part quantitative framework & workforce transition follow-up',
          'M. Chen (Policy Strategist)',
          now
        );
      } else {
        insertVersionStmt.run(
          `ver-${p.id}-1`,
          p.id,
          1,
          p.title,
          p.prompt,
          p.insertion_point,
          p.color,
          p.followup_prompt,
          p.placeholder_hint,
          p.show_action_bars,
          p.use_structured_outputs,
          p.structured_schema,
          p.dot_template,
          JSON.stringify(catNames),
          'Initial version committed to SQLite',
          'System Seed',
          now
        );
      }
    }
  }
}

export function getAllCategories(): Array<CategoryRecord & { prompt_count: number }> {
  return db
    .prepare<[], CategoryRecord & { prompt_count: number }>(`
      SELECT c.*, COUNT(pc.prompt_id) as prompt_count
      FROM categories c
      LEFT JOIN prompt_categories pc ON c.id = pc.category_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `)
    .all();
}

export function getCategoriesForPrompt(promptId: string): CategoryRecord[] {
  return db
    .prepare<[string], CategoryRecord>(`
      SELECT c.*
      FROM categories c
      INNER JOIN prompt_categories pc ON c.id = pc.category_id
      WHERE pc.prompt_id = ?
      ORDER BY c.name ASC
    `)
    .all(promptId);
}

export function upsertCategory(input: {
  id?: string;
  name: string;
  color?: string;
  description?: string;
}): CategoryRecord {
  const now = new Date().toISOString();
  const id = input.id || `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const existing = db.prepare<[string], CategoryRecord>('SELECT * FROM categories WHERE id = ?').get(id);

  if (existing) {
    db.prepare(`
      UPDATE categories
      SET name = ?, color = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name.trim(),
      input.color || existing.color,
      input.description ?? existing.description,
      now,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO categories (id, name, color, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name.trim(),
      input.color || '#F2A7A0',
      input.description || '',
      now,
      now
    );
  }

  return db.prepare<[string], CategoryRecord>('SELECT * FROM categories WHERE id = ?').get(id)!;
}

export function deleteCategoryById(id: string): boolean {
  const res = db.prepare<[string]>('DELETE FROM categories WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

function enrichPromptRecord(p: PromptRecord): PromptRecord {
  const cats = getCategoriesForPrompt(p.id);
  const latestVer =
    db
      .prepare<[string], { max_v: number }>(
        'SELECT MAX(version_number) as max_v FROM prompt_versions WHERE prompt_id = ?'
      )
      .get(p.id)?.max_v || 1;

  return {
    ...p,
    categories: cats,
    category_ids: cats.map((c) => c.id),
    category: cats.length > 0 ? cats.map((c) => c.name).join(', ') : p.category || 'General',
    current_version: latestVer,
  };
}

export function getAllPrompts(): PromptRecord[] {
  const rows = db
    .prepare<[], PromptRecord>('SELECT * FROM prompts ORDER BY is_pinned DESC, updated_at DESC')
    .all();
  return rows.map(enrichPromptRecord);
}

export function getPromptById(id: string): PromptRecord | undefined {
  const row = db.prepare<[string], PromptRecord>('SELECT * FROM prompts WHERE id = ?').get(id);
  return row ? enrichPromptRecord(row) : undefined;
}

export function getPromptVersions(promptId: string): PromptVersionRecord[] {
  return db
    .prepare<[string], PromptVersionRecord>(
      'SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version_number DESC'
    )
    .all(promptId);
}

export function upsertPrompt(
  input: Partial<PromptRecord> & {
    title: string;
    prompt: string;
    category_ids?: string[];
    commit_message?: string;
    author_name?: string;
  }
): PromptRecord {
  const now = new Date().toISOString();
  const id = input.id || `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const existing = db.prepare<[string], PromptRecord>('SELECT * FROM prompts WHERE id = ?').get(id);

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE prompts SET
          title = ?,
          prompt = ?,
          insertion_point = ?,
          color = ?,
          followup_prompt = ?,
          placeholder_hint = ?,
          show_action_bars = ?,
          use_structured_outputs = ?,
          structured_schema = ?,
          dot_template = ?,
          category = ?,
          is_pinned = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        input.title,
        input.prompt,
        input.insertion_point ?? existing.insertion_point,
        input.color ?? existing.color,
        input.followup_prompt ?? existing.followup_prompt,
        input.placeholder_hint ?? existing.placeholder_hint,
        input.show_action_bars !== undefined ? Number(Boolean(input.show_action_bars)) : existing.show_action_bars,
        input.use_structured_outputs !== undefined
          ? Number(Boolean(input.use_structured_outputs))
          : existing.use_structured_outputs,
        input.structured_schema ?? existing.structured_schema,
        input.dot_template ?? existing.dot_template,
        input.category ?? existing.category,
        input.is_pinned !== undefined ? Number(Boolean(input.is_pinned)) : existing.is_pinned,
        now,
        id
      );
    } else {
      db.prepare(`
        INSERT INTO prompts (
          id, title, prompt, insertion_point, color, followup_prompt,
          placeholder_hint, show_action_bars, use_structured_outputs,
          structured_schema, dot_template, category, is_pinned, usage_count,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        id,
        input.title,
        input.prompt,
        input.insertion_point ?? -1,
        input.color ?? '#D49B00',
        input.followup_prompt ?? '',
        input.placeholder_hint ?? 'Tap play to generate',
        input.show_action_bars !== undefined ? Number(Boolean(input.show_action_bars)) : 1,
        input.use_structured_outputs !== undefined ? Number(Boolean(input.use_structured_outputs)) : 0,
        input.structured_schema ?? '',
        input.dot_template ?? '',
        input.category ?? 'General',
        input.is_pinned !== undefined ? Number(Boolean(input.is_pinned)) : 0,
        now,
        now
      );
    }

    // Update multi-category junction table if category_ids provided
    if (Array.isArray(input.category_ids)) {
      db.prepare<[string]>('DELETE FROM prompt_categories WHERE prompt_id = ?').run(id);
      const insertLink = db.prepare(
        'INSERT OR IGNORE INTO prompt_categories (prompt_id, category_id) VALUES (?, ?)'
      );
      for (const catId of input.category_ids) {
        insertLink.run(id, catId);
      }
      const assignedCats = getCategoriesForPrompt(id);
      if (assignedCats.length > 0) {
        db.prepare<[string, string]>('UPDATE prompts SET category = ? WHERE id = ?').run(
          assignedCats.map((c) => c.name).join(', '),
          id
        );
      }
    }

    // Create a new immutable version record in prompt_versions
    const updatedRow = db.prepare<[string], PromptRecord>('SELECT * FROM prompts WHERE id = ?').get(id)!;
    const assignedCats = getCategoriesForPrompt(id);
    const maxVersionRow = db
      .prepare<[string], { max_v: number | null }>(
        'SELECT MAX(version_number) as max_v FROM prompt_versions WHERE prompt_id = ?'
      )
      .get(id);
    const nextVersion = (maxVersionRow?.max_v || 0) + 1;

    db.prepare(`
      INSERT INTO prompt_versions (
        id, prompt_id, version_number, title, prompt, insertion_point, color,
        followup_prompt, placeholder_hint, show_action_bars, use_structured_outputs,
        structured_schema, dot_template, categories_json, commit_message, author_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `ver-${id}-${nextVersion}-${Date.now()}`,
      id,
      nextVersion,
      updatedRow.title,
      updatedRow.prompt,
      updatedRow.insertion_point,
      updatedRow.color,
      updatedRow.followup_prompt,
      updatedRow.placeholder_hint,
      updatedRow.show_action_bars,
      updatedRow.use_structured_outputs,
      updatedRow.structured_schema,
      updatedRow.dot_template,
      JSON.stringify(assignedCats.map((c) => c.name)),
      input.commit_message?.trim() || (existing ? `Updated to v${nextVersion}` : 'Created v1'),
      input.author_name?.trim() || 'Collaborator',
      now
    );
  });

  tx();
  return getPromptById(id)!;
}

export function revertPromptToVersion(
  promptId: string,
  versionId: string,
  authorName = 'Collaborator'
): PromptRecord {
  const targetVer = db
    .prepare<[string, string], PromptVersionRecord>(
      'SELECT * FROM prompt_versions WHERE id = ? AND prompt_id = ?'
    )
    .get(versionId, promptId);

  if (!targetVer) {
    throw new Error('Target version not found for this prompt.');
  }

  // Match category names back to category IDs if possible
  let restoredCatIds: string[] | undefined = undefined;
  try {
    const names: string[] = JSON.parse(targetVer.categories_json || '[]');
    if (Array.isArray(names) && names.length > 0) {
      const allCats = getAllCategories();
      restoredCatIds = allCats.filter((c) => names.includes(c.name)).map((c) => c.id);
    }
  } catch {
    // ignore
  }

  return upsertPrompt({
    id: promptId,
    title: targetVer.title,
    prompt: targetVer.prompt,
    insertion_point: targetVer.insertion_point,
    color: targetVer.color,
    followup_prompt: targetVer.followup_prompt,
    placeholder_hint: targetVer.placeholder_hint,
    show_action_bars: targetVer.show_action_bars,
    use_structured_outputs: targetVer.use_structured_outputs,
    structured_schema: targetVer.structured_schema,
    dot_template: targetVer.dot_template,
    category_ids: restoredCatIds,
    commit_message: `Reverted to v${targetVer.version_number} (${targetVer.title})`,
    author_name: authorName,
  });
}

export function deletePromptById(id: string): boolean {
  const res = db.prepare<[string]>('DELETE FROM prompts WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function incrementPromptUsage(id: string): void {
  db.prepare<[string, string]>('UPDATE prompts SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  );
}

export function getAllProviders(): ProviderRecord[] {
  return db.prepare<[], ProviderRecord>('SELECT * FROM providers ORDER BY is_active DESC, name ASC').all();
}

export function setActiveProvider(id: string): ProviderRecord[] {
  const tx = db.transaction((targetId: string) => {
    db.prepare('UPDATE providers SET is_active = 0').run();
    db.prepare<[string]>('UPDATE providers SET is_active = 1 WHERE id = ?').run(targetId);
  });
  tx(id);
  return getAllProviders();
}

export function upsertProvider(
  input: Partial<ProviderRecord> & { name: string; type: ProviderRecord['type']; endpoint_url: string }
): ProviderRecord {
  const now = new Date().toISOString();
  const id = input.id || `prov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const existing = db.prepare<[string], ProviderRecord>('SELECT * FROM providers WHERE id = ?').get(id);

  if (existing) {
    db.prepare(`
      UPDATE providers SET
        name = ?,
        type = ?,
        endpoint_url = ?,
        default_model = ?,
        status = ?,
        latency_ms = ?,
        models_json = ?,
        last_checked_at = ?
      WHERE id = ?
    `).run(
      input.name,
      input.type,
      input.endpoint_url,
      input.default_model ?? existing.default_model,
      input.status ?? existing.status,
      input.latency_ms ?? existing.latency_ms,
      input.models_json ?? existing.models_json,
      now,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO providers (
        id, name, type, endpoint_url, default_model, is_active, is_discovered,
        status, latency_ms, models_json, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.type,
      input.endpoint_url,
      input.default_model ?? 'default-model',
      input.is_active ?? 0,
      input.is_discovered ?? 0,
      input.status ?? 'online',
      input.latency_ms ?? 15,
      input.models_json ?? '[]',
      now
    );
  }

  return db.prepare<[string], ProviderRecord>('SELECT * FROM providers WHERE id = ?').get(id)!;
}

export function recordExecution(exec: Omit<ExecutionRecord, 'id' | 'created_at'>): ExecutionRecord {
  const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const created_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO executions (
      id, prompt_id, prompt_title, query_input, compiled_prompt,
      provider_id, model_name, response_text, structured_json,
      rendered_html, latency_ms, image_attached, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    exec.prompt_id,
    exec.prompt_title,
    exec.query_input,
    exec.compiled_prompt,
    exec.provider_id,
    exec.model_name,
    exec.response_text,
    exec.structured_json,
    exec.rendered_html,
    exec.latency_ms,
    exec.image_attached,
    created_at
  );
  incrementPromptUsage(exec.prompt_id);
  return db.prepare<[string], ExecutionRecord>('SELECT * FROM executions WHERE id = ?').get(id)!;
}

export function getRecentExecutions(limit = 30): ExecutionRecord[] {
  return db
    .prepare<[number], ExecutionRecord>('SELECT * FROM executions ORDER BY created_at DESC LIMIT ?')
    .all(limit);
}

export function getShareholderIntegrations(): ShareholderIntegrationRecord[] {
  return db
    .prepare<[], ShareholderIntegrationRecord>('SELECT * FROM shareholder_integrations ORDER BY created_at DESC')
    .all();
}

export function upsertShareholderIntegration(
  input: Partial<ShareholderIntegrationRecord> & {
    name: string;
    stakeholder_role: string;
    protocol: ShareholderIntegrationRecord['protocol'];
    endpoint_url: string;
  }
): ShareholderIntegrationRecord {
  const id = input.id || `int-${Date.now()}`;
  const created_at = new Date().toISOString();
  const existing = db
    .prepare<[string], ShareholderIntegrationRecord>('SELECT * FROM shareholder_integrations WHERE id = ?')
    .get(id);

  if (existing) {
    db.prepare(`
      UPDATE shareholder_integrations SET
        name = ?, stakeholder_role = ?, protocol = ?, endpoint_url = ?, auth_header = ?, auto_forward = ?
      WHERE id = ?
    `).run(
      input.name,
      input.stakeholder_role,
      input.protocol,
      input.endpoint_url,
      input.auth_header ?? existing.auth_header,
      input.auto_forward !== undefined ? Number(Boolean(input.auto_forward)) : existing.auto_forward,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO shareholder_integrations (
        id, name, stakeholder_role, protocol, endpoint_url, auth_header, auto_forward, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.stakeholder_role,
      input.protocol,
      input.endpoint_url,
      input.auth_header ?? '',
      input.auto_forward ? 1 : 0,
      created_at
    );
  }

  return db.prepare<[string], ShareholderIntegrationRecord>('SELECT * FROM shareholder_integrations WHERE id = ?').get(id)!;
}

export function deleteShareholderIntegration(id: string): boolean {
  const res = db.prepare<[string]>('DELETE FROM shareholder_integrations WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function getDatabaseDiagnostics() {
  let fileSizeBytes = 0;
  try {
    if (fs.existsSync(DB_PATH)) {
      fileSizeBytes = fs.statSync(DB_PATH).size;
    }
  } catch {
    // ignore
  }
  const promptCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM prompts').get()?.c ?? 0;
  const catCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM categories').get()?.c ?? 0;
  const verCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM prompt_versions').get()?.c ?? 0;
  const execCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM executions').get()?.c ?? 0;
  const provCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM providers').get()?.c ?? 0;
  const intCount = db.prepare<[], { c: number }>('SELECT COUNT(*) as c FROM shareholder_integrations').get()?.c ?? 0;

  return {
    engine: 'better-sqlite3 (Native C++ SQLite WAL)',
    dbPath: DB_PATH,
    journalMode: 'WAL',
    fileSizeBytes,
    tables: {
      prompts: promptCount,
      categories: catCount,
      prompt_versions: verCount,
      executions: execCount,
      providers: provCount,
      shareholder_integrations: intCount,
    },
  };
}

export function executeSafeReadQuery(sqlQuery: string): { columns: string[]; rows: Record<string, unknown>[] } {
  const trimmed = sqlQuery.trim();
  if (!/^(SELECT|PRAGMA|EXPLAIN)/i.test(trimmed)) {
    throw new Error('Only read-only SELECT, PRAGMA, or EXPLAIN queries are permitted in the live SQLite inspector.');
  }
  const rows = db.prepare<[], Record<string, unknown>>(trimmed).all();
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows };
}

export default db;
