import React from 'react';
import { motion } from 'motion/react';

export type WorkspaceTab =
  | 'console'
  | 'security'
  | 'ingestion'
  | 'aiml'
  | 'ablation'
  | 'architecture';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onRunVerification: () => void;
  isVerifying: boolean;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'console', label: 'Ask Questions' },
  { id: 'ingestion', label: 'Policy Library' },
  { id: 'aiml', label: 'AI & ML Process' },
  { id: 'security', label: 'Privacy Guard' },
  { id: 'ablation', label: 'Accuracy Tests' },
  { id: 'architecture', label: 'About' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onRunVerification,
  isVerifying,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#091120]/95 backdrop-blur-md border-b border-slate-800/90 text-white">
      <div className="max-w-[1320px] mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <button
          type="button"
          onClick={() => onSelectTab('console')}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          LexGate
        </button>

        <nav className="hidden md:flex items-center gap-5 lg:gap-7 h-full" aria-label="Workspace sections">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative h-full flex items-center text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="topbar-active-underline"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-blue-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onRunVerification}
            disabled={isVerifying}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-xs whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          >
            {isVerifying ? 'Checking Safety...' : 'Run Safety Checks'}
          </button>
        </div>
      </div>

      {/* Mobile navigation strip */}
      <div className="md:hidden border-t border-slate-800 px-4 py-2 flex items-center gap-4 overflow-x-auto bg-[#0b1426]">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 ${
                active ? 'text-blue-400 font-semibold' : 'text-slate-300'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
