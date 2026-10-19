import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  Radio,
  History,
  RotateCcw,
  Save,
  Sparkles,
  Check,
  Tag,
} from 'lucide-react';
import {
  CollaboratorPresence,
  getCollabWebSocketUrl,
  LivePromptDraftPayload,
} from '../services/collaborationClient.ts';
import type { CategoryItem, PromptItem, PromptVersionItem } from '../App.tsx';

interface LivePeerCoEditorProps {
  activeRoomId: string;
  activePrompt: PromptItem | null;
  categories: CategoryItem[];
  versions: PromptVersionItem[];
  onTriggerOpenEditorInMobile: (promptItem: PromptItem) => void;
  onVersionReverted: (prompt: PromptItem, versions: PromptVersionItem[], allPrompts: PromptItem[]) => void;
}

export const LivePeerCoEditor: React.FC<LivePeerCoEditorProps> = ({
  activeRoomId,
  activePrompt,
  categories,
  versions,
  onTriggerOpenEditorInMobile,
  onVersionReverted,
}) => {
  const [peerConnected, setPeerConnected] = useState(false);
  const [peerClientId] = useState(() => `peer-coeditor-${Math.random().toString(36).slice(2, 7)}`);
  const [peerName, setPeerName] = useState('M. Chen (Co-Editor Peer)');
  const [peerColor] = useState('#3EB991');

  const [draftTitle, setDraftTitle] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftFollowup, setDraftFollowup] = useState('');
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [lastRemoteActor, setLastRemoteActor] = useState<string | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteUpdateRef = useRef(false);

  // Sync baseline when activePrompt changes
  useEffect(() => {
    if (!activePrompt) return;
    isRemoteUpdateRef.current = true;
    setDraftTitle(activePrompt.title);
    setDraftPrompt(activePrompt.prompt);
    setDraftFollowup(activePrompt.followup_prompt || '');
    setDraftCategoryIds(activePrompt.category_ids || []);
    setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 30);
  }, [activePrompt?.id, activePrompt?.current_version]);

  // Real independent WebSocket connection to /ws/collab
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      ws = new WebSocket(getCollabWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setPeerConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'collab:join',
            clientId: peerClientId,
            userName: peerName,
            userColor: peerColor,
            roomId: activeRoomId,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            (data.type === 'prompt:live_edit' || data.type === 'prompt:live_state') &&
            data.roomId === activeRoomId &&
            data.editorClientId !== peerClientId &&
            data.draft
          ) {
            isRemoteUpdateRef.current = true;
            setDraftTitle(data.draft.title ?? '');
            setDraftPrompt(data.draft.prompt ?? '');
            setDraftFollowup(data.draft.followup_prompt ?? '');
            if (Array.isArray(data.draft.category_ids)) {
              setDraftCategoryIds(data.draft.category_ids);
            }
            if (data.editorName) {
              setLastRemoteActor(`${data.editorName} editing ${data.focusedField || 'prompt'}`);
            }
            setTimeout(() => {
              isRemoteUpdateRef.current = false;
            }, 25);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setPeerConnected(false);
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, 1800);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [activeRoomId, peerClientId, peerName, peerColor]);

  // Notify room switches
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'collab:join',
          clientId: peerClientId,
          userName: peerName,
          userColor: peerColor,
          roomId: activeRoomId,
        })
      );
    }
  }, [activeRoomId, peerClientId, peerName, peerColor]);

  function broadcastPeerEdit(
    nextTitle: string,
    nextPrompt: string,
    nextFollowup: string,
    nextCategoryIds: string[],
    focusedField: string,
    cursorPos = 0
  ) {
    if (isRemoteUpdateRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload: LivePromptDraftPayload = {
        roomId: activeRoomId,
        title: nextTitle,
        prompt: nextPrompt,
        insertion_point: activePrompt?.insertion_point ?? -1,
        color: activePrompt?.color ?? '#D49B00',
        followup_prompt: nextFollowup,
        placeholder_hint: activePrompt?.placeholder_hint ?? 'Tap play to generate',
        show_action_bars: Boolean(activePrompt?.show_action_bars ?? 1),
        use_structured_outputs: Boolean(activePrompt?.use_structured_outputs ?? 0),
        structured_schema: activePrompt?.structured_schema ?? '',
        dot_template: activePrompt?.dot_template ?? '',
        category_ids: nextCategoryIds,
      };
      wsRef.current.send(
        JSON.stringify({
          type: 'prompt:live_edit',
          roomId: activeRoomId,
          draft: payload,
          focusedField,
          cursorPos,
        })
      );
    }
  }

  async function handleCommitVersionFromPeer() {
    if (!activePrompt || !draftTitle.trim() || !draftPrompt.trim()) return;
    setSavingVersion(true);
    try {
      const res = await fetch(`/api/prompts/${activePrompt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim(),
          prompt: draftPrompt,
          followup_prompt: draftFollowup,
          category_ids: draftCategoryIds,
          commit_message: commitMsg.trim() || `Collaborative update by ${peerName}`,
          author_name: peerName,
        }),
      });
      const data = await res.json();
      if (data?.prompt) {
        setCommitMsg('');
      }
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleRevertVersion(versionId: string) {
    if (!activePrompt) return;
    setRevertingId(versionId);
    try {
      const res = await fetch(`/api/prompts/${activePrompt.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          authorName: peerName,
        }),
      });
      const data = await res.json();
      if (data?.prompt && Array.isArray(data?.versions)) {
        onVersionReverted(data.prompt, data.versions, data.prompts || []);
      }
    } finally {
      setRevertingId(null);
    }
  }

  function toggleCategoryInPeer(catId: string) {
    const exists = draftCategoryIds.includes(catId);
    const next = exists
      ? draftCategoryIds.filter((id) => id !== catId)
      : [...draftCategoryIds, catId];
    setDraftCategoryIds(next);
    broadcastPeerEdit(draftTitle, draftPrompt, draftFollowup, next, 'categories');
  }

  return (
    <div className="p-6 rounded-3xl glass-pane flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Radio
              className={`w-4 h-4 ${
                peerConnected ? 'text-[#3EB991] animate-pulse' : 'text-[#9E9391]'
              }`}
            />
            <h2 className="text-base font-bold text-[#F5EBE9] font-display">
              Real-Time WebSocket Co-Editor &amp; Version Control
            </h2>
          </div>
          <p className="text-xs text-[#9E9391]">
            Connected via <code className="text-[#3EB991]">/ws/collab</code> to room{' '}
            <code className="text-[#F2A7A0]">{activeRoomId}</code>. Edits here or in another browser tab sync
            instantly with the React Native mobile screen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={peerName}
            onChange={(e) => setPeerName(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#140F0E] border border-white/10 text-xs text-[#3EB991] font-medium outline-none w-48"
            title="Collaborator Display Name"
          />
          {activePrompt && (
            <button
              type="button"
              onClick={() => onTriggerOpenEditorInMobile(activePrompt)}
              className="px-3 py-1.5 rounded-xl bg-[#F2A7A0]/15 hover:bg-[#F2A7A0]/25 text-xs font-semibold text-[#F2A7A0] cursor-pointer whitespace-nowrap"
            >
              Open Editor on Mobile
            </button>
          )}
        </div>
      </div>

      {lastRemoteActor && (
        <div className="px-3.5 py-2 rounded-xl bg-[#353338]/70 border border-[#F2A7A0]/30 flex items-center justify-between text-xs">
          <span className="text-[#F2A7A0] font-medium flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            <span>Live WebSocket Stream: {lastRemoteActor}</span>
          </span>
          <span className="text-[11px] font-mono text-[#9E9391]">Delta Reconciled</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Live Collaborative Prompt Buffer */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#C9B8B6]">
            <span className="font-semibold">Live Collaborative Buffer ({peerName})</span>
            <span className="font-mono text-[#3EB991]">
              v{activePrompt?.current_version || 1}
            </span>
          </div>

          <input
            type="text"
            value={draftTitle}
            onChange={(e) => {
              const val = e.target.value;
              setDraftTitle(val);
              broadcastPeerEdit(val, draftPrompt, draftFollowup, draftCategoryIds, 'title', e.target.selectionStart || 0);
            }}
            placeholder="Collaborative Prompt Title"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#140F0E] border border-white/10 focus:border-[#3EB991] text-sm text-[#F5EBE9] outline-none"
          />

          <textarea
            rows={4}
            value={draftPrompt}
            onChange={(e) => {
              const val = e.target.value;
              setDraftPrompt(val);
              broadcastPeerEdit(draftTitle, val, draftFollowup, draftCategoryIds, 'prompt', e.target.selectionStart || 0);
            }}
            placeholder="Type here to stream real-time edits over WebSockets to all collaborators..."
            className="w-full p-3.5 rounded-xl bg-[#140F0E] border border-white/10 focus:border-[#3EB991] text-xs font-mono text-[#E6DDD9] leading-relaxed outline-none resize-none"
          />

          {/* Multi-Category Assignment Bar */}
          <div className="space-y-1.5">
            <div className="text-[11px] text-[#9E9391] flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-[#F2A7A0]" />
              <span>Assigned Categories (Multi-select synced live):</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const selected = draftCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategoryInPeer(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selected
                        ? 'bg-[#2C2423] text-white border-[#F2A7A0]'
                        : 'bg-[#140F0E] text-[#9E9391] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                    {selected && <Check className="w-3 h-3 text-[#3EB991]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Commit New Version Row */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Version commit note (e.g. Refined output rubric)..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#140F0E] border border-white/10 text-xs text-white outline-none"
            />
            <button
              type="button"
              onClick={handleCommitVersionFromPeer}
              disabled={savingVersion || !activePrompt}
              className="px-4 py-2 rounded-xl bg-[#3EB991] hover:bg-[#4cd1a5] text-[#0E1F18] text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingVersion ? 'Saving...' : 'Save New Version'}</span>
            </button>
          </div>
        </div>

        {/* Right: Version History Timeline & One-Click Revert */}
        <div className="space-y-3 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#C9B8B6]">
            <span className="font-semibold flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#F2A7A0]" />
              <span>Version Control History ({versions.length} snapshots)</span>
            </span>
            <span className="text-[11px] text-[#9E9391]">Immutable SQLite Audit Log</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[255px] pr-1">
            {versions.map((ver, index) => {
              const isLatest = index === 0;
              return (
                <div
                  key={ver.id}
                  className={`p-3 rounded-2xl border transition-colors space-y-1.5 ${
                    isLatest
                      ? 'bg-[#282221] border-[#F2A7A0]/50'
                      : 'bg-[#140F0E] border-white/8 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-[#F2A7A0]/15 text-[#F2A7A0] font-mono text-xs font-bold">
                        v{ver.version_number}
                      </span>
                      <span className="text-xs font-semibold text-[#F5EBE9] truncate">
                        {ver.commit_message || `Version ${ver.version_number}`}
                      </span>
                    </div>

                    {!isLatest ? (
                      <button
                        type="button"
                        onClick={() => handleRevertVersion(ver.id)}
                        disabled={revertingId === ver.id}
                        className="px-2.5 py-1 rounded-lg bg-[#F2A7A0] hover:bg-[#f5b8b2] text-[#5A0808] text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{revertingId === ver.id ? 'Reverting...' : `Revert to v${ver.version_number}`}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-[#3EB991] shrink-0">ACTIVE HEAD</span>
                    )}
                  </div>

                  <div className="text-[11px] text-[#9E9391] flex items-center justify-between">
                    <span>Author: {ver.author_name}</span>
                    <span className="font-mono tabular-nums">
                      {new Date(ver.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-[#B5A8A6] line-clamp-2 bg-black/25 px-2.5 py-1.5 rounded-lg">
                    {ver.prompt}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
