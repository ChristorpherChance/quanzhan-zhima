import ExcelJS from "exceljs"
import { log } from "@/lib/log"

export interface DefectRow {
  severity: string
  file?: string
  line?: string
  desc: string
  suggestion?: string
}

export async function reviewToXlsx(
  report: { title: string; defects: DefectRow[] },
  outPath: string,
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("缺陷表")
  ws.columns = [
    { header: "严重度", key: "severity", width: 10 },
    { header: "文件", key: "file", width: 32 },
    { header: "行号", key: "line", width: 8 },
    { header: "描述", key: "desc", width: 60 },
    { header: "修复建议", key: "suggestion", width: 60 },
  ]
  report.defects.forEach((d) => ws.addRow(d))
  ws.getRow(1).font = { bold: true }
  await wb.xlsx.writeFile(outPath)
  log("export", `excel written: ${outPath}`)
  return outPath
}

// Parse review-report.md defects from markdown
export function parseDefects(markdown: string): DefectRow[] {
  const defects: DefectRow[] = []
  const re = /^- \[(P0|P1|P2)\]\s+(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    const severity = m[1]
    const rest = m[2]
    const fileMatch = rest.match(/^(\S+?):(\d+)\s+(.+)/)
    if (fileMatch) {
      defects.push({ severity, file: fileMatch[1], line: fileMatch[2], desc: fileMatch[3] })
    } else {
      defects.push({ severity, desc: rest })
    }
  }
  return defects
}
