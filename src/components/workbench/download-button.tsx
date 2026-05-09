"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface DownloadButtonProps {
  content: string
  filename: string
  mimeType?: string
  label?: string
}

export function DownloadButton({
  content,
  filename,
  mimeType = "text/markdown",
  label = "下载",
}: DownloadButtonProps) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1">
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
