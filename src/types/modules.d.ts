declare module "html-to-docx" {
  interface DocumentOptions {
    orientation?: "portrait" | "landscape"
    pageSize?: { width?: number; height?: number }
    margins?: {
      top?: number
      right?: number
      bottom?: number
      left?: number
      header?: number
      footer?: number
      gutter?: number
    }
    title?: string
    subject?: string
    creator?: string
    keywords?: string[]
    description?: string
    lastModifiedBy?: string
    revision?: number
    createdAt?: Date
    modifiedAt?: Date
    headerType?: "default" | "first" | "even"
    footerType?: "default" | "first" | "even"
  }

  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string,
    documentOptions?: DocumentOptions,
    footerHTMLString?: string,
  ): Promise<Buffer>

  export default HTMLtoDOCX
}
