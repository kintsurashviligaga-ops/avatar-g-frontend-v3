"use client";

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type SegmentedTabItem = {
  id: string;
  label: string;
};

type SegmentedTabsProps = {
  items: SegmentedTabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

type CompoundTabsProps = {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

type TabsProps = SegmentedTabsProps | CompoundTabsProps;

type LegacyTab = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

type TabsOldProps = {
  tabs: LegacyTab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
};

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: '', onValueChange: () => {} });

function isSegmentedTabsProps(props: TabsProps): props is SegmentedTabsProps {
  return 'items' in props;
}

function SegmentedTabs({ items, value, onChange, className }: SegmentedTabsProps) {
  return (
    <div className={cn('inline-flex rounded-xl border border-white/[0.09] bg-[linear-gradient(135deg,rgba(7,14,30,0.80),rgba(4,9,22,0.70))] backdrop-blur-xl p-1', className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
              active
                ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/20 text-white border border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.12)]'
                : 'text-white/45 hover:text-white/80 hover:bg-white/[0.07]'
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CompoundTabs({ children, defaultValue, value: controlledValue, onValueChange, className }: CompoundTabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '');
  const value = controlledValue ?? internalValue;

  const handleValueChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function Tabs(props: TabsProps) {
  if (isSegmentedTabsProps(props)) {
    return <SegmentedTabs {...props} />;
  }

  return <CompoundTabs {...props} />;
}

export function TabsOld({ tabs, defaultTab, onChange }: TabsOldProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab || tabs[0]?.id || '');

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div className="flex gap-2 rounded-xl border border-white/10 bg-[#050510] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => handleTabChange(tab.id)}
          className={cn(
            'relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeTab === tab.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
          )}
        >
          {activeTab === tab.id ? (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 rounded-lg bg-cyan-500/20"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          ) : null}
          <span className="relative z-10 flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex gap-2 rounded-xl border border-white/[0.09] bg-[linear-gradient(135deg,rgba(3,7,18,0.90),rgba(5,10,25,0.80))] backdrop-blur-xl p-1', className)}>{children}</div>;
}

export function TabsTrigger({
  children,
  value,
  className,
}: {
  children: React.ReactNode;
  value: string;
  className?: string;
}) {
  const { value: activeValue, onValueChange } = React.useContext(TabsContext);
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      onClick={() => onValueChange(value)}
      className={cn(
        'relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
        isActive ? 'text-white' : 'text-white/40 hover:text-white/75',
        className
      )}
    >
      {isActive ? (
        <motion.div
          layoutId="activeTabCompound"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/15 border border-cyan-400/25 shadow-[0_0_10px_rgba(34,211,238,0.10)]"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      ) : null}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function TabsContent({
  children,
  value,
  className,
}: {
  children: React.ReactNode;
  value: string;
  className?: string;
}) {
  const { value: activeValue } = React.useContext(TabsContext);
  if (activeValue !== value) return null;
  return <div className={className}>{children}</div>;
}
