"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Settings, Zap } from "lucide-react"

interface AgentRow {
  key: string
  label: string
  description: string
  stage: string
  modelId: string
  provider: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  enabled: boolean
}

export default function AgentsSettingsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/settings/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.data?.agents ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Agent 设置</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {agents.map((agent) => (
            <Link key={agent.key} href={`/settings/agents/${agent.key}`}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{agent.label}</CardTitle>
                      <Badge variant={agent.enabled ? "default" : "secondary"}>
                        {agent.enabled ? "启用" : "禁用"}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {agent.stage}
                    </Badge>
                  </div>
                  <CardDescription>{agent.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>{agent.provider} / {agent.modelId}</span>
                    <span>temp: {agent.temperature}</span>
                    <span>maxTokens: {agent.maxTokens}</span>
                    <span>timeout: {agent.timeoutMs / 1000}s</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Link href={`/settings/agents/${agents[0]?.key ?? "dev"}`}>
          <Button variant="outline" size="sm" className="gap-1">
            <Zap className="w-3.5 h-3.5" />
            测试连接
          </Button>
        </Link>
      </div>
    </div>
  )
}
