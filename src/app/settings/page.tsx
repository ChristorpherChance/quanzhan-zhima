"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface ProviderState {
  enabled: boolean
  model: string
  hasKey: boolean
  apiKey: string
}

interface PiCheckResult {
  connected: boolean
  error?: string
  providers: Record<string, { hasKey: boolean; modelResolved: boolean; modelId: string; piProvider: string }>
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [providers, setProviders] = useState<Record<string, ProviderState>>({})
  const [loading, setLoading] = useState(false)
  const [piCheck, setPiCheck] = useState<PiCheckResult | null>(null)
  const [piChecking, setPiChecking] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ data }) => {
        setSettings(data)
        const p = (data.providers ?? {}) as Record<string, ProviderState>
        // Initialize apiKey field for each provider
        for (const k of Object.keys(p)) {
          if (p[k].apiKey === undefined) p[k].apiKey = ""
        }
        setProviders({ ...p })
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        hitlMode: settings?.hitlMode,
        hitlThreshold: settings?.hitlThreshold,
        providers: Object.fromEntries(
          Object.entries(providers).map(([k, v]) => [
            k,
            {
              enabled: v.enabled,
              model: v.model,
              apiKey: v.apiKey || undefined,
            },
          ]),
        ),
      }
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      toast({ title: "保存成功" })
    } catch (e: unknown) {
      toast({ title: "保存失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handlePiCheck = async () => {
    setPiChecking(true)
    try {
      const r = await fetch("/api/settings/pi-check")
      const { data } = await r.json()
      setPiCheck(data as PiCheckResult)
    } catch (e: unknown) {
      toast({ title: "Pi 检测失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setPiChecking(false)
    }
  }

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">加载中...</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">设置</h1>

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <CardTitle>LLM 模型状态</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(providers).map(([key, p]) => (
              <div key={key} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium capitalize">{key}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.model}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    {p.hasKey ? (
                      <Badge variant="default">有 Key</Badge>
                    ) : (
                      <Badge variant="destructive">无 Key</Badge>
                    )}
                    <Badge variant={p.enabled ? "default" : "secondary"}>
                      {p.enabled ? "启用" : "禁用"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`enable-${key}`}
                      checked={p.enabled}
                      onCheckedChange={(checked) =>
                        setProviders((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], enabled: checked },
                        }))
                      }
                    />
                    <Label htmlFor={`enable-${key}`} className="text-sm cursor-pointer">
                      启用
                    </Label>
                  </div>
                </div>

                <div>
                  <Label htmlFor={`apikey-${key}`} className="text-sm">
                    API Key
                  </Label>
                  <Input
                    id={`apikey-${key}`}
                    type="password"
                    value={p.apiKey ?? ""}
                    onChange={(e) =>
                      setProviders((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], apiKey: e.target.value },
                      }))
                    }
                    placeholder={p.hasKey ? "已配置（留空不变）" : `输入 ${key} 的 API Key`}
                    className="mt-1 text-sm font-mono"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* HITL Settings */}
      <Card>
        <CardHeader>
          <CardTitle>HITL 人机协同</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">模式</label>
            <select
              className="w-full mt-1 border rounded px-3 py-2 text-sm"
              value={String(settings.hitlMode ?? "manual")}
              onChange={(e) => setSettings({ ...settings, hitlMode: e.target.value })}
            >
              <option value="manual">手动 (manual)</option>
              <option value="auto">全自动 (auto)</option>
              <option value="hybrid">混合 (hybrid)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">混合模式阈值 (0-1)</label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={String(settings.hitlThreshold ?? 0.8)}
              onChange={(e) => setSettings({ ...settings, hitlThreshold: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "保存中..." : "保存设置"}
          </Button>
        </CardContent>
      </Card>

      {/* Agent Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Agent 配置</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            管理各阶段 Agent 的模型、参数和超时配置。
          </p>
          <Link href="/settings/agents">
            <Button variant="outline" size="sm">管理 Agent 设置</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Pi SDK Status */}
      <Card>
        <CardHeader>
          <CardTitle>
            Pi SDK 状态
            {piCheck && (
              <span className={`ml-2 inline-block w-2.5 h-2.5 rounded-full ${piCheck.connected ? "bg-green-500" : "bg-red-500"}`} />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!piCheck ? (
            <p className="text-sm text-muted-foreground">点击下方按钮检测 Pi SDK 连接状态</p>
          ) : piCheck.connected ? (
            <>
              <p className="text-sm text-green-600 font-medium">Pi SDK 已连接</p>
              <div className="space-y-2">
                {Object.entries(piCheck.providers).map(([key, p]) => (
                  <div key={key} className="flex items-center gap-3 text-sm">
                    <span className="w-2 h-2 rounded-full inline-block bg-green-500" />
                    <span className="font-medium">{key}</span>
                    <span className="text-muted-foreground">{p.modelId}</span>
                    <Badge variant={p.hasKey ? "default" : "destructive"}>
                      {p.hasKey ? "Key 已配" : "Key 未配"}
                    </Badge>
                    <Badge variant={p.modelResolved ? "default" : "secondary"}>
                      {p.modelResolved ? "模型可用" : "模型未知"}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">Pi SDK 连接失败: {piCheck.error}</p>
          )}
          <Button onClick={handlePiCheck} disabled={piChecking} variant="outline" size="sm">
            {piChecking ? "检测中..." : "重新检测"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
