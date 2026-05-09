// UI boilerplate templates for ui_template_pack tool
// Each template provides a minimal but complete Tailwind+Alpine.js snippet

export const UI_TEMPLATES: Record<string, string> = {
  dashboard: `<!-- page: dashboard -->
<div x-data="dashboardApp" class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <header class="bg-white dark:bg-gray-800 shadow p-4 flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
    <button @click="toggleTheme" class="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">🌓</button>
  </header>
  <main class="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h2 class="font-semibold mb-2">统计</h2>
      <div class="text-3xl font-bold" x-text="stats.total">0</div>
    </div>
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:col-span-2">
      <h2 class="font-semibold mb-4">最近项目</h2>
      <template x-if="loading">
        <div class="space-y-3 animate-pulse">
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </template>
    </div>
  </main>
</div>
<script>
document.addEventListener('alpine:init', () => {
  Alpine.data('dashboardApp', () => ({
    stats: { total: 128, active: 45, done: 83 },
    loading: false,
    toggleTheme() { document.documentElement.classList.toggle('dark') },
    // mock data and methods would be filled by AI
  }))
})
</script>`,

  list: `<!-- page: list -->
<div x-data="listApp" class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
  <div class="max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">列表</h1>
      <button @click="openModal = true" class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">新增</button>
    </div>
    <div class="mb-4">
      <input type="text" x-model="search" placeholder="搜索..." class="w-full border rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700">
    </div>
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 dark:bg-gray-700">
            <th class="p-3 text-left cursor-pointer" @click="sort('name')">名称</th>
            <th class="p-3 text-left cursor-pointer" @click="sort('status')">状态</th>
            <th class="p-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <template x-if="loading">
            <tr><td colspan="3" class="p-4"><div class="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded"></div></td></tr>
          </template>
          <template x-for="item in filteredItems" :key="item.id">
            <tr class="border-t dark:border-gray-700">
              <td class="p-3" x-text="item.name"></td>
              <td class="p-3"><span class="px-2 py-1 rounded text-xs" :class="item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" x-text="item.status"></span></td>
              <td class="p-3 text-right"><button @click="editItem(item)" class="text-blue-500 hover:underline">编辑</button></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <!-- Modal -->
    <div x-show="openModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" x-cloak>
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md" @click.outside="openModal = false">
        <h2 class="text-lg font-semibold mb-4">新增/编辑</h2>
        <form @submit.prevent="saveItem">
          <input type="text" x-model="form.name" required class="w-full border rounded p-2 mb-3" placeholder="名称">
          <div class="flex justify-end gap-2">
            <button type="button" @click="openModal = false" class="px-4 py-2 border rounded">取消</button>
            <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded">保存</button>
          </div>
        </form>
      </div>
    </div>
    <!-- Toast -->
    <div x-show="toast.show" class="fixed top-4 right-4 px-4 py-2 rounded shadow-lg" :class="toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'" x-text="toast.msg" x-transition></div>
  </div>
</div>`,

  detail: `<!-- page: detail -->
<div x-data="detailApp" class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
  <div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <h1 class="text-2xl font-bold mb-6" x-text="item.title">详情</h1>
    <div class="space-y-4">
      <div><label class="text-sm text-gray-500">创建时间</label><p x-text="item.createdAt"></p></div>
      <div><label class="text-sm text-gray-500">描述</label><p x-text="item.description"></p></div>
    </div>
  </div>
</div>`,

  settings: `<!-- page: settings -->
<div x-data="settingsApp" class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
  <div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <h1 class="text-2xl font-bold mb-6">设置</h1>
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <span>深色模式</span>
        <button @click="darkMode = !darkMode" class="relative w-12 h-6 rounded-full" :class="darkMode ? 'bg-blue-500' : 'bg-gray-300'">
          <span class="absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform" :class="darkMode ? 'translate-x-6' : 'translate-x-0.5'"></span>
        </button>
      </div>
      <div class="flex items-center justify-between">
        <span>语言</span>
        <select x-model="lang" class="border rounded p-1">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  </div>
</div>`,

  modal: `<div x-show="open" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" x-cloak x-transition>
  <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md" @click.outside="open = false">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold" x-text="title"></h2>
      <button @click="open = false" class="text-gray-400 hover:text-gray-600">&times;</button>
    </div>
    <div x-text="content"></div>
    <div class="flex justify-end gap-2 mt-4">
      <button @click="open = false" class="px-4 py-2 border rounded">取消</button>
      <button @click="confirm()" class="px-4 py-2 bg-blue-500 text-white rounded">确认</button>
    </div>
  </div>
</div>`,

  toast: `<div x-data="toast" class="fixed top-4 right-4 z-50 space-y-2">
  <template x-for="t in toasts" :key="t.id">
    <div class="px-4 py-3 rounded-lg shadow-lg text-white flex items-center gap-2"
         :class="t.type === 'success' ? 'bg-green-500' : t.type === 'error' ? 'bg-red-500' : 'bg-blue-500'"
         x-show="t.show" x-transition.duration.500ms
         x-init="setTimeout(() => t.show = false, 3000)">
      <span x-text="t.msg"></span>
      <button @click="t.show = false" class="ml-2">&times;</button>
    </div>
  </template>
</div>`,

  skeleton: `<div class="animate-pulse space-y-4 p-4">
  <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
  <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
  <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
  <div class="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
</div>`,

  form: `<!-- page: form -->
<div x-data="formApp" class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 w-full max-w-md">
    <h1 class="text-2xl font-bold mb-6">表单</h1>
    <form @submit.prevent="submit">
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">名称 *</label>
        <input type="text" x-model="form.name" required class="w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600" :class="errors.name ? 'border-red-500' : ''">
        <span x-show="errors.name" class="text-red-500 text-sm" x-text="errors.name"></span>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">邮箱 *</label>
        <input type="email" x-model="form.email" required class="w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600" :class="errors.email ? 'border-red-500' : ''">
        <span x-show="errors.email" class="text-red-500 text-sm" x-text="errors.email"></span>
      </div>
      <button type="submit" class="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">提交</button>
    </form>
  </div>
</div>
<script>
document.addEventListener('alpine:init', () => {
  Alpine.data('formApp', () => ({
    form: { name: '', email: '' },
    errors: {},
    validate() {
      this.errors = {}
      if (!this.form.name) this.errors.name = '必填'
      if (!this.form.email || !this.form.email.includes('@')) this.errors.email = '格式不正确'
      return Object.keys(this.errors).length === 0
    },
    submit() {
      if (this.validate()) {
        this.$dispatch('toast', { type: 'success', msg: '提交成功' })
      }
    },
  }))
})
</script>`,
}
