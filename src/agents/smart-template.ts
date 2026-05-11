import fs from "node:fs/promises"
import { paths } from "@/config/paths"
import type { AgentRunCtx } from "@/agents/types"

interface EntityInfo {
  name: string
  namePlural: string
  nameCN: string
  fields: Array<{ name: string; label: string; type: string }>
}

/**
 * Crude entity extraction from PRD markdown.
 * Looks for entity/table definitions, field lists, etc.
 */
function parseEntityFromPRD(prd: string): EntityInfo {
  const entity: EntityInfo = {
    name: "Item",
    namePlural: "Items",
    nameCN: "项目",
    fields: [
      { name: "id", label: "ID", type: "number" },
      { name: "name", label: "名称", type: "string" },
      { name: "createdAt", label: "创建时间", type: "date" },
    ],
  }

  // Try to find entity name from markdown headers
  const nameMatch = prd.match(/(?:实体|模型|Entity|Model)[：:]\s*(\w+)/i)
  if (nameMatch) {
    entity.name = nameMatch[1]
    entity.namePlural = nameMatch[1] + "s"
  }

  // Try to find Chinese name
  const cnMatch = prd.match(/(?:#|##)\s*([^#\n]{2,20}(?:管理|系统|模块|功能))/)
  if (cnMatch) {
    entity.nameCN = cnMatch[1].trim()
  }

  // Try to find fields from table or list
  const fieldMatches = prd.matchAll(/[-*]\s*(?:`)?(\w+)(?:`)?\s*[：:]\s*(.+)/g)
  const parsedFields: Array<{ name: string; label: string; type: string }> = []
  for (const fm of fieldMatches) {
    const fieldName = fm[1]
    const desc = fm[2]
    if (["id", "name", "title", "createdAt", "updatedAt", "status", "description", "type", "category", "price", "quantity"].includes(fieldName)) {
      const type = fieldName === "price" || fieldName === "quantity" ? "number"
        : fieldName === "createdAt" || fieldName === "updatedAt" ? "date"
        : "string"
      parsedFields.push({ name: fieldName, label: desc.slice(0, 20), type })
    }
  }
  if (parsedFields.length >= 2) {
    entity.fields = parsedFields
  }

  return entity
}

function buildFullSPA(entity: EntityInfo): string {
  const fieldsJSON = JSON.stringify(entity.fields, null, 4)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${entity.nameCN}管理系统</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <div id="app" class="max-w-6xl mx-auto p-4">
    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-800">${entity.nameCN}管理</h1>
      <button onclick="showForm()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm">
        + 新建
      </button>
    </header>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">总数</p>
        <p class="text-2xl font-bold" id="stat-total">0</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">本月新增</p>
        <p class="text-2xl font-bold" id="stat-month">0</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">活跃</p>
        <p class="text-2xl font-bold text-green-500" id="stat-active">0</p>
      </div>
    </div>

    <!-- Search -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <input
        type="text"
        placeholder="搜索..."
        oninput="filterItems(this.value)"
        class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            ${entity.fields.map(f => `<th class="text-left px-4 py-3 text-sm font-medium text-gray-600">${f.label}</th>`).join('\n            ')}
            <th class="text-right px-4 py-3 text-sm font-medium text-gray-600">操作</th>
          </tr>
        </thead>
        <tbody id="table-body" class="divide-y divide-gray-100"></tbody>
      </table>
    </div>

    <!-- Empty state -->
    <div id="empty-state" class="hidden text-center py-12 text-gray-400">
      <p class="text-lg mb-2">暂无数据</p>
      <p class="text-sm">点击右上角"新建"按钮添加第一条记录</p>
    </div>

    <!-- Form Modal -->
    <div id="form-modal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 class="text-lg font-semibold mb-4" id="form-title">新建${entity.nameCN}</h2>
        <form id="item-form" onsubmit="saveItem(event)" class="space-y-4">
          ${entity.fields.filter(f => !['id', 'createdAt', 'updatedAt'].includes(f.name)).map(f => `
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">${f.label}</label>
            <input
              name="${f.name}"
              type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}"
              class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              required
            />
          </div>`).join('')}
          <div class="flex gap-3 justify-end pt-2">
            <button type="button" onclick="hideForm()" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">取消</button>
            <button type="submit" class="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    const STORAGE_KEY = '${entity.namePlural.toLowerCase()}'
    const FIELDS = ${fieldsJSON}
    let items = []
    let editingId = null

    function load() {
      try { items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { items = [] }
    }
    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }

    function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

    function render(filter = '') {
      const filtered = filter ? items.filter(i => JSON.stringify(i).includes(filter)) : items
      const tbody = document.getElementById('table-body')
      const empty = document.getElementById('empty-state')
      if (filtered.length === 0) {
        tbody.innerHTML = ''
        empty.classList.remove('hidden')
      } else {
        empty.classList.add('hidden')
        tbody.innerHTML = filtered.map(item => \`
          <tr class="hover:bg-gray-50">
            \${FIELDS.map(f => \`<td class="px-4 py-3 text-sm">\${item[f.name] ?? ''}</td>\`).join('\\n            ')}
            <td class="px-4 py-3 text-right">
              <button onclick="editItem('\\\${item.id}')" class="text-blue-500 hover:text-blue-700 text-sm mr-2">编辑</button>
              <button onclick="deleteItem('\\\${item.id}')" class="text-red-500 hover:text-red-700 text-sm">删除</button>
            </td>
          </tr>
        \`).join('')
      }
      updateStats()
    }

    function updateStats() {
      document.getElementById('stat-total').textContent = items.length
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      document.getElementById('stat-month').textContent = items.filter(i => i.createdAt >= monthStart).length
      document.getElementById('stat-active').textContent = items.filter(i => i.status === 'active' || !i.status).length
    }

    function showForm() { editingId = null; document.getElementById('form-title').textContent = '新建${entity.nameCN}'; document.getElementById('item-form').reset(); document.getElementById('form-modal').classList.remove('hidden') }
    function hideForm() { document.getElementById('form-modal').classList.add('hidden') }
    function filterItems(q) { render(q) }

    function saveItem(e) {
      e.preventDefault()
      const fd = new FormData(e.target)
      const data = { id: editingId || genId(), createdAt: editingId ? items.find(i => i.id === editingId)?.createdAt : new Date().toISOString() }
      for (const f of FIELDS) {
        if (!['id', 'createdAt'].includes(f.name)) {
          data[f.name] = f.type === 'number' ? Number(fd.get(f.name)) : fd.get(f.name) || ''
        }
      }
      if (editingId) {
        const idx = items.findIndex(i => i.id === editingId)
        if (idx >= 0) items[idx] = data
      } else {
        items.unshift(data)
      }
      save()
      hideForm()
      render()
    }

    function editItem(id) {
      const item = items.find(i => i.id === id)
      if (!item) return
      editingId = id
      document.getElementById('form-title').textContent = '编辑${entity.nameCN}'
      const form = document.getElementById('item-form')
      for (const f of FIELDS) {
        const el = form.elements[f.name]
        if (el) el.value = item[f.name] ?? ''
      }
      document.getElementById('form-modal').classList.remove('hidden')
    }

    function deleteItem(id) {
      if (!confirm('确定要删除吗？此操作不可恢复。')) return
      items = items.filter(i => i.id !== id)
      save()
      render()
    }

    // Init
    load()
    render()
  </script>
</body>
</html>`
}

/**
 * Fourth-level (final) fallback: smart template generation.
 * Parses PRD for entity info and generates a complete SPA with CRUD + localStorage.
 * 100% guarantee of output.
 */
export async function generateSmartTemplate(
  ctx: AgentRunCtx,
  projectId: string,
  workspaceDir: string,
): Promise<number> {
  ctx.setPhase("writing", "智能模板兜底")
  ctx.send("log", { line: "--- 第四级：智能模板兜底 ---" })

  let prd = ""
  try {
    prd = await fs.readFile(paths.prd(projectId), "utf-8")
  } catch {
    ctx.send("log", { line: "未找到 PRD，使用默认实体" })
  }

  const entity = parseEntityFromPRD(prd)
  ctx.send("log", { line: `解析实体: ${entity.nameCN} (${entity.name}, ${entity.fields.length} 字段)` })

  try {
    const html = buildFullSPA(entity)
    await fs.writeFile(`${workspaceDir}/index.html`, html, "utf-8")

    const pkgJson = {
      name: "app",
      version: "1.0.0",
      private: true,
      scripts: { dev: "npx serve ." },
    }
    await fs.writeFile(`${workspaceDir}/package.json`, JSON.stringify(pkgJson, null, 2), "utf-8")

    ctx.send("log", { line: "✓ index.html + package.json (智能模板)" })
    return 2
  } catch (e: unknown) {
    ctx.send("error", { code: "E_TEMPLATE_FAILED", message: `智能模板生成失败: ${(e as Error)?.message ?? e}` })
    return 0
  }
}
