export const MERMAID_LIGHT = `%%{init: {
  'theme':'base',
  'themeVariables': {
    'primaryColor':'#eef2ff',     'primaryTextColor':'#1e1b4b',  'primaryBorderColor':'#6366f1',
    'secondaryColor':'#f5f5f5',   'tertiaryColor':'#fafafa',
    'lineColor':'#4f46e5',        'textColor':'#171717',
    'mainBkg':'#eef2ff',          'nodeBorder':'#6366f1',
    'clusterBkg':'#f5f5f5',       'clusterBorder':'#d4d4d4',
    'edgeLabelBackground':'#ffffff',
    'fontFamily':'ui-sans-serif, system-ui, -apple-system'
  }
}}%%\n`

export const MERMAID_DARK = `%%{init: {
  'theme':'base',
  'themeVariables': {
    'primaryColor':'#312e81',     'primaryTextColor':'#e0e7ff',  'primaryBorderColor':'#818cf8',
    'secondaryColor':'#262626',   'tertiaryColor':'#171717',
    'lineColor':'#a5b4fc',        'textColor':'#fafafa',
    'mainBkg':'#312e81',          'nodeBorder':'#818cf8',
    'clusterBkg':'#262626',       'clusterBorder':'#404040',
    'edgeLabelBackground':'#0a0a0a',
    'fontFamily':'ui-sans-serif, system-ui, -apple-system'
  }
}}%%\n`

/** 给 markdown 中所有 ```mermaid 块补 init 头；已有 init 头的块会被覆盖。 */
export function injectMermaidTheme(md: string, theme: "light" | "dark"): string {
  const header = theme === "dark" ? MERMAID_DARK : MERMAID_LIGHT
  return md.replace(/```mermaid\s*\n(?:%%\{\s*init:[^}]*\}\s*%%\s*\n)?/g, "```mermaid\n" + header)
}
