import fs from "node:fs/promises"
import { marked } from "marked"
import HTMLtoDOCX from "html-to-docx"
import { log } from "@/lib/log"

const PDF_HTML_WRAPPER = (body: string, title: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body {
    font-family: "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
    line-height: 1.8;
    max-width: 800px;
    margin: 40px auto;
    padding: 0 20px;
    color: #333;
  }
  h1 { font-size: 1.6em; border-bottom: 2px solid #667eea; padding-bottom: 8px; }
  h2 { font-size: 1.3em; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 1.1em; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  img { max-width: 100%; }
  blockquote { border-left: 3px solid #667eea; margin: 0; padding-left: 16px; color: #555; }
  @page { margin: 25mm; size: A4; }
</style>
</head>
<body>${body}</body>
</html>`

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function mdToDocx(mdContent: string, outputPath: string, title?: string): Promise<string> {
  const html = await marked.parse(mdContent)
  // 转换 marked 的 HTML 输出为适合 Word 的格式
  const styledHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body { font-family: "Microsoft YaHei", sans-serif; line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 6px; }
    th { background: #e0e0e0; }
    code { background: #f4f4f4; padding: 2px 4px; }
    pre { background: #f4f4f4; padding: 8px; }
    blockquote { border-left: 3px solid #999; padding-left: 12px; color: #555; }
  </style></head><body>${html}</body></html>`

  const buffer = await HTMLtoDOCX(styledHtml, "", {
    title: title ?? "导出文档",
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  })

  await fs.writeFile(outputPath, buffer)
  log("export", `native docx done: ${outputPath}`)
  return outputPath
}

export async function mdToPdf(mdContent: string, outputPath: string, title?: string): Promise<string> {
  const html = await marked.parse(mdContent)
  const fullHtml = PDF_HTML_WRAPPER(html, title ?? "导出文档")

  // 动态 import puppeteer 以减少冷启动开销
  const puppeteer = await import("puppeteer")
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(fullHtml, { waitUntil: "networkidle0", timeout: 30_000 })
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
      timeout: 60_000,
    })
    log("export", `native pdf done: ${outputPath}`)
    return outputPath
  } finally {
    await browser.close()
  }
}
