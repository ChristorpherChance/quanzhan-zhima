import simpleGit from "simple-git"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { log } from "@/lib/log"

export async function packCodeZip(workspaceDir: string, outZip: string) {
  const g = simpleGit(workspaceDir)
  if (!(await g.checkIsRepo())) {
    await g
      .init()
      .add(".")
      .addConfig("user.name", "zhima")
      .addConfig("user.email", "zhima@local")
      .commit("init")
  }
  await fs.mkdir(path.dirname(outZip), { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      "git",
      ["archive", "--format=zip", "-o", outZip, "HEAD"],
      { cwd: workspaceDir },
    )
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error("git archive failed: " + c)),
    )
  })
  log("export", `code zip packed: ${outZip}`)
  return outZip
}
