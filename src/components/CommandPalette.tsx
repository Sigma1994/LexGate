import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Command, Search, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { WorkspaceTab } from './TopBar.tsx';

export interface PaletteAction {
  id: string;
  section: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, actions }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.section.toLowerCase().includes(q) ||
        (a.hint && a.hint.toLowerCase().includes(q))
    );
  }, [actions, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].run();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Quick actions menu"
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleKeyDown}
            className="relative w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a section, run safety checks, or manage sync..."
                className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
              />
              <kbd className="px-1.5 py-0.5 text-[11px] font-mono text-slate-500 bg-slate-100 rounded border border-slate-200 shrink-0">
                ESC
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No matching actions found.
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const selected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        item.run();
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        selected ? 'bg-slate-900 text-white' : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.section === 'Safety Checks' ? (
                          <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-blue-300' : 'text-blue-700'}`} />
                        ) : (
                          <Command className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        )}
                        <div className="truncate">
                          <span className="text-xs font-medium">{item.label}</span>
                          <span className={`ml-2 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                            {item.section}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.hint && (
                          <span className={`text-[11px] font-mono ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                            {item.hint}
                          </span>
                        )}
                        <ArrowRight className={`w-3 h-3 ${selected ? 'text-white' : 'text-slate-300'}`} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Use ↑ ↓ arrows and Enter to run</span>
              <span className="font-mono">⌘K / Ctrl+K</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  console: 'Ask Questions',
  ingestion: 'Policy Library',
  aiml: 'AI & ML Process',
  security: 'Privacy Guard',
  ablation: 'Accuracy Tests',
  architecture: 'About',
};
