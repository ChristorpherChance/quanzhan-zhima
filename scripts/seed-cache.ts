/**
 * 种子项目缓存脚本
 * 将预制的种子项目数据写入数据库和文件系统
 */
import { PrismaClient } from "@prisma/client"
import fs from "node:fs/promises"
import path from "node:path"

const prisma = new PrismaClient()

const ROOT = path.resolve(process.cwd())
const SEEDS_DIR = path.join(ROOT, "src", "seeds")
const STORAGE_DIR = path.join(ROOT, "storage", "projects")

interface SeedMeta {
  name: string
  oneLiner: string
  seedType: string | null
  currentStage: string
  hitlMode: string
  hitlThreshold: number
}

const SEEDS = [
  { dir: "photovoltaic-monitor", type: "photovoltaic" },
  { dir: "power-anomaly-alert", type: "power-anomaly" },
] as const

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const srcPath = path.join(src, e.name)
    const dstPath = path.join(dst, e.name)
    if (e.isDirectory()) {
      await copyDir(srcPath, dstPath)
    } else {
      await fs.copyFile(srcPath, dstPath)
    }
  }
}

async function seedProject(dirName: string, seedType: string) {
  const seedDir = path.join(SEEDS_DIR, dirName)
  const metaRaw = await fs.readFile(path.join(seedDir, "metadata.json"), "utf8")
  const meta: SeedMeta = JSON.parse(metaRaw)

  // Create project record
  const project = await prisma.project.create({
    data: {
      name: meta.name,
      oneLiner: meta.oneLiner,
      seedType: seedType,
      currentStage: meta.currentStage,
      hitlMode: meta.hitlMode,
    },
  })

  const projectDir = path.join(STORAGE_DIR, project.id)
  await fs.mkdir(projectDir, { recursive: true })

  // Copy PRD
  const prdSrc = path.join(seedDir, "prd.md")
  const prdExist = await fs.stat(prdSrc).then(() => true).catch(() => false)
  if (prdExist) {
    await fs.copyFile(prdSrc, path.join(projectDir, "prd.md"))
    await prisma.artifact.create({
      data: {
        projectId: project.id,
        type: "prd",
        version: 1,
        storagePath: `storage/projects/${project.id}/prd.md`,
      },
    })
  }

  // Copy design files
  const designSrc = path.join(seedDir, "design")
  const designExist = await fs.stat(designSrc).then(() => true).catch(() => false)
  if (designExist) {
    const designDst = path.join(projectDir, "design")
    await copyDir(designSrc, designDst)
    const types = ["summary", "detail", "api", "db", "ui"]
    for (const t of types) {
      const ext = t === "ui" ? "html" : "md"
      const filePath = path.join(designSrc, `${t}.${ext}`)
      const exists = await fs.stat(filePath).then(() => true).catch(() => false)
      if (exists) {
        await prisma.artifact.create({
          data: {
            projectId: project.id,
            type: `design-${t}`,
            version: 1,
            storagePath: `storage/projects/${project.id}/design/${t}.${ext}`,
          },
        })
      }
    }
  }

  // Create workspace dir
  const wsDir = path.join(projectDir, "workspace")
  await fs.mkdir(wsDir, { recursive: true })
  // Copy workspace if it exists in seed
  const wsSrc = path.join(seedDir, "workspace")
  const wsExist = await fs.stat(wsSrc).then(() => true).catch(() => false)
  if (wsExist) {
    await copyDir(wsSrc, wsDir)
  }

  // Copy review report
  const reviewSrc = path.join(seedDir, "reports")
  const reviewExist = await fs.stat(reviewSrc).then(() => true).catch(() => false)
  if (reviewExist) {
    const reportsDst = path.join(projectDir, "reports")
    await copyDir(reviewSrc, reportsDst)
    const reviewMd = path.join(reviewSrc, "review.md")
    const rmdExist = await fs.stat(reviewMd).then(() => true).catch(() => false)
    if (rmdExist) {
      await prisma.artifact.create({
        data: {
          projectId: project.id,
          type: "review-report",
          version: 1,
          storagePath: `storage/projects/${project.id}/reports/review.md`,
        },
      })
    }
  }

  // Create Gate records
  const gates = ["G1", "G2", "G3"] as const
  for (const type of gates) {
    const isLocked = (type === "G1" || type === "G2")
    await prisma.gate.create({
      data: {
        projectId: project.id,
        type,
        status: isLocked ? "locked" : "open",
        lockedAt: isLocked ? new Date() : null,
      },
    })
  }

  console.log(`  [OK] ${meta.name} (${project.id})`)
  return project
}

async function main() {
  console.log("种子项目缓存初始化...\n")

  for (const { dir, type } of SEEDS) {
    await seedProject(dir, type)
  }

  console.log(`\n完成! ${SEEDS.length} 个种子项目已写入。`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("种子缓存失败:", e)
  process.exit(1)
})
