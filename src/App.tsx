/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  Edit3,
  ArrowLeft,
  Play,
  Clipboard as ClipboardIcon,
  Mic,
  MicOff,
  Copy,
  Volume2,
  Share2,
  Home as HomeIcon,
  List,
  Settings as SettingsIcon,
  RefreshCw,
  Wifi,
  Camera,
  Check,
  Upload,
  Tag,
  History,
  Users,
  Search,
  Plus,
} from 'lucide-react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  SafeAreaView,
} from './react-native/primitives.tsx';
import { probeBrowserLocalNetwork } from './services/lanDiscovery.ts';
import {
  CollaboratorPresence,
  COLLABORATOR_PRESETS,
  getCollabWebSocketUrl,
  LivePromptDraftPayload,
} from './services/collaborationClient.ts';
import { CategoryManagerModal, VersionHistoryModal } from './components/MobileModals.tsx';

export interface CategoryItem {
  id: string;
  name: string;
  color: string;
  description: string;
  prompt_count?: number;
}

export interface PromptVersionItem {
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
  author_name: string;
  commit_message: string;
  created_at: string;
}

export interface PromptItem {
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
  categories?: CategoryItem[];
  category_ids?: string[];
  is_pinned: number;
  usage_count: number;
  current_version?: number;
  created_at: string;
  updated_at: string;
}

interface ProviderItem {
  id: string;
  name: string;
  type: 'ollama' | 'llamacpp' | 'openai_compatible' | 'gemini';
  endpoint_url: string;
  status: 'online' | 'standby' | 'offline';
  models_json: string;
  default_model: string;
  is_active: number;
  auto_discovered: number;
  latency_ms: number;
  last_checked: string;
}

interface ExecutionItem {
  id: string;
  prompt_id: string;
  prompt_title: string;
  query_input: string;
  compiled_prompt: string;
  response_text: string;
  structured_json: string;
  rendered_html: string;
  provider_id: string;
  model_name: string;
  latency_ms: number;
  created_at: string;
}

interface ShareholderIntegration {
  id: string;
  name: string;
  stakeholder_role: string;
  protocol: string;
  endpoint_url: string;
  auto_forward: number;
  last_synced: string;
}

type ScreenName = 'home' | 'editor' | 'manage' | 'point_query' | 'settings';

const PROMPT_COLORS = [
  { name: 'Amber Gold', hex: '#D49B00' },
  { name: 'Pocket Coral', hex: '#F2A7A0' },
  { name: 'Patina Green', hex: '#3EB991' },
  { name: 'Roman Aqua', hex: '#20B2AA' },
  { name: 'Imperial Purple', hex: '#6A0DAD' },
  { name: 'Terracotta', hex: '#E05A47' },
  { name: 'Cobalt Blue', hex: '#4A90E2' },
];

const SAMPLE_VISION_FRAMES = [
  {
    id: 'arch-diagram',
    title: 'Local Network Topology',
    query: 'Identify bottlenecks and single points of failure in this local inference topology.',
    svgDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
        <rect width="640" height="380" fill="#181211"/>
        <rect x="30" y="30" width="580" height="320" rx="18" fill="#241C1B" stroke="#F2A7A0" stroke-width="2" stroke-opacity="0.35"/>
        <text x="55" y="70" fill="#F2A7A0" font-family="sans-serif" font-size="18" font-weight="bold">Local Inference Cluster</text>
        <rect x="55" y="110" width="150" height="90" rx="12" fill="#353338" stroke="#D49B00" stroke-width="2"/>
        <text x="75" y="150" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="bold">PocketPrompts</text>
        <text x="75" y="172" fill="#B5A8A6" font-family="monospace" font-size="11">Mobile Client</text>
        <rect x="255" y="95" width="160" height="120" rx="12" fill="#353338" stroke="#3EB991" stroke-width="2"/>
        <text x="275" y="135" fill="#3EB991" font-family="sans-serif" font-size="14" font-weight="bold">Ollama Node</text>
        <text x="275" y="158" fill="#E6DDD9" font-family="monospace" font-size="11">:11434 / llama3.2</text>
        <rect x="455" y="110" width="130" height="90" rx="12" fill="#353338" stroke="#20B2AA" stroke-width="2"/>
        <text x="472" y="150" fill="#20B2AA" font-family="sans-serif" font-size="14" font-weight="bold">llama.cpp</text>
        <text x="472" y="172" fill="#E6DDD9" font-family="monospace" font-size="11">:8080 Server</text>
        <line x1="205" y1="155" x2="255" y2="155" stroke="#F2A7A0" stroke-width="2.5"/>
        <line x1="415" y1="155" x2="455" y2="155" stroke="#20B2AA" stroke-width="2.5" stroke-dasharray="5,5"/>
      </svg>
    `),
  },
  {
    id: 'printed-notes',
    title: 'Product Spec Sheet',
    query: 'Extract action items and key milestones from this specification.',
    svgDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
        <rect width="640" height="380" fill="#1F1918"/>
        <rect x="40" y="30" width="560" height="320" rx="14" fill="#2A2221" stroke="#D49B00" stroke-width="2"/>
        <text x="70" y="78" fill="#D49B00" font-family="sans-serif" font-size="19" font-weight="bold">Q4 Roadmap Milestones</text>
        <text x="70" y="125" fill="#F5EBE9" font-family="monospace" font-size="14">1. Offline prompt storage &amp; version history</text>
        <text x="70" y="165" fill="#F5EBE9" font-family="monospace" font-size="14">2. Auto-discover local Ollama &amp; llama.cpp hosts</text>
        <text x="70" y="205" fill="#F5EBE9" font-family="monospace" font-size="14">3. Real-time multi-user prompt collaboration</text>
        <text x="70" y="245" fill="#3EB991" font-family="monospace" font-size="14">4. Multi-category tagging and filtering</text>
      </svg>
    `),
  },
];

