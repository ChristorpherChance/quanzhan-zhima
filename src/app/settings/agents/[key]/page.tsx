"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Save, Zap, Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react"

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), { ssr: false })

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
  systemPrompt?: string | null
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

export default function AgentDetailPage() {
  const params = useParams<{ key: string }>()
  const router = useRouter()
  const [agent, setAgent] = useState<AgentRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; response?: string; error?: string } | null>(null)

  useEffect(() => {
    fetch("/api/settings/agents")
      .then((r) => r.json())
      .then((d) => {
        const found = (d.data?.agents ?? []).find((a: AgentRow) => a.key === params.key)
        setAgent(found ?? null)
      })
      .finally(() => setLoading(false))
  }, [params.key])

  const save = useCallback(async () => {
    if (!agent) return
    setSaving(true)
    try {
      await fetch("/api/settings/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: agent.key,
          modelId: agent.modelId,
          provider: agent.provider,
          temperature: Number(agent.temperature),
          maxTokens: Number(agent.maxTokens),
          timeoutMs: Number(agent.timeoutMs),
          enabled: agent.enabled,
          systemPrompt: agent.systemPrompt ?? null,
        }),
      })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }, [agent, router])

  const dryRun = useCallback(async () => {
    if (!agent) return
    setTesting(true)
    setTestResult(null)
    try {
      const r = await fetch(`/api/agents/${agent.key}/dry-run`, { method: "POST" })
      const data = await r.json()
      setTestResult(data)
    } catch {
      setTestResult({ ok: false, error: "请求失败" })
    } finally {
      setTesting(false)
    }
  }, [agent])

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="max-w-xl mx-auto py-8 px-4">
        <p className="text-muted-foreground">未找到 Agent: {params.key}</p>
        <Link href="/settings/agents">
          <Button variant="link" className="mt-2 p-0">返回列表</Button>
        </Link>
      </div>
    )
  }

  const tokenEstimate = estimateTokens(agent.systemPrompt ?? "")

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings/agents">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">{agent.label}</h1>
        <Badge variant={agent.enabled ? "default" : "secondary"}>
          {agent.enabled ? "启用" : "禁用"}
        </Badge>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="basic" className="flex-1">基础参数</TabsTrigger>
          <TabsTrigger value="prompt" className="flex-1">System Prompt</TabsTrigger>
          <TabsTrigger value="test" className="flex-1">试运行</TabsTrigger>
        </TabsList>

        {/* 基础参数 */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">基础信息</CardTitle>
              <CardDescription>{agent.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Agent Key</Label>
                  <Input value={agent.key} disabled className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">所属阶段</Label>
                  <Input value={agent.stage} disabled className="h-8 text-xs" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled" className="text-xs">启用状态</Label>
                <Switch
                  id="enabled"
                  checked={agent.enabled}
                  onCheckedChange={(v) => setAgent({ ...agent, enabled: v })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">模型配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Provider</Label>
                  <Input
                    value={agent.provider}
                    onChange={(e) => setAgent({ ...agent, provider: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Model ID</Label>
                  <Input
                    value={agent.modelId}
                    onChange={(e) => setAgent({ ...agent, modelId: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Temperature</Label>
                  <Input
                    type="number"
                    step={0.1}
                    min={0}
                    max={2}
                    value={agent.temperature}
                    onChange={(e) => setAgent({ ...agent, temperature: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Tokens</Label>
                  <Input
                    type="number"
                    step={256}
                    min={256}
                    value={agent.maxTokens}
                    onChange={(e) => setAgent({ ...agent, maxTokens: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Timeout (ms)</Label>
                  <Input
                    type="number"
                    step={30000}
                    min={60000}
                    value={agent.timeoutMs}
                    onChange={(e) => setAgent({ ...agent, timeoutMs: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                保存
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* System Prompt */}
        <TabsContent value="prompt" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">System Prompt</CardTitle>
                  <CardDescription>覆盖默认系统提示词。留空则使用内置默认值。</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    ~{tokenEstimate} tokens / {agent.systemPrompt?.length ?? 0} 字
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setAgent({ ...agent, systemPrompt: "" })}
                  >
                    <RotateCcw className="w-3 h-3" />
                    重置
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden" style={{ height: 420 }}>
                <MonacoEditor
                  height="100%"
                  defaultLanguage="markdown"
                  value={agent.systemPrompt ?? ""}
                  onChange={(v) => setAgent({ ...agent, systemPrompt: v ?? "" })}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: "on",
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                  }}
                  loading={<Skeleton className="h-full w-full" />}
                />
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                保存
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* 试运行 */}
        <TabsContent value="test" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">试运行</CardTitle>
              <CardDescription>发送一条测试请求，验证当前配置是否可用。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={dryRun} disabled={testing} className="gap-1">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                测试连接
              </Button>
            </CardContent>
          </Card>

          {testResult && (
            <Card className={testResult.ok ? "border-green-200" : "border-red-200"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <CardTitle className="text-sm">
                    {testResult.ok ? "测试通过" : "测试失败"}
                  </CardTitle>
                  {testResult.latencyMs != null && (
                    <Badge variant="outline" className="text-xs">{testResult.latencyMs}ms</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {testResult.ok ? testResult.response : testResult.error}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
