import { NextResponse } from "next/server"
import { paths } from "@/config/paths"
import { packCodeZip } from "@/lib/export/git-zip"
import path from "node:path"
import crypto from "node:crypto"
import fs from "node:fs/promises"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const outDir = paths.exports(params.id)
  await fs.mkdir(outDir, { recursive: true })
  const fileId = crypto.randomUUID()
  const outPath = path.join(outDir, `${fileId}.zip`)
  await packCodeZip(paths.workspace(params.id), outPath)
  return NextResponse.json({ ok: true, downloadUrl: `/api/projects/${params.id}/exports/download/${fileId}.zip` })
}
