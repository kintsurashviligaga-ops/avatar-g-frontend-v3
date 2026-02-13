"use client"

import { createContext, useContext, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface Tab {
  id: string
  label: string
  icon?: React.ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  onChange?: (tabId: string) => void
}

// Legacy Tabs component (keep for backward compatibility)
export function TabsOld({ tabs, defaultTab, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    onChange?.(tabId)
  }

  return (
    <div className="flex gap-2 p-1 bg-[#05070A] rounded-xl border border-white/10">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => handleTabChange(tab.id)}
          className={cn(
            "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === tab.id ? "text-white" : "text-gray-500 hover:text-gray-300"
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-cyan-500/20 rounded-lg"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// New compound component pattern
const TabsContext = createContext<{
  value: string
  onValueChange: (value: string) => void
}>({ value: "", onValueChange: () => {} })

export function Tabs({
  children,
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
}: {
  children: React.ReactNode
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || "")
  const value = controlledValue ?? internalValue
  const handleValueChange = (newValue: string) => {
    setInternalValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex gap-2 p-1 bg-[#05070A] rounded-xl border border-white/10",
        className
      )}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  children,
  value,
  className,
}: {
  children: React.ReactNode
  value: string
  className?: string
}) {
  const { value: activeValue, onValueChange } = useContext(TabsContext)
  const isActive = activeValue === value

  return (
    <button
      onClick={() => onValueChange(value)}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive ? "text-white" : "text-gray-500 hover:text-gray-300",
        className
      )}
    >
      {isActive && (
        <motion.div
          layoutId="activTab"
          className="absolute inset-0 bg-cyan-500/20 rounded-lg"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

export function TabsContent({
  children,
  value,
  className,
}: {
  children: React.ReactNode
  value: string
  className?: string
}) {
  const { value: activeValue } = useContext(TabsContext)
  if (activeValue !== value) return null

  return <div className={className}>{children}</div>
}
