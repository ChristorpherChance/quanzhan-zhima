"use client"

import { useState, useRef } from "react"
import { AgentChat, type AgentChatHandle } from "@/components/workbench/agent-chat"

interface AgentTabsProps {
  projectId?: string
  jobIds: Record<string, string | null>
  streamingUrls: Record<string, string | null>
  onSend: Record<string, (text: string) => Promise<void>>
  onDone?: Record<string, () => void>
}

const AGENT_TABS = [
  { key: "requirement", label: "需求" },
  { key: "design", label: "设计" },
  { key: "dev", label: "开发" },
  { key: "review", label: "审查" },
] as const

export function AgentTabs({ projectId, jobIds, streamingUrls, onSend, onDone }: AgentTabsProps) {
  const [activeTab, setActiveTab] = useState("dev")
  const chatRefs = useRef<Record<string, AgentChatHandle | null>>({})

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
      <div className="flex border-b shrink-0">
        {AGENT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels - 每个保持独立 DOM 以保留滚动位置和 streaming 状态 */}
      <div className="flex-1 min-h-0">
        {AGENT_TABS.map((tab) => (
          <div
            key={tab.key}
            className={activeTab === tab.key ? "h-full" : "hidden"}
          >
            <AgentChat
              ref={(el) => { chatRefs.current[tab.key] = el }}
              title={`${tab.label} Agent`}
              projectId={projectId}
              jobId={jobIds[tab.key] ?? null}
              streamingUrl={streamingUrls[tab.key] ?? null}
              onSend={onSend[tab.key] ?? (async () => {})}
              onDone={onDone?.[tab.key]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
