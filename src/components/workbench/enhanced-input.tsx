"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Paperclip, X, BrainCircuit, Cpu, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface EnhancedInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  /** 附件列表 */
  attachments?: File[]
  onAttachmentsChange?: (files: File[]) => void
  /** 当前模型 */
  model?: string
  onModelChange?: (model: string) => void
  availableModels?: string[]
  /** Thinking level */
  thinkingLevel?: "off" | "low" | "high"
  onThinkingChange?: (level: "off" | "low" | "high") => void
}

const THINKING_OPTIONS: { value: "off" | "low" | "high"; label: string }[] = [
  { value: "high", label: "深度思考" },
  { value: "low", label: "轻量思考" },
  { value: "off", label: "无思考" },
]

export function EnhancedInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "输入指令...",
  attachments = [],
  onAttachmentsChange,
  model,
  onModelChange,
  availableModels,
  thinkingLevel = "high",
  onThinkingChange,
}: EnhancedInputProps) {
  const [showModelMenu, setShowModelMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0 && onAttachmentsChange) {
      onAttachmentsChange([...attachments, ...files])
    }
    // 重置 input 以允许重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeAttachment = (idx: number) => {
    if (onAttachmentsChange) {
      onAttachmentsChange(attachments.filter((_, i) => i !== idx))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* 附件列表 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {attachments.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5"
            >
              <Paperclip className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="hover:text-red-500"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-1">
        {/* 附件上传 */}
        {onAttachmentsChange && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              title="上传附件"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </Button>
          </>
        )}

        {/* 模型切换 */}
        {onModelChange && availableModels && availableModels.length > 0 && (
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={disabled}
              onClick={() => setShowModelMenu(!showModelMenu)}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="max-w-[80px] truncate">{model ?? availableModels[0]}</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showModelMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-popover border rounded-md shadow-md z-50 min-w-[140px]">
                {availableModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      "block w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                      m === model && "bg-muted font-medium",
                    )}
                    onClick={() => {
                      onModelChange(m)
                      setShowModelMenu(false)
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Thinking 切换 */}
        {onThinkingChange && (
          <div className="flex gap-0.5">
            {THINKING_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={thinkingLevel === opt.value ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7 text-xs px-2", thinkingLevel === opt.value && "font-medium")}
                disabled={disabled}
                onClick={() => onThinkingChange(opt.value)}
                title={opt.label}
              >
                <BrainCircuit className={cn(
                  "w-3.5 h-3.5",
                  opt.value === "high" && "text-blue-500",
                  opt.value === "low" && "text-blue-300",
                )} />
                <span className="ml-1 hidden sm:inline">{opt.label}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* 输入框 + 发送 */}
      <div className="flex gap-2">
        <Input
          id="agent-input"
          name="prompt"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="text-xs"
        />
        <Button size="sm" onClick={onSend} disabled={disabled || !value.trim()}>
          发送
        </Button>
      </div>
    </div>
  )
}
