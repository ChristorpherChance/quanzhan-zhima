import fs from "node:fs/promises"
import path from "node:path"
import type { ToolDefinition, ExtensionContext } from "@mariozechner/pi-coding-agent"
import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core"
import { Type, type Static } from "@mariozechner/pi-ai"
import { log } from "@/lib/log"

// ── Tool parameter schemas (typebox) ──────────────────────────────

const ReadArtifactParams = Type.Object({
  type: Type.String({ description: 'Artifact type, e.g. "prd", "design-summary", "tech-stack"' }),
})

const WorkspaceWriteParams = Type.Object({
  path: Type.String({ description: "File path relative to workspace root" }),
  content: Type.String({ description: "File content to write" }),
})

const WorkspaceListParams = Type.Object({
  dir: Type.Optional(Type.String({ description: "Subdirectory to list (relative to workspace root)" })),
})

const UiTemplatePackParams = Type.Object({
  pageType: Type.String({ description: "Page type: dashboard, list, detail, settings, modal, toast, skeleton, form" }),
})

// ── Build options ─────────────────────────────────────────────────

export interface BuildPiCustomToolsOptions {
  /** Absolute path to the project workspace directory */
  workspaceDir: string
}

// ── Helper ────────────────────────────────────────────────────────

/**
 * Guard: ensure the resolved path stays within rootDir.
 * Throws if the path escapes.
 */
function guardPath(target: string, rootDir: string): string {
  const resolved = path.resolve(rootDir, target)
  const normalizedRoot = path.resolve(rootDir) + path.sep
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(rootDir)) {
    throw new Error(`Path escape detected: ${target}`)
  }
  return resolved
}

/**
 * Read an artifact file from the project directory (parent of workspaceDir).
 * Looks for: {projectDir}/{type}.md
 */
async function readArtifact(workspaceDir: string, type: string): Promise<string> {
  const projectDir = path.resolve(workspaceDir, "..")
  const filePath = path.join(projectDir, `${type}.md`)

  try {
    const content = await fs.readFile(filePath, "utf-8")
    return content
  } catch {
    // Try .txt fallback
    try {
      const altPath = path.join(projectDir, `${type}.txt`)
      return await fs.readFile(altPath, "utf-8")
    } catch {
      return `(artifact "${type}" not found at ${filePath})`
    }
  }
}

// ── Build helpers ─────────────────────────────────────────────────

function ok(details?: string) {
  return {
    content: [{ type: "text", text: details ?? "ok" }],
    details: undefined,
    terminate: false,
  } as AgentToolResult<undefined>
}

function toolErr(message: string) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    details: undefined,
    terminate: false,
  } as AgentToolResult<undefined>
}

// ── Exported factory ──────────────────────────────────────────────

/**
 * Build custom ToolDefinition[] for the Pi coding agent.
 *
 * Provides:
 *  - read_artifact    – read project artifacts (PRD, design docs)
 *  - workspace_write   – write files inside the workspace (path-guarded)
 *  - workspace_list    – list files inside the workspace recursively
 */
