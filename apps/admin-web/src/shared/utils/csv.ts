type Cell = string | number | boolean | null | undefined

/** Byte order mark: tells Excel the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff)

const escapeCell = (value: Cell) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Builds CSV text; a BOM is added so Excel opens Cyrillic correctly. */
export function toCsv(header: string[], rows: Cell[][]) {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(','))
  return `${BOM}${lines.join('\n')}\n`
}

/** Saves text as a file via a temporary link. */
export function downloadTextFile(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
