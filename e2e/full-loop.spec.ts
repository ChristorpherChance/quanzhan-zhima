import { test, expect } from "@playwright/test"

test("全链测试: 需求 → 设计 → 开发 → 审查", async ({ page }) => {
  test.setTimeout(120_000)

  // 1. 访问首页
  await page.goto("/")
  await expect(page.locator("body")).toBeVisible()

  // 2. 创建项目（输入一句话需求）
  await page.fill('input[placeholder*="需求"]', "做一个简易待办清单")
  await page.click('button:has-text("创建")')

  // 3. 等待项目创建并跳转
  await page.waitForURL(/\/projects\//, { timeout: 15_000 })
  const projectUrl = page.url()

  // 4. 验证需求阶段可访问
  await page.goto(`${projectUrl}/requirement`)
  await expect(page.locator("text=需求")).toBeVisible({ timeout: 10_000 })

  // 5. 验证设计阶段可访问
  await page.goto(`${projectUrl}/design`)
  await expect(page.locator("text=设计")).toBeVisible({ timeout: 10_000 })

  // 6. 验证开发阶段可访问
  await page.goto(`${projectUrl}/dev`)
  await expect(page.locator("body")).toBeVisible({ timeout: 10_000 })

  // 7. 验证审查阶段可访问
  await page.goto(`${projectUrl}/review`)
  await expect(page.locator("body")).toBeVisible({ timeout: 10_000 })
})