export function buildPiCustomTools(
  opts: BuildPiCustomToolsOptions,
): ToolDefinition[] {
  const { workspaceDir } = opts

  // ── Tool: read_artifact ───────────────────────────────────────
  const readArtifactTool: ToolDefinition<typeof ReadArtifactParams> = {
    name: "read_artifact",
    label: "Read Artifact",
    description:
      "Read a project artifact file (PRD, design summary, etc.) from the parent project directory. Use this to understand project requirements before coding.",
    parameters: ReadArtifactParams,
    execute: async (
      _toolCallId: string,
      params: Static<typeof ReadArtifactParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<undefined>> => {
      try {
        const text = await readArtifact(workspaceDir, params.type)
        return {
          content: [{ type: "text", text }],
          details: undefined,
          terminate: false,
        }
      } catch (e: unknown) {
        log("pi", "read_artifact failed", e)
        return toolErr(`read_artifact: ${(e as Error)?.message ?? e}`)
      }
    },
  }

  // ── Tool: workspace_write ─────────────────────────────────────
  const workspaceWriteTool: ToolDefinition<typeof WorkspaceWriteParams> = {
    name: "workspace_write",
    label: "Workspace Write",
    description:
      "Write a file inside the project workspace. Creates parent directories automatically. The file path must stay within the workspace.",
    parameters: WorkspaceWriteParams,
    execute: async (
      _toolCallId: string,
      params: Static<typeof WorkspaceWriteParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<undefined>> => {
      try {
        const resolved = guardPath(params.path, workspaceDir)
        await fs.mkdir(path.dirname(resolved), { recursive: true })
        await fs.writeFile(resolved, params.content, "utf-8")
        log("pi", `workspace_write: ${params.path}`)
        return ok(`Written: ${params.path}`)
      } catch (e: unknown) {
        log("pi", "workspace_write failed", e)
        return toolErr(`workspace_write: ${(e as Error)?.message ?? e}`)
      }
    },
  }

  // ── Tool: workspace_list ──────────────────────────────────────
  const workspaceListTool: ToolDefinition<typeof WorkspaceListParams> = {
    name: "workspace_list",
    label: "Workspace List",
    description:
      "List all files in the project workspace recursively. Optionally restricts to a subdirectory.",
    parameters: WorkspaceListParams,
    execute: async (
      _toolCallId: string,
      params: Static<typeof WorkspaceListParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<undefined>> => {
      try {
        const targetDir = params.dir
          ? guardPath(params.dir, workspaceDir)
          : workspaceDir

        const entries: string[] = []

        const walk = async (dir: string): Promise<void> => {
          const dirents = await fs.readdir(dir, { withFileTypes: true })
          for (const d of dirents) {
            const full = path.join(dir, d.name)
            if (d.isDirectory()) {
              // Skip node_modules, .git, .next
              if (["node_modules", ".git", ".next", "dist", ".turbo"].includes(d.name)) continue
              await walk(full)
            } else {
              const rel = path.relative(workspaceDir, full)
              entries.push(rel)
            }
          }
        }

        await walk(targetDir)
        const listing = entries.length > 0
          ? entries.sort().join("\n")
          : "(empty directory)"

        return {
          content: [{ type: "text", text: listing }],
          details: undefined,
          terminate: false,
        }
      } catch (e: unknown) {
        log("pi", "workspace_list failed", e)
        return toolErr(`workspace_list: ${(e as Error)?.message ?? e}`)
      }
    },
  }

  // ── Tool: ui_template_pack ─────────────────────────────────────
  const uiTemplatePackTool: ToolDefinition<typeof UiTemplatePackParams> = {
    name: "ui_template_pack",
    label: "UI Template Pack",
    description:
      "Get a boilerplate HTML template for a specific page type (dashboard, list, detail, settings, modal, toast, skeleton, form). Each template uses Tailwind CSS + Alpine.js and implements common interaction patterns. Use this to seed page structure before filling in PRD-specific content.",
    parameters: UiTemplatePackParams,
    execute: async (
      _toolCallId: string,
      params: Static<typeof UiTemplatePackParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<undefined>> => {
      try {
        const { UI_TEMPLATES } = await import("./ui-templates")
        const template = UI_TEMPLATES[params.pageType]
        if (!template) {
          return {
            content: [{ type: "text", text: `Unknown page type: ${params.pageType}. Available: ${Object.keys(UI_TEMPLATES).join(", ")}` }],
            details: undefined,
            terminate: false,
          }
        }
        return {
          content: [{ type: "text", text: template }],
          details: undefined,
          terminate: false,
        }
      } catch (e: unknown) {
        return toolErr(`ui_template_pack: ${(e as Error)?.message ?? e}`)
      }
    },
  }

  return [readArtifactTool, workspaceWriteTool, workspaceListTool, uiTemplatePackTool]
}
