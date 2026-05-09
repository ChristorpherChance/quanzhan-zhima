export const PROMPT_FRAGMENTS = {
  scopeGuard: "不要扩范围（详见 docs/01-claude.md）。信息缺失就写「待补」+ 原因。",
  noMock: "不要 mock 数据；缺 API Key 就读 process.env，没有就抛错。",
  outputMd: "输出标准 markdown，代码块标注语言。",
} as const
