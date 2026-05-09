import path from "node:path"

const ROOT = path.resolve(process.cwd())

export const paths = {
  storage: path.join(ROOT, "storage"),
  data: path.join(ROOT, "data"),
  project: (id: string) => path.join(ROOT, "storage", "projects", id),
  prd: (id: string) => path.join(ROOT, "storage", "projects", id, "prd.md"),
  design: (id: string) => path.join(ROOT, "storage", "projects", id, "design"),
  workspace: (id: string) => path.join(ROOT, "storage", "projects", id, "workspace"),
  exports: (id: string) => path.join(ROOT, "storage", "exports", id),
  settings: path.join(ROOT, "data", "settings.json"),
  // 版本化制品路径
  artifactVersioned: (projectId: string, type: string, version: number) =>
    path.join(ROOT, "storage", "projects", projectId, `${type}.v${version}.md`),
  // 项目文档目录
  projectDocsDir: (projectId: string) =>
    path.join(ROOT, "storage", "projects", projectId, "docs"),
  changelogPath: (projectId: string) =>
    path.join(ROOT, "storage", "projects", projectId, "docs", "CHANGELOG.md"),
  requirementsPath: (projectId: string) =>
    path.join(ROOT, "storage", "projects", projectId, "docs", "REQUIREMENTS.md"),
  planPath: (projectId: string) =>
    path.join(ROOT, "storage", "projects", projectId, "docs", "PLAN.md"),
}