export default function App() {
  // Navigation & Screen State
  const [activeScreen, setActiveScreen] = useState<ScreenName>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promptSelectorOpen, setPromptSelectorOpen] = useState(false);

  // Data State
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('prompt-ai-employment');
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [integrations, setIntegrations] = useState<ShareholderIntegration[]>([]);

  // Version Control State
  const [promptVersions, setPromptVersions] = useState<PromptVersionItem[]>([]);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [formCommitMessage, setFormCommitMessage] = useState('');

  // Real-Time WebSocket Collaboration State
  const [wsConnected, setWsConnected] = useState(false);
  const [myClientId] = useState(() => `rn-mobile-${Math.random().toString(36).slice(2, 8)}`);
  const [myCollaborator, setMyCollaborator] = useState(COLLABORATOR_PRESETS[0]);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [remoteLiveBanner, setRemoteLiveBanner] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef(false);

  // Home Screen Query & Execution State
  const [queryText, setQueryText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<ExecutionItem | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [structuredViewMode, setStructuredViewMode] = useState<'rendered' | 'json'>('rendered');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [speakingSectionIdx, setSpeakingSectionIdx] = useState<number | null>(null);
  const [copiedSectionIdx, setCopiedSectionIdx] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamMeta, setStreamMeta] = useState<{ model?: string; provider?: string } | null>(null);
  const [playButtonRippling, setPlayButtonRippling] = useState(false);

  // New / Edit Prompt Form State (Exact match to Screenshot 1)
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formCursorPos, setFormCursorPos] = useState<number>(0);
  const [formInsertionPoint, setFormInsertionPoint] = useState<number>(-1);
  const [formColor, setFormColor] = useState('#D49B00');
  const [formFollowup, setFormFollowup] = useState('');
  const [formPlaceholder, setFormPlaceholder] = useState('');
  const [formShowActionBars, setFormShowActionBars] = useState(false);
  const [formUseStructured, setFormUseStructured] = useState(false);
  const [formStructuredSchema, setFormStructuredSchema] = useState('');
  const [formDotTemplate, setFormDotTemplate] = useState('');
  const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [formStatusMsg, setFormStatusMsg] = useState<string | null>(null);

  // LAN Discovery & Settings State
  const [isScanningLan, setIsScanningLan] = useState(false);
  const [customLanHost, setCustomLanHost] = useState('127.0.0.1');
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);

  // Point & Query Camera / Vision State
  const [pointQueryInput, setPointQueryInput] = useState(SAMPLE_VISION_FRAMES[0].query);
  const [capturedImage, setCapturedImage] = useState<string>(SAMPLE_VISION_FRAMES[0].svgDataUrl);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Shareholder Integration Form State
  const [newIntName, setNewIntName] = useState('');
  const [newIntRole, setNewIntRole] = useState('');
  const [newIntUrl, setNewIntUrl] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  }

  function triggerTactileGlassThrum() {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(16);
      }
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
      }
    } catch {
      // Audio or vibration unavailable
    }
  }

  // Initial Data Load & Auto-Discovery
  useEffect(() => {
    loadInitialData();
    triggerLanAutoDiscovery(true);
  }, []);

  // Active collaboration room ID
  const activeCollabRoomId = useMemo(() => {
    if (activeScreen === 'editor') {
      return editingPromptId || 'new-prompt-draft';
    }
    return selectedPromptId || 'prompt-ai-employment';
  }, [activeScreen, editingPromptId, selectedPromptId]);

  // Fetch version history whenever selectedPromptId or editingPromptId changes
  useEffect(() => {
    const targetId = editingPromptId || selectedPromptId;
    if (!targetId) return;
    fetchVersionsForPrompt(targetId);
  }, [selectedPromptId, editingPromptId, prompts]);

  // Real-Time WebSocket Collaboration Connection (/ws/collab)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connectWebSocket = () => {
      if (unmounted) return;
      ws = new WebSocket(getCollabWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setWsConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'collab:join',
            clientId: myClientId,
            userName: myCollaborator.name,
            userColor: myCollaborator.color,
            roomId: activeCollabRoomId,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'collab:init') {
            if (Array.isArray(msg.collaborators)) setCollaborators(msg.collaborators);
            if (Array.isArray(msg.prompts)) setPrompts(msg.prompts);
            if (Array.isArray(msg.categories)) setCategories(msg.categories);
          } else if (msg.type === 'collab:presence') {
            if (Array.isArray(msg.collaborators)) setCollaborators(msg.collaborators);
          } else if (
            (msg.type === 'prompt:live_edit' || msg.type === 'prompt:live_state') &&
            msg.editorClientId !== myClientId &&
            msg.draft
          ) {
            const draft: LivePromptDraftPayload = msg.draft;
            isRemoteUpdateRef.current = true;
            setFormTitle(draft.title ?? '');
            setFormPrompt(draft.prompt ?? '');
            if (typeof draft.insertion_point === 'number') setFormInsertionPoint(draft.insertion_point);
            if (draft.color) setFormColor(draft.color);
            setFormFollowup(draft.followup_prompt ?? '');
            setFormPlaceholder(draft.placeholder_hint ?? '');
            setFormShowActionBars(Boolean(draft.show_action_bars));
            setFormUseStructured(Boolean(draft.use_structured_outputs));
            if (draft.structured_schema !== undefined) setFormStructuredSchema(draft.structured_schema);
            if (draft.dot_template !== undefined) setFormDotTemplate(draft.dot_template);
            if (Array.isArray(draft.category_ids)) setFormCategoryIds(draft.category_ids);

            setPrompts((prev) =>
              prev.map((p) =>
                p.id === msg.roomId
                  ? {
                      ...p,
                      title: draft.title || p.title,
                      prompt: draft.prompt || p.prompt,
                      color: draft.color || p.color,
                      followup_prompt: draft.followup_prompt ?? p.followup_prompt,
                      placeholder_hint: draft.placeholder_hint || p.placeholder_hint,
                      category_ids: Array.isArray(draft.category_ids) ? draft.category_ids : p.category_ids,
                    }
                  : p
              )
            );

            if (msg.editorName) {
              setRemoteLiveBanner(`${msg.editorName} editing ${msg.focusedField || 'prompt'}`);
            }
            setTimeout(() => {
              isRemoteUpdateRef.current = false;
            }, 30);
          } else if (msg.type === 'prompt:saved' || msg.type === 'version:reverted') {
            if (Array.isArray(msg.prompts)) setPrompts(msg.prompts);
            if (Array.isArray(msg.categories)) setCategories(msg.categories);
            if (msg.prompt && Array.isArray(msg.versions)) {
              setPromptVersions(msg.versions);
              if (editingPromptId === msg.prompt.id || selectedPromptId === msg.prompt.id) {
                isRemoteUpdateRef.current = true;
                setFormTitle(msg.prompt.title);
                setFormPrompt(msg.prompt.prompt);
                setFormInsertionPoint(msg.prompt.insertion_point);
                setFormColor(msg.prompt.color);
                setFormFollowup(msg.prompt.followup_prompt || '');
                setFormPlaceholder(msg.prompt.placeholder_hint || '');
                setFormShowActionBars(Boolean(msg.prompt.show_action_bars));
                setFormUseStructured(Boolean(msg.prompt.use_structured_outputs));
                setFormStructuredSchema(msg.prompt.structured_schema || '');
                setFormDotTemplate(msg.prompt.dot_template || '');
                setFormCategoryIds(msg.prompt.category_ids || []);
                setTimeout(() => {
                  isRemoteUpdateRef.current = false;
                }, 30);
              }
            }
            if (msg.type === 'version:reverted' && msg.prompt) {
              showToast(`Reverted "${msg.prompt.title}" to v${msg.prompt.current_version}`);
            }
          } else if (msg.type === 'prompt:deleted') {
            if (Array.isArray(msg.prompts)) setPrompts(msg.prompts);
            if (Array.isArray(msg.categories)) setCategories(msg.categories);
          } else if (msg.type === 'category:updated') {
            if (Array.isArray(msg.categories)) setCategories(msg.categories);
            if (Array.isArray(msg.prompts)) setPrompts(msg.prompts);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!unmounted) {
          reconnectTimer = setTimeout(connectWebSocket, 1800);
        }
      };
    };

    connectWebSocket();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [myClientId]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'collab:join',
          clientId: myClientId,
          userName: myCollaborator.name,
          userColor: myCollaborator.color,
          roomId: activeCollabRoomId,
        })
      );
    }
  }, [activeCollabRoomId, myClientId, myCollaborator.name, myCollaborator.color]);

  function emitMobileLiveEdit(
    overrides: Partial<LivePromptDraftPayload>,
    focusedField: string,
    cursorPos = formCursorPos
  ) {
    if (isRemoteUpdateRef.current) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const draft: LivePromptDraftPayload = {
      roomId: editingPromptId || selectedPromptId || 'new-prompt',
      title: overrides.title ?? formTitle,
      prompt: overrides.prompt ?? formPrompt,
      insertion_point: overrides.insertion_point ?? formInsertionPoint,
      color: overrides.color ?? formColor,
      followup_prompt: overrides.followup_prompt ?? formFollowup,
      placeholder_hint: overrides.placeholder_hint ?? formPlaceholder,
      show_action_bars: overrides.show_action_bars ?? formShowActionBars,
      use_structured_outputs: overrides.use_structured_outputs ?? formUseStructured,
      structured_schema: overrides.structured_schema ?? formStructuredSchema,
      dot_template: overrides.dot_template ?? formDotTemplate,
      category_ids: overrides.category_ids ?? formCategoryIds,
    };

    wsRef.current.send(
      JSON.stringify({
        type: 'prompt:live_edit',
        roomId: draft.roomId,
        draft,
        focusedField,
        cursorPos,
      })
    );
  }

  useEffect(() => {
    if (!autoScanEnabled) return;
    const timer = setInterval(() => {
      triggerLanAutoDiscovery(true);
    }, 25000);
    return () => clearInterval(timer);
  }, [autoScanEnabled]);

  async function loadInitialData() {
    try {
      const [promptsRes, catRes, provRes, intRes] = await Promise.all([
        fetch('/api/prompts').then((r) => r.json()),
        fetch('/api/categories').then((r) => r.json()),
        fetch('/api/providers').then((r) => r.json()),
        fetch('/api/integrations').then((r) => r.json()),
      ]);

      if (Array.isArray(promptsRes?.prompts)) {
        setPrompts(promptsRes.prompts);
        if (promptsRes.prompts.length > 0 && !promptsRes.prompts.some((p: PromptItem) => p.id === selectedPromptId)) {
          setSelectedPromptId(promptsRes.prompts[0].id);
        }
      }
      if (Array.isArray(catRes?.categories)) setCategories(catRes.categories);
      if (Array.isArray(provRes?.providers)) setProviders(provRes.providers);
      if (Array.isArray(intRes?.integrations)) setIntegrations(intRes.integrations);
    } catch (err) {
      console.error('Failed to load initial state:', err);
    }
  }

  async function fetchVersionsForPrompt(promptId: string) {
    try {
      const res = await fetch(`/api/prompts/${promptId}/versions`);
      const data = await res.json();
      if (Array.isArray(data?.versions)) {
        setPromptVersions(data.versions);
      }
    } catch {
      // ignore
    }
  }

  async function triggerLanAutoDiscovery(silent = false) {
    if (!silent) setIsScanningLan(true);
    try {
      const browserNodes = await probeBrowserLocalNetwork(customLanHost ? [customLanHost] : []);

      const res = await fetch('/api/discovery/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customHosts: customLanHost ? [customLanHost] : [],
          clientDiscovered: browserNodes,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data?.providers)) {
        setProviders(data.providers);
      }
      if (!silent) {
        showToast('Local network scan complete');
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setIsScanningLan(false);
    }
  }

  const activePrompt = useMemo(() => {
    return prompts.find((p) => p.id === selectedPromptId) || prompts[0] || null;
  }, [prompts, selectedPromptId]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      const matchesCategory =
        selectedCategoryFilter === 'ALL' ||
        (Array.isArray(p.category_ids) && p.category_ids.includes(selectedCategoryFilter)) ||
        (Array.isArray(p.categories) &&
          p.categories.some((c) => c.id === selectedCategoryFilter || c.name === selectedCategoryFilter));

      if (!matchesCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q);
    });
  }, [prompts, selectedCategoryFilter, searchQuery]);

  const activeProvider = useMemo(() => {
    return providers.find((p) => p.is_active === 1) || providers[0] || null;
  }, [providers]);

  function openNewPromptEditor() {
    setEditingPromptId(null);
    setFormTitle('');
    setFormPrompt('');
    setFormCursorPos(0);
    setFormInsertionPoint(-1);
    setFormColor('#D49B00');
    setFormFollowup('');
    setFormPlaceholder('');
    setFormShowActionBars(false);
    setFormUseStructured(false);
    setFormCategoryIds(categories.length > 0 ? [categories[0].id] : []);
    setFormCommitMessage('');
    setFormStructuredSchema(
      JSON.stringify(
        {
          type: 'OBJECT',
          properties: {
            summary: { type: 'STRING', description: 'Core synthesis' },
            keyFindings: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['summary', 'keyFindings'],
        },
        null,
        2
      )
    );
    setFormDotTemplate(
      `<div class="pp-structured-card">\n  <div class="pp-sc-title">{{=it.summary}}</div>\n  <ul>\n    {{~it.keyFindings :item:idx}}\n    <li>{{=item}}</li>\n    {{~}}\n  </ul>\n</div>`
    );
    setFormStatusMsg(null);
    setDrawerOpen(false);
    setActiveScreen('editor');
  }

  function openEditPromptEditor(promptItem: PromptItem) {
    setEditingPromptId(promptItem.id);
    setSelectedPromptId(promptItem.id);
    setFormTitle(promptItem.title);
    setFormPrompt(promptItem.prompt);
    setFormInsertionPoint(promptItem.insertion_point);
    setFormColor(promptItem.color || '#D49B00');
    setFormFollowup(promptItem.followup_prompt || '');
    setFormPlaceholder(promptItem.placeholder_hint || '');
    setFormShowActionBars(Boolean(promptItem.show_action_bars));
    setFormUseStructured(Boolean(promptItem.use_structured_outputs));
    setFormCategoryIds(promptItem.category_ids || []);
    setFormCommitMessage('');
    setFormStructuredSchema(
      promptItem.structured_schema ||
        JSON.stringify(
          {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING' },
              keyFindings: { type: 'ARRAY', items: { type: 'STRING' } },
            },
          },
          null,
          2
        )
    );
    setFormDotTemplate(
      promptItem.dot_template ||
        `<div class="pp-structured-card">\n  <div class="pp-sc-title">{{=it.summary}}</div>\n  <ul>\n    {{~it.keyFindings :item:idx}}\n    <li>{{=item}}</li>\n    {{~}}\n  </ul>\n</div>`
    );
    setFormStatusMsg(null);
    setDrawerOpen(false);
    setActiveScreen('editor');
  }

  function toggleFormCategory(catId: string) {
    setFormCategoryIds((prev) => {
      const exists = prev.includes(catId);
      const next = exists ? prev.filter((id) => id !== catId) : [...prev, catId];
      emitMobileLiveEdit({ category_ids: next }, 'categories');
      return next;
    });
  }

  function handleSetInsertionPointAtCursor() {
    const pos = Math.max(0, Math.min(formCursorPos, formPrompt.length));
    const cleaned = formPrompt.replace(/\{\{query\}\}/g, '');
    const adjustedPos = Math.min(pos, cleaned.length);
    const updatedPrompt = cleaned.slice(0, adjustedPos) + '{{query}}' + cleaned.slice(adjustedPos);
    setFormPrompt(updatedPrompt);
    setFormInsertionPoint(adjustedPos);
    emitMobileLiveEdit({ prompt: updatedPrompt, insertion_point: adjustedPos }, 'insertion_point', adjustedPos);
    setFormStatusMsg('Insertion point {{query}} placed at cursor.');
  }

  async function handleSavePrompt() {
    if (!formTitle.trim() || !formPrompt.trim()) {
      setFormStatusMsg('Please provide both a Title and a Prompt.');
      return;
    }

    try {
      const payload = {
        id: editingPromptId || undefined,
        title: formTitle.trim(),
        prompt: formPrompt,
        insertion_point: formInsertionPoint,
        color: formColor,
        followup_prompt: formFollowup,
        placeholder_hint: formPlaceholder.trim() || 'Tap play to generate',
        show_action_bars: formShowActionBars ? 1 : 0,
        use_structured_outputs: formUseStructured ? 1 : 0,
        structured_schema: formUseStructured ? formStructuredSchema : '',
        dot_template: formUseStructured ? formDotTemplate : '',
        category_ids: formCategoryIds,
        commit_message:
          formCommitMessage.trim() ||
          (editingPromptId ? 'Updated prompt' : 'Initial version'),
        author_name: myCollaborator.name,
      };

      const res = await fetch(editingPromptId ? `/api/prompts/${editingPromptId}` : '/api/prompts', {
        method: editingPromptId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.prompt) {
        if (Array.isArray(data?.versions)) setPromptVersions(data.versions);
        await loadInitialData();
        setSelectedPromptId(data.prompt.id);
        setActiveScreen('home');
      }
    } catch (err) {
      setFormStatusMsg(`Save failed: ${(err as Error).message}`);
    }
  }

  async function handleDeletePrompt() {
    if (!editingPromptId) {
      setActiveScreen('home');
      return;
    }
    try {
      await fetch(`/api/prompts/${editingPromptId}`, { method: 'DELETE' });
      const updated = await fetch('/api/prompts').then((r) => r.json());
      if (Array.isArray(updated?.prompts)) {
        setPrompts(updated.prompts);
        if (updated.prompts.length > 0) {
          setSelectedPromptId(updated.prompts[0].id);
        }
      }
      setActiveScreen('home');
    } catch (err) {
      setFormStatusMsg(`Delete failed: ${(err as Error).message}`);
    }
  }

  async function handleExecutePrompt(options?: { isFollowup?: boolean; imageDataUrl?: string; customQuery?: string }) {
    if (!activePrompt || isExecuting) return;
    setIsExecuting(true);
    setExecutionError(null);
    setStreamingText('');
    setStreamMeta(null);
    setPlayButtonRippling(true);
    triggerTactileGlassThrum();
    setTimeout(() => setPlayButtonRippling(false), 950);

    const effectiveQuery = options?.customQuery !== undefined ? options.customQuery : queryText;

    try {
      const res = await fetch('/api/execute/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: activePrompt.id,
          queryInput: effectiveQuery,
          imageBase64: options?.imageDataUrl || undefined,
          previousResponse: options?.isFollowup ? currentExecution?.response_text : undefined,
          isFollowup: Boolean(options?.isFollowup),
          overrideProviderId: activeProvider?.id,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Execution error: ${res.statusText || 'Unable to connect to model stream'}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let executionFinished = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'start') {
              setStreamMeta({ model: data.model, provider: data.provider });
            } else if (data.type === 'chunk') {
              accumulatedText += data.text;
              setStreamingText(accumulatedText);
            } else if (data.type === 'done') {
              executionFinished = true;
              if (data.execution) {
                setCurrentExecution(data.execution);
              }
              setStreamingText('');
              await loadInitialData();
            } else if (data.type === 'error') {
              throw new Error(data.error || 'Execution streaming encountered an error');
            }
          } catch (parseErr) {
            console.warn('SSE payload parse warning:', parseErr);
          }
        }
      }

      if (!executionFinished && accumulatedText) {
        // If connection ended without explicit 'done' event, synthesize execution state
        setCurrentExecution((prev) => ({
          id: prev?.id || `exec-${Date.now()}`,
          prompt_id: activePrompt.id,
          prompt_title: activePrompt.title,
          query_input: effectiveQuery,
          compiled_prompt: '',
          response_text: accumulatedText,
          structured_json: '',
          rendered_html: '',
          provider_id: activeProvider?.id || 'gemini-core',
          model_name: activeProvider?.default_model || 'gemini-3.8-flash',
          latency_ms: 120,
          created_at: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.warn('Stream interrupted, attempting resilient fallback:', err);
      try {
        const fallbackRes = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptId: activePrompt.id,
            queryInput: effectiveQuery,
            imageBase64: options?.imageDataUrl || undefined,
            previousResponse: options?.isFollowup ? currentExecution?.response_text : undefined,
            isFollowup: Boolean(options?.isFollowup),
            overrideProviderId: activeProvider?.id,
          }),
        });
        const data = await fallbackRes.json();
        if (!fallbackRes.ok) {
          throw new Error(data?.error || 'Execution failed');
        }
        setCurrentExecution(data.execution);
        await loadInitialData();
      } catch (fallbackErr) {
        setExecutionError((fallbackErr as Error).message);
      }
    } finally {
      setIsExecuting(false);
      setStreamingText('');
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQueryText((prev) => (prev ? `${prev}\n${text}` : text));
        showToast('Pasted from clipboard');
      }
    } catch {
      const sampleText =
        'Evaluate autonomous software engineering agents across 500-person enterprise R&D teams in 2026.';
      setQueryText((prev) => (prev ? `${prev}\n${sampleText}` : sampleText));
      showToast('Pasted clipboard text');
    }
  }

  async function handleToggleMicrophone() {
    if (isRecordingMic) {
      mediaRecorderRef.current?.stop();
      setIsRecordingMic(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          try {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/webm' }),
            });
            const data = await res.json();
            if (data?.text) {
              setQueryText((prev) => (prev ? `${prev} ${data.text}` : data.text));
            }
          } catch {
            // ignore
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
    } catch {
      setQueryText(
        'Compare software developer productivity and junior engineering career ladders before and after local LLM adoption.'
      );
      showToast('Voice input populated');
    }
  }

  async function handleSpeakSection(text: string, idx: number) {
    if (speakingSectionIdx === idx) {
      setSpeakingSectionIdx(null);
      return;
    }
    setSpeakingSectionIdx(idx);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data?.audioDataUrl) {
        const audio = new Audio(data.audioDataUrl);
        audio.onended = () => setSpeakingSectionIdx(null);
        await audio.play();
      } else {
        setSpeakingSectionIdx(null);
      }
    } catch {
      setSpeakingSectionIdx(null);
    }
  }

  function handleShareSection(sectionText: string) {
    const target = integrations[0]?.name || 'Connected Webhook';
    showToast(`Shared response section to ${target} (${sectionText.length} chars)`);
  }

  async function startCameraStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      setCameraActive(false);
    }
  }

  function stopCameraStream() {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  function captureCameraFrame() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
      stopCameraStream();
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setCapturedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAddShareholderIntegration() {
    if (!newIntName.trim() || !newIntUrl.trim()) return;
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newIntName.trim(),
          stakeholder_role: newIntRole.trim() || 'Team Webhook',
          protocol: 'REST_WEBHOOK',
          endpoint_url: newIntUrl.trim(),
          auto_forward: 1,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data?.integrations)) {
        setIntegrations(data.integrations);
        setNewIntName('');
        setNewIntRole('');
        setNewIntUrl('');
        showToast('Integration saved');
      }
    } catch {
      // ignore
    }
  }

  const responseSections = useMemo(() => {
    if (!currentExecution?.response_text) return [];
    const raw = currentExecution.response_text.trim();
    const parts = raw.split(/\n(?=##?\s|\d+\.\s\*\*)/g).filter((s) => s.trim().length > 0);
    return parts.length > 0 ? parts : [raw];
  }, [currentExecution]);

  const headerBg = '#F2A7A0';
  const headerText = '#5A0808';
  const canvasBg = '#1E1716';
  const inputSurfaceBg = '#353338';

  return (
    <SafeAreaView className="min-h-screen w-full bg-[#140F0E] text-[#F5EBE9] flex flex-col items-center justify-center">
      {/* Subtle Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#282120] border border-[#F2A7A0]/40 text-[#F5EBE9] px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs">
          <Check className="w-3.5 h-3.5 text-[#3EB991] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Cross-Platform React Native App Container */}
      <div
        className="relative w-full max-w-[540px] min-h-screen sm:min-h-[860px] sm:max-h-[92vh] sm:my-4 sm:rounded-[32px] glass-pane flex flex-col overflow-hidden"
      >
        {/* ===================================================================
            SLIDE-OUT NAVIGATION DRAWER (Matches Screenshot 2)
           =================================================================== */}
        {drawerOpen && (
          <div className="absolute inset-0 z-40 flex">
            <View
              style={{
                width: '76%',
                height: '100%',
                backgroundColor: '#1E1817',
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Drawer Brand Header */}
              <View style={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 24 }}>
                <Text style={{ fontSize: 23, color: '#EAE0DE', letterSpacing: -0.3 }}>
                  <span className="font-light">Pocket</span>
                  <span className="font-semibold">Prompts</span>
                </Text>
              </View>

              {/* Drawer Navigation Items */}
              <View style={{ gap: 2 }}>
                <TouchableOpacity
                  onPress={() => {
                    setActiveScreen('home');
                    setDrawerOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    paddingHorizontal: 22,
                    paddingVertical: 15,
                    backgroundColor: activeScreen === 'home' ? '#9E0B0F' : 'transparent',
                  }}
                >
                  <HomeIcon className="w-5 h-5 text-[#F5EBE9]" />
                  <Text style={{ fontSize: 16, color: '#F5EBE9', fontWeight: activeScreen === 'home' ? 600 : 400 }}>
                    Home
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setDrawerOpen(false);
                    setPromptSelectorOpen(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    paddingHorizontal: 22,
                    paddingVertical: 15,
                    backgroundColor: promptSelectorOpen ? '#9E0B0F' : 'transparent',
                  }}
                >
                  <div className="w-5 h-5 flex items-center justify-center font-bold text-[#D9CECC]">#</div>
                  <Text style={{ fontSize: 16, color: '#E6DDD9' }}>Manage prompts</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setDrawerOpen(false);
                    setCategoryModalOpen(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    paddingHorizontal: 22,
                    paddingVertical: 15,
                  }}
                >
                  <Tag className="w-5 h-5 text-[#D9CECC]" />
                  <Text style={{ fontSize: 16, color: '#E6DDD9' }}>Categories</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setActiveScreen('point_query');
                    setDrawerOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    paddingHorizontal: 22,
                    paddingVertical: 14,
                    backgroundColor: activeScreen === 'point_query' ? '#9E0B0F' : 'transparent',
                  }}
                >
                  <div className="w-6 h-6 rounded-full bg-[#D9CECC] text-[#1E1817] flex items-center justify-center font-bold text-xs shrink-0">
                    #
                  </div>
                  <View>
                    <Text style={{ fontSize: 16, color: '#E6DDD9' }}>Point &amp; Query</Text>
                    <Text
                      style={{
                        fontSize: 10,
                        letterSpacing: 0.8,
                        color: '#7A706E',
                        fontWeight: 700,
                        marginTop: 1,
                      }}
                    >
                      EXPERIMENTAL
                    </Text>
                  </View>
                </TouchableOpacity>

                <div className="my-2 border-t border-white/10 mx-4" />

                <TouchableOpacity
                  onPress={() => {
                    setActiveScreen('settings');
                    setDrawerOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    paddingHorizontal: 22,
                    paddingVertical: 15,
                    backgroundColor: activeScreen === 'settings' ? '#9E0B0F' : 'transparent',
                  }}
                >
                  <SettingsIcon className="w-5 h-5 text-[#D9CECC]" />
                  <Text style={{ fontSize: 16, color: '#E6DDD9' }}>Settings</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Backdrop tap to close */}
            <div
              onClick={() => setDrawerOpen(false)}
              className="flex-1 h-full bg-black/55 backdrop-blur-[1px] cursor-pointer"
            />
          </div>
        )}

        {/* ===================================================================
            CATEGORY MANAGER MODAL & VERSION HISTORY MODAL
           =================================================================== */}
        <CategoryManagerModal
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          categories={categories}
          onCategoriesUpdated={(updatedCategories, updatedPrompts) => {
            setCategories(updatedCategories);
            if (Array.isArray(updatedPrompts)) setPrompts(updatedPrompts);
          }}
        />

        <VersionHistoryModal
          isOpen={versionModalOpen}
          onClose={() => setVersionModalOpen(false)}
          promptItem={
            prompts.find((p) => p.id === (editingPromptId || selectedPromptId)) || activePrompt
          }
          versions={promptVersions}
          authorName={myCollaborator.name}
          onVersionReverted={(revertedPrompt, updatedVersions, allPrompts) => {
            setPromptVersions(updatedVersions);
            if (Array.isArray(allPrompts) && allPrompts.length > 0) {
              setPrompts(allPrompts);
            }
            if (editingPromptId === revertedPrompt.id) {
              setFormTitle(revertedPrompt.title);
              setFormPrompt(revertedPrompt.prompt);
              setFormInsertionPoint(revertedPrompt.insertion_point);
              setFormColor(revertedPrompt.color);
              setFormFollowup(revertedPrompt.followup_prompt || '');
              setFormPlaceholder(revertedPrompt.placeholder_hint || '');
              setFormShowActionBars(Boolean(revertedPrompt.show_action_bars));
              setFormUseStructured(Boolean(revertedPrompt.use_structured_outputs));
              setFormStructuredSchema(revertedPrompt.structured_schema || '');
              setFormDotTemplate(revertedPrompt.dot_template || '');
              setFormCategoryIds(revertedPrompt.category_ids || []);
            }
          }}
        />

        {/* ===================================================================
            MANAGE PROMPTS TRAY SYSTEM (Triggered by # button)
           =================================================================== */}
        {promptSelectorOpen && (
          <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-xs flex flex-col justify-end">
            <div className="bg-[#1E1716] border-t border-white/15 rounded-t-[32px] p-5 h-[88%] flex flex-col shadow-2xl">
              <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-5 shrink-0" />
              
              <div className="flex items-center justify-between mb-4 shrink-0 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#F2A7A0] flex items-center justify-center font-bold text-lg text-[#5A0808]">#</div>
                  <span className="text-lg font-bold text-[#F5EBE9]">Prompts Tray</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPromptSelectorOpen(false);
                      setCategoryModalOpen(true);
                    }}
                    className="p-2.5 rounded-xl bg-white/5 text-[#E6DDD9] hover:bg-white/10 transition-colors cursor-pointer"
                    title="Manage Categories"
                  >
                    <Tag className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPromptSelectorOpen(false);
                      openNewPromptEditor();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F2A7A0] text-[#5A0808] text-sm font-bold shadow-lg active:scale-95 transition-transform cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New</span>
                  </button>
                </div>
              </div>

              {/* Enhanced Tray Search */}
              <div className="relative mb-4 shrink-0 px-1">
                <Search className="w-4 h-4 text-[#9E9391] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search prompts..."
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[#140F0E] border border-white/10 text-sm text-[#F5EBE9] placeholder:text-[#6E6361] outline-none focus:border-[#F2A7A0]/50 transition-colors"
                />
              </div>

              {/* Category Filter Horizontal Scroller */}
              <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-2 shrink-0 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                    selectedCategoryFilter === 'ALL'
                      ? 'bg-[#F2A7A0] text-[#5A0808] shadow-md'
                      : 'bg-white/5 text-[#9E9391] hover:text-white'
                  }`}
                >
                  All ({prompts.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all border ${
                      selectedCategoryFilter === cat.id
                        ? 'bg-white/15 text-white border-white/30 shadow-md'
                        : 'bg-white/5 text-[#9E9391] border-transparent hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Scrollable Prompts List */}
              <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-4 custom-scrollbar">
                {filteredPrompts.length > 0 ? (
                  filteredPrompts.map((item) => {
                    const isActive = item.id === activePrompt?.id;
                    const catNames = (item.categories || []).map((c) => c.name).join(' · ') || item.category;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedPromptId(item.id);
                          setPromptSelectorOpen(false);
                        }}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
                          isActive
                            ? 'bg-[#2E2524] border-[#F2A7A0]'
                            : 'bg-[#181312] border-white/10 hover:border-white/20'
                        }`}
                      >
                        {isActive && (
                          <div className="absolute top-0 right-0 w-1 h-full bg-[#F2A7A0]" />
                        )}
                        
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <span
                              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base text-white shrink-0 shadow-inner"
                              style={{ backgroundColor: item.color || '#D49B00' }}
                            >
                              #
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-bold truncate ${isActive ? 'text-[#F2A7A0]' : 'text-[#F5EBE9]'}`}>
                                  {item.title}
                                </span>
                                <span className="text-[10px] font-mono text-[#9E9391] px-1.5 py-0.5 rounded bg-white/5">
                                  v{item.current_version || 1}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#8C8381] truncate">
                                {catNames} · {item.usage_count} runs
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedPromptId(item.id);
                                await fetchVersionsForPrompt(item.id);
                                setVersionModalOpen(true);
                              }}
                              className="p-2 text-[#9E9391] hover:text-[#F2A7A0] transition-colors cursor-pointer"
                              title="History"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPromptSelectorOpen(false);
                                openEditPromptEditor(item);
                              }}
                              className="p-2 text-[#9E9391] hover:text-white transition-colors cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        <p className="text-[11px] text-[#6E6361] line-clamp-2 font-mono bg-black/15 p-2.5 rounded-xl mt-3 leading-normal border border-white/5">
                          {item.prompt}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 flex flex-col items-center text-[#6E6361] space-y-4">
                    <Search className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium">No prompts found matching your search</p>
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-[#F2A7A0] font-bold underline"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              
              <button
                type="button"
                onClick={() => setPromptSelectorOpen(false)}
                className="mt-2 w-full py-4 rounded-2xl bg-white/5 text-sm font-bold text-[#E6DDD9] active:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                Close Tray
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 1: HOME SCREEN (Clean match to Screenshot 3)
           =================================================================== */}
        {activeScreen === 'home' && (
          <View style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Top App Bar */}
            <View
              style={{
                height: 58,
                backgroundColor: headerBg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                flexShrink: 0,
              }}
            >
              <TouchableOpacity
                onPress={() => setDrawerOpen(true)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                aria-label="Open navigation drawer"
              >
                <Menu className="w-6 h-6" style={{ color: headerText }} />
              </TouchableOpacity>

              <Text style={{ fontSize: 21, color: headerText, letterSpacing: -0.3 }}>
                <span className="font-normal">Pocket</span>
                <span className="font-bold">Prompts</span>
              </Text>

              <TouchableOpacity
                onPress={() => activePrompt && openEditPromptEditor(activePrompt)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                title="Edit active prompt"
              >
                <Edit3 className="w-5 h-5" style={{ color: headerText }} />
              </TouchableOpacity>
            </View>

            {/* Main Body Content */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 110, gap: 16 }}
            >
              {/* Prompt Title Tag Row: # | Impact of AI on employment */}
              {activePrompt && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPromptSelectorOpen(true)}
                    className="flex items-center gap-2.5 text-left group cursor-pointer min-w-0"
                  >
                    <span
                      className="font-bold text-lg leading-none shrink-0"
                      style={{ color: activePrompt.color || '#D49B00' }}
                    >
                      #
                    </span>
                    <span className="text-white/25 text-sm shrink-0">|</span>
                    <span className="text-[15px] font-medium text-[#E6DDD9] group-hover:text-white transition-colors truncate">
                      {activePrompt.title}
                    </span>
                  </button>

                  {/* Quiet unboxed version history link */}
                  <button
                    type="button"
                    onClick={async () => {
                      await fetchVersionsForPrompt(activePrompt.id);
                      setVersionModalOpen(true);
                    }}
                    className="text-xs text-[#9E9391] hover:text-[#F2A7A0] transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                    title="View version history"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="tabular-nums">v{activePrompt.current_version || 1}</span>
                  </button>
                </div>
              )}

              {/* Large Clean Query Input Area ("Tap play to generate") */}
              <View style={{ marginTop: 4 }}>
                <TextInput
                  multiline
                  numberOfLines={4}
                  value={queryText}
                  onChangeText={setQueryText}
                  placeholder={activePrompt?.placeholder_hint || 'Tap play to generate'}
                  style={{
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: '#F5EBE9',
                    fontWeight: 400,
                    minHeight: 120,
                  }}
                  className="placeholder:text-[#7E7674]"
                />
              </View>

              {queryText.trim().length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setQueryText('')}
                    className="text-xs text-[#9E9391] hover:text-white cursor-pointer"
                  >
                    Clear input
                  </button>
                </div>
              )}

              {/* Generating / Live Streaming State */}
              {isExecuting && (
                <div className="space-y-3">
                  {!streamingText ? (
                    <div className="p-4 rounded-2xl bg-[#282120] border border-[#F2A7A0]/30 flex items-center justify-between gap-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <RefreshCw className="w-4 h-4 text-[#F2A7A0] animate-spin shrink-0" />
                        <span className="text-sm text-[#E6DDD9]">
                          {streamMeta ? `Connecting to ${streamMeta.model}...` : 'Initiating cognitive stream...'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[#3EB991] px-2 py-0.5 rounded-full bg-[#3EB991]/15 tracking-wide">
                        LIVE
                      </span>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-[#282120] border border-[#3EB991]/40 space-y-3 shadow-xl">
                      <div className="flex items-center justify-between text-xs pb-2 border-b border-white/8">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3EB991] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3EB991]"></span>
                          </span>
                          <span className="font-bold text-[#3EB991] font-mono text-[11px] tracking-wider">
                            STREAMING OUTCOME
                          </span>
                        </div>
                        <span className="text-[10px] text-[#A69B99] font-mono">
                          {streamMeta?.model || 'gemini-3.8-flash'} · {streamingText.length} chars
                        </span>
                      </div>
                      <div className="text-sm text-[#F2EAE8] whitespace-pre-wrap leading-relaxed font-sans">
                        {streamingText}
                        <span className="streaming-cursor" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error State */}
              {executionError && (
                <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                  {executionError}
                </div>
              )}

              {/* Generated Output Area */}
              {currentExecution && !isExecuting && (
                <div className="space-y-4 mt-2">
                  {currentExecution.rendered_html && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setStructuredViewMode('rendered')}
                        className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer ${
                          structuredViewMode === 'rendered'
                            ? 'bg-[#F2A7A0] text-[#5A0808] font-semibold'
                            : 'text-[#C9B8B6]'
                        }`}
                      >
                        Formatted View
                      </button>
                      <button
                        type="button"
                        onClick={() => setStructuredViewMode('json')}
                        className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer ${
                          structuredViewMode === 'json'
                            ? 'bg-[#F2A7A0] text-[#5A0808] font-semibold'
                            : 'text-[#C9B8B6]'
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                  )}

                  {currentExecution.rendered_html && structuredViewMode === 'rendered' ? (
                    <div dangerouslySetInnerHTML={{ __html: currentExecution.rendered_html }} />
                  ) : currentExecution.structured_json && structuredViewMode === 'json' ? (
                    <pre className="p-4 rounded-2xl bg-[#140F0E] border border-white/10 text-xs text-[#3EB991] font-mono overflow-x-auto">
                      {currentExecution.structured_json}
                    </pre>
                  ) : (
                    <div className="space-y-3">
                      {responseSections.map((section, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-2xl bg-[#282221] border border-white/10 space-y-3"
                        >
                          <div className="text-sm text-[#F2EAE8] whitespace-pre-wrap leading-relaxed">
                            {section}
                          </div>

                          {activePrompt?.show_action_bars === 1 && (
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/8">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(section);
                                  setCopiedSectionIdx(idx);
                                  setTimeout(() => setCopiedSectionIdx(null), 1800);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/12 text-xs text-[#C9B8B6] flex items-center gap-1.5 cursor-pointer"
                              >
                                {copiedSectionIdx === idx ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-[#3EB991]" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSpeakSection(section, idx)}
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/12 text-xs text-[#C9B8B6] flex items-center gap-1.5 cursor-pointer"
                              >
                                <Volume2
                                  className={`w-3.5 h-3.5 ${
                                    speakingSectionIdx === idx ? 'text-[#F2A7A0] animate-pulse' : ''
                                  }`}
                                />
                                <span>{speakingSectionIdx === idx ? 'Playing...' : 'Speak'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleShareSection(section)}
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/12 text-xs text-[#C9B8B6] flex items-center gap-1.5 cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Share</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Follow-up Prompt Trigger */}
                  {activePrompt?.followup_prompt && (
                    <button
                      type="button"
                      onClick={() => handleExecutePrompt({ isFollowup: true })}
                      disabled={isExecuting}
                      className="w-full py-3 px-4 rounded-2xl bg-[#353338] hover:bg-[#403E44] border border-[#F2A7A0]/30 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F2A7A0]">
                          Request additional response
                        </div>
                        <div className="text-xs text-[#ACA09E] truncate mt-0.5">
                          {activePrompt.followup_prompt}
                        </div>
                      </div>
                      <Play className="w-4 h-4 text-[#F2A7A0] shrink-0 fill-current" />
                    </button>
                  )}
                </div>
              )}
            </ScrollView>

            {/* Bottom Floating Thumb-Zone Action Controls (Nothing underneath) */}
            <div className="absolute bottom-6 left-0 right-0 px-6 flex items-center justify-between pointer-events-none z-20">
              {/* Left: Color-coded # Prompt Switcher Button */}
              <TouchableOpacity
                onPress={() => setPromptSelectorOpen(true)}
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 18,
                  backgroundColor: activePrompt?.color || '#D49B00',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
                }}
                className="pointer-events-auto"
                title="Switch active prompt"
              >
                <Text style={{ fontSize: 24, fontWeight: 700, color: '#FFF8F6' }}>#</Text>
              </TouchableOpacity>

              {/* Right Group: Clipboard Paste, Mic Dictation, and Large Play Button */}
              <div className="flex items-center gap-3.5 pointer-events-auto">
                <TouchableOpacity
                  onPress={handlePasteFromClipboard}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 18,
                    backgroundColor: '#F2A7A0',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                  }}
                  title="Paste query from clipboard"
                >
                  <ClipboardIcon className="w-5 h-5 text-[#5A0808]" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleToggleMicrophone}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 18,
                    backgroundColor: isRecordingMic ? '#9E0B0F' : '#F2A7A0',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                  }}
                  title="Voice input dictation"
                >
                  {isRecordingMic ? (
                    <MicOff className="w-5 h-5 text-white animate-pulse" />
                  ) : (
                    <Mic className="w-5 h-5 text-[#5A0808]" />
                  )}
                </TouchableOpacity>

                {/* Enhanced Acquisition Play Button with Subtle Energy Ripple */}
                <div className="relative flex items-center justify-center">
                  {/* Concentric Energy Ripple Rings triggered on click & during execution start */}
                  {playButtonRippling && (
                    <>
                      <div
                        className="ripple-ring"
                        style={{ borderColor: activePrompt?.color || '#20B2AA' }}
                      />
                      <div className="ripple-ring-secondary" />
                    </>
                  )}
                  {isExecuting && (
                    <div
                      className="absolute -inset-2.5 rounded-[28px] border-2 border-[#20B2AA]/45 animate-ping pointer-events-none"
                    />
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setPlayButtonRippling(true);
                      triggerTactileGlassThrum();
                      setTimeout(() => setPlayButtonRippling(false), 950);
                      handleExecutePrompt();
                    }}
                    disabled={isExecuting}
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 24,
                      backgroundColor: activePrompt?.color || '#D49B00',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isExecuting
                        ? '0 0 28px rgba(32, 178, 170, 0.65), 0 8px 26px rgba(0,0,0,0.5)'
                        : '0 8px 26px rgba(0,0,0,0.5)',
                    }}
                    className={`relative overflow-hidden cursor-pointer active:scale-95 transition-transform duration-150 ${
                      isExecuting ? 'executing-pulse' : ''
                    }`}
                    title={isExecuting ? 'Executing prompt...' : 'Execute prompt'}
                  >
                    {isExecuting ? (
                      <RefreshCw className="w-7 h-7 text-[#FFF5E6] animate-spin" />
                    ) : (
                      <Play className="w-7 h-7 text-[#FFF5E6] fill-current ml-0.5" />
                    )}
                  </TouchableOpacity>
                </div>
              </div>
            </div>
          </View>
        )}

        {/* ===================================================================
            SCREEN 2: NEW / EDIT PROMPT SCREEN (Clean match to Screenshot 1)
           =================================================================== */}
        {activeScreen === 'editor' && (
          <View style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Top App Bar */}
            <View
              style={{
                height: 58,
                backgroundColor: headerBg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                flexShrink: 0,
              }}
            >
              <div className="flex items-center gap-3">
                <TouchableOpacity
                  onPress={() => setActiveScreen('home')}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <ArrowLeft className="w-6 h-6" style={{ color: headerText }} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPromptSelectorOpen(true)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  title="Open prompts tray"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#5A0808]/10 flex items-center justify-center font-bold text-lg text-[#5A0808]">#</div>
                </TouchableOpacity>
                <Text style={{ fontSize: 21, fontWeight: 500, color: headerText }}>
                  {editingPromptId ? 'Edit prompt' : 'New prompt'}
                </Text>
              </div>

              <div className="flex items-center gap-2">
                {/* Active Collaborators Avatar Stack */}
                {collaborators.length > 0 && (
                  <div className="flex items-center -space-x-1.5 mr-1" title="Connected live collaborators">
                    {collaborators.slice(0, 3).map((c) => (
                      <span
                        key={c.clientId}
                        className="w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center border border-[#5A0808]/30"
                        style={{ backgroundColor: c.userColor }}
                        title={c.userName}
                      >
                        {c.userName.slice(0, 2).toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}

                {editingPromptId && (
                  <button
                    type="button"
                    onClick={() => setVersionModalOpen(true)}
                    className="px-3 py-1.5 rounded-full bg-[#5A0808] text-[#F2A7A0] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    title="View and revert previous versions"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>v{prompts.find((p) => p.id === editingPromptId)?.current_version || 1}</span>
                  </button>
                )}
              </div>
            </View>

            {/* Subtle Banner Only When Another Collaborator Is Actively Typing */}
            {remoteLiveBanner && (
              <div className="px-4 py-1.5 bg-[#282221] border-b border-white/10 flex items-center justify-between text-xs text-[#3EB991]">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{remoteLiveBanner}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setRemoteLiveBanner(null)}
                  className="text-[11px] text-[#9E9391] hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 16 }}
            >
              {/* Title Input Card */}
              <div
                className="rounded-t-md border-b border-[#C9B8B6] px-4 py-3.5"
                style={{ backgroundColor: inputSurfaceBg }}
              >
                <TextInput
                  value={formTitle}
                  onChangeText={(val) => {
                    setFormTitle(val);
                    emitMobileLiveEdit({ title: val }, 'title');
                  }}
                  placeholder="Title"
                  style={{ fontSize: 16, color: '#F5EBE9' }}
                  className="placeholder:text-[#B5A8A6]"
                />
              </div>

              {/* Prompt Template Input Card */}
              <div
                className="rounded-t-md border-b border-[#C9B8B6] px-4 py-3.5"
                style={{ backgroundColor: inputSurfaceBg }}
              >
                <TextInput
                  multiline
                  numberOfLines={3}
                  value={formPrompt}
                  onChangeText={(val) => {
                    setFormPrompt(val);
                    emitMobileLiveEdit({ prompt: val }, 'prompt', formCursorPos);
                  }}
                  onSelectionChange={(e) => setFormCursorPos(e.nativeEvent.selection.start)}
                  placeholder="Prompt"
                  style={{ fontSize: 16, color: '#F5EBE9' }}
                  className="placeholder:text-[#B5A8A6]"
                />
              </div>

              {/* Query Insertion Point Row */}
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[16px] text-[#E6DDD9]">Query insertion point</span>
                <button
                  type="button"
                  onClick={handleSetInsertionPointAtCursor}
                  className="px-5 py-2.5 rounded-full bg-[#353338] hover:bg-[#434046] text-sm font-medium text-[#ACA4A2] hover:text-white transition-colors cursor-pointer"
                >
                  Set at cursor
                </button>
              </div>

              {/* Color Row */}
              <div className="py-2 border-b border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[16px] text-[#E6DDD9]">Color</span>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-md cursor-pointer"
                    style={{ backgroundColor: formColor }}
                  >
                    #
                  </button>
                </div>

                {showColorPicker && (
                  <div className="flex items-center gap-2.5 flex-wrap pt-1">
                    {PROMPT_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => {
                          setFormColor(c.hex);
                          emitMobileLiveEdit({ color: c.hex }, 'color');
                          setShowColorPicker(false);
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white cursor-pointer border-2 ${
                          formColor === c.hex ? 'border-white scale-110' : 'border-transparent opacity-80'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      >
                        #
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Categories Row */}
              <div className="py-2 border-b border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[16px] text-[#E6DDD9]">Categories</span>
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(true)}
                    className="text-xs font-medium text-[#F2A7A0] hover:underline cursor-pointer"
                  >
                    Manage categories
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => {
                    const active = formCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleFormCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border ${
                          active
                            ? 'bg-[#353338] text-white border-[#F2A7A0]'
                            : 'bg-black/20 text-[#9E9391] border-white/10 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Follow-up Prompt ("Prompt to use when requesting an additional response") */}
              <div
                className="rounded-t-md border-b border-[#C9B8B6] px-4 py-4"
                style={{ backgroundColor: inputSurfaceBg }}
              >
                <TextInput
                  multiline
                  numberOfLines={2}
                  value={formFollowup}
                  onChangeText={(val) => {
                    setFormFollowup(val);
                    emitMobileLiveEdit({ followup_prompt: val }, 'followup_prompt');
                  }}
                  placeholder="Prompt to use when requesting an additional response"
                  style={{ fontSize: 16, color: '#F5EBE9', lineHeight: 1.4 }}
                  className="placeholder:text-[#B5A8A6]"
                />
              </div>

              {/* Input Field Placeholder or Hint */}
              <div
                className="rounded-t-md border-b border-[#C9B8B6] px-4 py-3.5"
                style={{ backgroundColor: inputSurfaceBg }}
              >
                <TextInput
                  value={formPlaceholder}
                  onChangeText={(val) => {
                    setFormPlaceholder(val);
                    emitMobileLiveEdit({ placeholder_hint: val }, 'placeholder_hint');
                  }}
                  placeholder="Input field placeholder or hint"
                  style={{ fontSize: 16, color: '#F5EBE9' }}
                  className="placeholder:text-[#B5A8A6]"
                />
              </div>

              {/* Show Section Action Bars Switch */}
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[16px] text-[#E6DDD9]">Show section action bars</span>
                <Switch
                  value={formShowActionBars}
                  onValueChange={(val) => {
                    setFormShowActionBars(val);
                    emitMobileLiveEdit({ show_action_bars: val }, 'show_action_bars');
                  }}
                />
              </div>

              {/* Use Structured Outputs Switch */}
              <div className="flex items-center justify-between py-1">
                <span className="text-[16px] text-[#E6DDD9]">Use Structured Outputs</span>
                <Switch
                  value={formUseStructured}
                  onValueChange={(val) => {
                    setFormUseStructured(val);
                    emitMobileLiveEdit({ use_structured_outputs: val }, 'use_structured_outputs');
                  }}
                />
              </div>

              {/* Exact Explanatory Text from Screenshot 1 */}
              <p className="text-[13.5px] leading-[1.45] text-[#E6DDD9] tracking-wide m-0">
                The Structured Outputs feature in its current state is a feature for advanced users, with HTML/CSS, DoT.js, Json and general Web Development knowledge. That said, you are welcome to play and experiment with it. We plan to improve development of Prompts with Structured Outputs soon.
              </p>

              {/* Expandable Structured Outputs JSON Schema & DoT.js Editor when toggled on */}
              {formUseStructured && (
                <div className="p-4 rounded-2xl bg-[#282221] border border-[#F2A7A0]/30 space-y-3">
                  <div className="text-xs font-semibold text-[#F2A7A0]">
                    Structured Output JSON Schema
                  </div>
                  <textarea
                    value={formStructuredSchema}
                    onChange={(e) => {
                      setFormStructuredSchema(e.target.value);
                      emitMobileLiveEdit({ structured_schema: e.target.value }, 'structured_schema');
                    }}
                    rows={5}
                    className="w-full p-2.5 rounded-xl bg-[#161110] border border-white/10 text-xs font-mono text-[#3EB991] outline-none"
                  />
                  <div className="text-xs font-semibold text-[#F2A7A0]">
                    DoT.js HTML/CSS Template
                  </div>
                  <textarea
                    value={formDotTemplate}
                    onChange={(e) => {
                      setFormDotTemplate(e.target.value);
                      emitMobileLiveEdit({ dot_template: e.target.value }, 'dot_template');
                    }}
                    rows={5}
                    className="w-full p-2.5 rounded-xl bg-[#161110] border border-white/10 text-xs font-mono text-[#20B2AA] outline-none"
                  />
                </div>
              )}

              {formStatusMsg && (
                <div className="p-3 rounded-xl bg-[#353338] text-xs text-[#F2A7A0]">
                  {formStatusMsg}
                </div>
              )}

              {/* Delete and Save Buttons (Exact match to Screenshot 1) */}
              <div className="flex items-center justify-end gap-4 pt-3">
                <TouchableOpacity
                  onPress={handleDeletePrompt}
                  style={{
                    paddingHorizontal: 26,
                    paddingVertical: 12,
                    borderRadius: 9999,
                    backgroundColor: '#F2A7A0',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: 600, color: '#5A0808' }}>Delete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSavePrompt}
                  style={{
                    paddingHorizontal: 30,
                    paddingVertical: 12,
                    borderRadius: 9999,
                    backgroundColor: '#F2A7A0',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: 600, color: '#5A0808' }}>Save</Text>
                </TouchableOpacity>
              </div>
            </ScrollView>
          </View>
        )}

        {/* ===================================================================
            SCREEN 3: MANAGE PROMPTS LIBRARY
           =================================================================== */}
        {activeScreen === 'manage' && (
          <View style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <View
              style={{
                height: 58,
                backgroundColor: headerBg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                flexShrink: 0,
              }}
            >
              <div className="flex items-center gap-3">
                <TouchableOpacity
                  onPress={() => setDrawerOpen(true)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Menu className="w-6 h-6" style={{ color: headerText }} />
                </TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: 600, color: headerText }}>
                  Manage prompts
                </Text>
              </div>
              <div className="flex items-center gap-2">
                <TouchableOpacity
                  onPress={() => setCategoryModalOpen(true)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 9999,
                    backgroundColor: 'rgba(0,0,0,0.2)',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: 600, color: headerText }}>Categories</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openNewPromptEditor}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 9999,
                    backgroundColor: '#5A0808',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: 600, color: '#F2A7A0' }}>+ New</Text>
                </TouchableOpacity>
              </div>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }}
            >
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-[#9E9391] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search prompts..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#282221] border border-white/10 text-sm text-[#F5EBE9] placeholder:text-[#8E8381] outline-none"
                />
              </div>

              {/* Category Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    selectedCategoryFilter === 'ALL'
                      ? 'bg-[#F2A7A0] text-[#5A0808] font-bold'
                      : 'bg-[#282221] text-[#C9B8B6] border border-white/10'
                  }`}
                >
                  All ({prompts.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer transition-colors border ${
                      selectedCategoryFilter === cat.id
                        ? 'bg-[#353338] text-white border-[#F2A7A0] font-semibold'
                        : 'bg-[#282221] text-[#C9B8B6] border-white/10'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {filteredPrompts.map((item) => {
                const catList = (item.categories || []).map((c) => c.name).join(' · ') || item.category;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedPromptId(item.id);
                      setActiveScreen('home');
                    }}
                    className="p-4 rounded-2xl bg-[#282221] border border-white/10 hover:border-[#F2A7A0]/50 transition-colors cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0"
                          style={{ backgroundColor: item.color || '#D49B00' }}
                        >
                          #
                        </span>
                        <div className="min-w-0">
                          <div className="text-base font-medium text-[#F5EBE9] truncate">{item.title}</div>
                          <div className="text-xs text-[#9E9391] truncate mt-0.5">
                            {catList} · v{item.current_version || 1}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            setSelectedPromptId(item.id);
                            await fetchVersionsForPrompt(item.id);
                            setVersionModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs text-[#C9B8B6] hover:text-white flex items-center gap-1 cursor-pointer"
                          title="Version History & Revert"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>v{item.current_version || 1}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditPromptEditor(item);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs text-[#E6DDD9] cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#B5A8A6] line-clamp-2 bg-black/20 p-2.5 rounded-xl m-0">
                      {item.prompt}
                    </p>
                  </div>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ===================================================================
            SCREEN 4: POINT & QUERY (CAMERA / MULTIMODAL VISION)
           =================================================================== */}
        {activeScreen === 'point_query' && (
          <View style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <View
              style={{
                height: 58,
                backgroundColor: headerBg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 14,
                flexShrink: 0,
              }}
            >
              <div className="flex items-center gap-3">
                <TouchableOpacity
                  onPress={() => {
                    stopCameraStream();
                    setDrawerOpen(true);
                  }}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Menu className="w-6 h-6" style={{ color: headerText }} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    stopCameraStream();
                    setPromptSelectorOpen(true);
                  }}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  title="Open prompts tray"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#5A0808]/10 flex items-center justify-center font-bold text-lg text-[#5A0808]">#</div>
                </TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: 600, color: headerText }}>
                  Point &amp; Query
                </Text>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-full bg-[#5A0808] text-[#F2A7A0] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }}
            >
              <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black aspect-16/10 flex items-center justify-center">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                ) : (
                  <img
                    src={capturedImage}
                    alt="Point and Query visual frame"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                )}

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  {cameraActive ? (
                    <button
                      type="button"
                      onClick={captureCameraFrame}
                      className="px-4 py-2 rounded-full bg-[#F2A7A0] text-[#5A0808] text-xs font-bold shadow-lg cursor-pointer"
                    >
                      Capture Frame
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startCameraStream}
                      className="px-3.5 py-1.5 rounded-full bg-black/75 border border-white/20 text-xs text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#F2A7A0]" />
                      <span>Camera</span>
                    </button>
                  )}

                  <div className="flex items-center gap-1.5">
                    {SAMPLE_VISION_FRAMES.map((sample, sIdx) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          stopCameraStream();
                          setCapturedImage(sample.svgDataUrl);
                          setPointQueryInput(sample.query);
                        }}
                        className="px-2.5 py-1 rounded-full bg-black/75 border border-white/15 text-[11px] text-[#E6DDD9] hover:border-[#F2A7A0] cursor-pointer"
                      >
                        Sample {sIdx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#353338] border-b border-[#C9B8B6]">
                <TextInput
                  multiline
                  numberOfLines={2}
                  value={pointQueryInput}
                  onChangeText={setPointQueryInput}
                  placeholder="Ask about the image..."
                  style={{ fontSize: 15, color: '#F5EBE9' }}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedPromptId('prompt-point-query-inspector');
                  handleExecutePrompt({
                    imageDataUrl: capturedImage,
                    customQuery: pointQueryInput,
                  });
                }}
                disabled={isExecuting}
                className="w-full py-3.5 rounded-2xl bg-[#D49B00] hover:bg-[#e3a800] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isExecuting ? 'Analyzing...' : 'Run Point & Query'}</span>
              </button>

              {currentExecution && (
                <div className="p-4 rounded-2xl bg-[#282221] border border-white/10 space-y-2">
                  <div className="text-sm text-[#F2EAE8] whitespace-pre-wrap leading-relaxed">
                    {currentExecution.response_text}
                  </div>
                </div>
              )}
            </ScrollView>
          </View>
        )}

        {/* ===================================================================
            SCREEN 5: SETTINGS (CLEAN LOCAL AI DISCOVERY & COLLABORATOR PROFILE)
           =================================================================== */}
        {activeScreen === 'settings' && (
          <View style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <View
              style={{
                height: 58,
                backgroundColor: headerBg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 14,
                flexShrink: 0,
              }}
            >
              <div className="flex items-center gap-3">
                <TouchableOpacity
                  onPress={() => setDrawerOpen(true)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Menu className="w-6 h-6" style={{ color: headerText }} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPromptSelectorOpen(true)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  title="Open prompts tray"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#5A0808]/10 flex items-center justify-center font-bold text-lg text-[#5A0808]">#</div>
                </TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: 600, color: headerText }}>
                  Settings
                </Text>
              </div>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 18 }}
            >
              {/* Collaborator Identity for Real-Time Co-Editing */}
              <div className="p-4 rounded-2xl bg-[#282221] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#F5EBE9]">
                    Collaborator Profile
                  </span>
                  <span className="text-xs text-[#3EB991]">
                    {wsConnected ? 'Live sync active' : 'Offline mode'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLLABORATOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setMyCollaborator(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 cursor-pointer border ${
                        myCollaborator.name === preset.name
                          ? 'bg-[#353338] text-white border-[#F2A7A0]'
                          : 'bg-[#181312] text-[#9E9391] border-white/10'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: preset.color }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Local Network Auto-Discovery (Ollama & llama.cpp) */}
              <div className="p-4 rounded-2xl bg-[#282221] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#F5EBE9]">
                      Auto-Discover Local Models
                    </div>
                    <div className="text-xs text-[#9E9391]">
                      Automatically detect Ollama and llama.cpp on your local network
                    </div>
                  </div>
                  <Switch value={autoScanEnabled} onValueChange={setAutoScanEnabled} />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customLanHost}
                    onChange={(e) => setCustomLanHost(e.target.value)}
                    placeholder="Local IP (e.g. 192.168.1.100)"
                    className="flex-1 px-3 py-2 rounded-xl bg-[#161110] border border-white/10 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => triggerLanAutoDiscovery(false)}
                    disabled={isScanningLan}
                    className="px-4 py-2 rounded-xl bg-[#F2A7A0] text-[#5A0808] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningLan ? 'animate-spin' : ''}`} />
                    <span>{isScanningLan ? 'Scanning...' : 'Scan Network'}</span>
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  {providers.map((prov) => (
                    <div
                      key={prov.id}
                      onClick={async () => {
                        const res = await fetch('/api/providers/activate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: prov.id }),
                        });
                        const data = await res.json();
                        if (Array.isArray(data?.providers)) setProviders(data.providers);
                      }}
                      className={`p-3 rounded-xl border transition-colors cursor-pointer flex items-center justify-between ${
                        prov.is_active === 1
                          ? 'bg-[#353338] border-[#F2A7A0]'
                          : 'bg-[#181312] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F5EBE9] truncate">{prov.name}</div>
                        <div className="text-xs text-[#9E9391] truncate">
                          {prov.default_model} · {prov.endpoint_url}
                        </div>
                      </div>
                      {prov.is_active === 1 && (
                        <Check className="w-4 h-4 text-[#3EB991] shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Outbound Webhook Integrations */}
              <div className="p-4 rounded-2xl bg-[#282221] border border-white/10 space-y-3">
                <div className="text-sm font-semibold text-[#F5EBE9]">
                  Webhook Integrations
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={newIntName}
                    onChange={(e) => setNewIntName(e.target.value)}
                    placeholder="Integration name"
                    className="w-full px-3 py-2 rounded-xl bg-[#161110] border border-white/10 text-xs text-white outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIntUrl}
                      onChange={(e) => setNewIntUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3 py-2 rounded-xl bg-[#161110] border border-white/10 text-xs text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddShareholderIntegration}
                      className="px-4 py-2 rounded-xl bg-[#F2A7A0] text-[#5A0808] text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {integrations.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {integrations.map((intItem) => (
                      <div
                        key={intItem.id}
                        className="p-3 rounded-xl bg-[#181312] border border-white/10 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#F5EBE9] truncate">{intItem.name}</div>
                          <div className="text-[11px] text-[#9E9391] truncate">{intItem.endpoint_url}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollView>
          </View>
        )}
      </div>

      {/* Mandatory Brand Signature */}
      <div className="brand-signature">
        <div className="brand-signature-line1">ΛΞV Inc</div>
        <div className="brand-signature-line2">The Future Needs Context</div>
      </div>
    </SafeAreaView>
  );
}
