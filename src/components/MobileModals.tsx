import React, { useState } from 'react';
import {
  X,
  Plus,
  Edit3,
  Trash2,
  Check,
  History,
  RotateCcw,
  Tag,
} from 'lucide-react';
import type { CategoryItem, PromptItem, PromptVersionItem } from '../App.tsx';

const CATEGORY_COLORS = [
  '#D49B00',
  '#F2A7A0',
  '#3EB991',
  '#20B2AA',
  '#6A0DAD',
  '#E05A47',
  '#4A90E2',
  '#FFD700',
];

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  onCategoriesUpdated: (categories: CategoryItem[], prompts?: PromptItem[]) => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onCategoriesUpdated,
}) => {
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#F2A7A0');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  function startEditCategory(cat: CategoryItem) {
    setEditingCatId(cat.id);
    setName(cat.name);
    setColor(cat.color || '#F2A7A0');
    setDescription(cat.description || '');
    setErrorMsg(null);
  }

  function resetForm() {
    setEditingCatId(null);
    setName('');
    setColor('#F2A7A0');
    setDescription('');
    setErrorMsg(null);
  }

  async function handleSaveCategory() {
    if (!name.trim()) {
      setErrorMsg('Category name is required.');
      return;
    }
    setErrorMsg(null);
    try {
      const res = await fetch(
        editingCatId ? `/api/categories/${editingCatId}` : '/api/categories',
        {
          method: editingCatId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            color,
            description: description.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save category');
      if (Array.isArray(data?.categories)) {
        onCategoriesUpdated(data.categories, data.prompts);
      }
      resetForm();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  async function handleDeleteCategory(id: string) {
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (Array.isArray(data?.categories)) {
        onCategoriesUpdated(data.categories, data.prompts);
      }
      if (editingCatId === id) resetForm();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col justify-end">
      <div className="bg-[#231C1B] border-t border-white/15 rounded-t-3xl p-5 max-h-[85%] flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#F2A7A0]" />
            <span className="text-base font-semibold text-[#F5EBE9]">
              Manage Prompt Categories
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/8 hover:bg-white/15 text-[#E6DDD9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create / Edit Category Form */}
        <div className="p-3.5 rounded-2xl bg-[#181312] border border-white/10 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-[#F2A7A0]">
            <span>{editingCatId ? 'Edit Category' : 'Create New Category'}</span>
            {editingCatId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[#9E9391] hover:text-white cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name (e.g. Security & Compliance)"
            className="w-full px-3 py-2 rounded-xl bg-[#282221] border border-white/10 text-xs text-white outline-none"
          />

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            className="w-full px-3 py-2 rounded-xl bg-[#282221] border border-white/10 text-xs text-[#D9CECC] outline-none"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {CATEGORY_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  className={`w-6 h-6 rounded-lg cursor-pointer border-2 ${
                    color === hex ? 'border-white scale-110' : 'border-transparent opacity-75'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleSaveCategory}
              className="px-4 py-1.5 rounded-xl bg-[#F2A7A0] text-[#5A0808] text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingCatId ? 'Update' : 'Add Category'}</span>
            </button>
          </div>

          {errorMsg && <div className="text-xs text-red-400">{errorMsg}</div>}
        </div>

        {/* Existing Categories List */}
        <div className="overflow-y-auto space-y-2 pr-1 flex-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-3 rounded-2xl bg-[#2B2423] border border-white/10 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#F5EBE9] truncate">
                    {cat.name}{' '}
                    <span className="text-xs text-[#9E9391] font-mono">
                      ({cat.prompt_count ?? 0})
                    </span>
                  </div>
                  {cat.description && (
                    <div className="text-[11px] text-[#9E9391] truncate">{cat.description}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEditCategory(cat)}
                  className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-[#E6DDD9] cursor-pointer"
                  title="Edit category"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-300 cursor-pointer"
                  title="Delete category"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptItem: PromptItem | null;
  versions: PromptVersionItem[];
  authorName: string;
  onVersionReverted: (prompt: PromptItem, versions: PromptVersionItem[], allPrompts: PromptItem[]) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  promptItem,
  versions,
  authorName,
  onVersionReverted,
}) => {
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [selectedVerId, setSelectedVerId] = useState<string | null>(null);

  if (!isOpen || !promptItem) return null;

  async function handleRevert(versionId: string) {
    if (!promptItem) return;
    setRevertingId(versionId);
    try {
      const res = await fetch(`/api/prompts/${promptItem.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          authorName,
        }),
      });
      const data = await res.json();
      if (data?.prompt && Array.isArray(data?.versions)) {
        onVersionReverted(data.prompt, data.versions, data.prompts || []);
        onClose();
      }
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col justify-end">
      <div className="bg-[#231C1B] border-t border-white/15 rounded-t-3xl p-5 max-h-[85%] flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-[#F2A7A0] shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-semibold text-[#F5EBE9] truncate">
                Version History · {promptItem.title}
              </div>
              <div className="text-[11px] text-[#9E9391]">
                {versions.length} saved versions · Tap any version to inspect or revert
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/8 hover:bg-white/15 text-[#E6DDD9] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
          {versions.map((ver, idx) => {
            const isLatest = idx === 0;
            const expanded = selectedVerId === ver.id || isLatest;
            let parsedCats: string[] = [];
            try {
              parsedCats = JSON.parse(ver.categories_json || '[]');
            } catch {
              parsedCats = [];
            }

            return (
              <div
                key={ver.id}
                onClick={() => setSelectedVerId(ver.id === selectedVerId ? null : ver.id)}
                className={`p-3.5 rounded-2xl border transition-colors cursor-pointer space-y-2 ${
                  isLatest
                    ? 'bg-[#2E2524] border-[#F2A7A0]'
                    : 'bg-[#181312] border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-[#F2A7A0] shrink-0">
                      v{ver.version_number}
                    </span>
                    <span className="text-white/25">·</span>
                    <span className="text-xs font-semibold text-[#F5EBE9] truncate">
                      {ver.commit_message || `Version ${ver.version_number}`}
                    </span>
                  </div>

                  {isLatest ? (
                    <span className="text-[11px] font-medium text-[#3EB991] shrink-0">
                      Current
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevert(ver.id);
                      }}
                      disabled={revertingId === ver.id}
                      className="px-2.5 py-1 rounded-lg bg-[#F2A7A0] hover:bg-[#f5b8b2] text-[#5A0808] text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{revertingId === ver.id ? 'Reverting...' : 'Revert'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#9E9391]">
                  <span>{ver.author_name}</span>
                  <span className="tabular-nums">
                    {new Date(ver.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {expanded && (
                  <div className="space-y-2 pt-1 border-t border-white/8">
                    <div className="text-xs font-medium text-[#E6DDD9]">
                      Title: <span className="text-[#F2A7A0]">{ver.title}</span>
                    </div>
                    <pre className="p-2.5 rounded-xl bg-black/35 text-[11px] font-mono text-[#D9CECC] whitespace-pre-wrap leading-relaxed m-0">
                      {ver.prompt}
                    </pre>
                    {parsedCats.length > 0 && (
                      <div className="text-[11px] text-[#3EB991]">
                        Categories: {parsedCats.join(' · ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
