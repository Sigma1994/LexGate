import path from 'node:path';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.html',
  '.htm',
  '.json',
  '.rtf',
] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

export interface ProcessedDocumentResult {
  raw_text: string;
  pages: Array<{ page_number: number; text: string }>;
  detected_format: string;
  pages_extracted: number;
  extracted_chars: number;
  processing_summary: string;
  suggested_title: string;
  suggested_citation: string;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : '';
    });
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function htmlTableToMarkdown(tableHtml: string): string {
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const rows: string[][] = [];

  for (const rowHtml of rowMatches) {
    const cellMatches = rowHtml.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? [];
    if (cellMatches.length === 0) continue;
    const cells = cellMatches.map((cell) =>
      stripTags(cell.replace(/<br\s*\/?>/gi, ' ')).replace(/\|/g, '\\|')
    );
    rows.push(cells);
  }

  if (rows.length === 0) return '';
  const maxCols = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < maxCols) copy.push('');
    return copy;
  });

  const header = `| ${padded[0].join(' | ')} |`;
  const sep = `| ${padded[0].map(() => '---').join(' | ')} |`;
  const body = padded.slice(1).map((r) => `| ${r.join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

export function htmlToCleanMarkdown(html: string): string {
  let working = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  // Convert HTML tables to Markdown tables first
  working = working.replace(/<table[\s\S]*?<\/table>/gi, (tbl) => {
    const md = htmlTableToMarkdown(tbl);
    return md ? `\n\n${md}\n\n` : '\n\n';
  });

  // Headings
  working = working.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => {
    const hashes = '#'.repeat(Math.min(6, Math.max(1, Number(lvl))));
    const txt = stripTags(inner);
    return txt ? `\n\n${hashes} ${txt}\n\n` : '\n\n';
  });

  // List items
  working = working.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => {
    const txt = stripTags(inner);
    return txt ? `\n- ${txt}` : '';
  });

  // Block breaks
  working = working
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|ul|ol)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');

  const decoded = decodeHtmlEntities(working);
  return decoded
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseDelimitedRows(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function delimitedToMarkdownSections(text: string, delimiter: ',' | '\t', titleHint: string): string {
  const rows = parseDelimitedRows(text, delimiter);
  if (rows.length === 0) return '';
  if (rows.length === 1) return rows[0].join(' | ');

  const header = rows[0].map((c) => c.replace(/\|/g, '\\|'));
  const colCount = header.length;
  const sep = header.map(() => '---');
  const dataRows = rows.slice(1).map((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push('');
    return padded.slice(0, colCount).map((c) => c.replace(/\|/g, '\\|'));
  });

  // Chunk large tables in groups of 25 rows with repeated headers for clean Qdrant retrieval
  const chunkSize = 25;
  const sections: string[] = [];
  for (let start = 0; start < dataRows.length; start += chunkSize) {
    const slice = dataRows.slice(start, start + chunkSize);
    const partLabel =
      dataRows.length > chunkSize
        ? `### ${titleHint} (Rows ${start + 1}–${start + slice.length})\n`
        : '';
    const lines = [
      `${partLabel}| ${header.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...slice.map((r) => `| ${r.join(' | ')} |`),
    ];
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

function jsonToCleanSections(raw: string): string {
  const parsed = JSON.parse(raw) as unknown;
  const lines: string[] = [];

  const renderNode = (node: unknown, prefix = ''): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      lines.push(prefix ? `${prefix}: ${String(node)}` : String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          if (idx > 0) lines.push('');
          renderNode(item, prefix ? `${prefix}[${idx + 1}]` : `Item ${idx + 1}`);
        } else {
          lines.push(`- ${String(item)}`);
        }
      });
      return;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const label = prefix ? `${prefix} · ${k}` : k;
        if (typeof v === 'object' && v !== null) {
          lines.push(`\n### ${label}`);
          renderNode(v, '');
        } else {
          lines.push(`- **${label}:** ${String(v ?? '')}`);
        }
      }
    }
  };

  renderNode(parsed);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function rtfToCleanText(rtf: string): string {
  return rtf
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object)[\s\S]*?\}/gi, '')
    .replace(/\\par[d]?/gi, '\n\n')
    .replace(/\\line/gi, '\n')
    .replace(/\\tab/gi, '  ')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePlainOrMarkdown(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function suggestTitleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 3 ? cleaned : 'Uploaded Policy Document';
}

function suggestCitationFromTextOrFilename(text: string, filename: string): string {
  const match = text.match(/\b([A-Z]{2,6}\/[A-Z0-9-]{2,10}(?:\/\d{2,4})?)\b/);
  if (match?.[1]) return match[1].slice(0, 40);
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 14);
  return `DOC/${base || 'POLICY'}/${new Date().getFullYear()}`;
}

export async function processUploadedDocumentBuffer(params: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<ProcessedDocumentResult> {
  const { buffer, filename } = params;
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty (0 bytes).');
  }

  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.doc') {
    throw new Error(
      'Legacy binary .doc files are not supported directly. Please save the Word document as .docx or .pdf and upload again.'
    );
  }
  if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(ext as SupportedUploadExtension)) {
    throw new Error(
      `Unsupported file format "${ext || 'unknown'}". Supported formats: ${SUPPORTED_UPLOAD_EXTENSIONS.join(', ')}.`
    );
  }

  const titleHint = suggestTitleFromFilename(filename);
  let rawText = '';
  let structuredPages: Array<{ page_number: number; text: string }> = [];
  let detectedFormat = ext.replace('.', '').toUpperCase();
  let pagesExtracted = 1;
  let processingSummary = '';

  if (ext === '.pdf') {
    const result = await extractText(new Uint8Array(buffer), { mergePages: false });
    const rawPageArray = Array.isArray(result.text) ? result.text : [String(result.text ?? '')];
    structuredPages = rawPageArray
      .map((p, idx) => ({
        page_number: idx + 1,
        text: normalizePlainOrMarkdown(p),
      }))
      .filter((p) => p.text.length > 0);
    pagesExtracted = result.totalPages || structuredPages.length || 1;
    rawText = structuredPages.map((p) => p.text).join('\n\n');
    if (rawText.trim().length < 20) {
      throw new Error(
        'This PDF appears to contain scanned images rather than selectable text (or is empty). Run OCR first or upload a searchable PDF / DOCX / TXT file.'
      );
    }
    detectedFormat = 'PDF Document';
    processingSummary = `Extracted ${structuredPages.length} searchable page(s) of ${pagesExtracted} total PDF page(s) with exact page numbers -> Qdrant-ready sections`;
  } else if (ext === '.docx') {
    const htmlRes = await mammoth.convertToHtml({ buffer });
    rawText = htmlToCleanMarkdown(htmlRes.value || '');
    if (rawText.trim().length < 20) {
      const fallbackRes = await mammoth.extractRawText({ buffer });
      rawText = normalizePlainOrMarkdown(fallbackRes.value || '');
    }
    if (rawText.trim().length < 20) {
      throw new Error('Could not extract readable text from this .docx file.');
    }
    const sections = rawText.split(/\n{2,}/).filter(Boolean);
    structuredPages = sections.map((text, idx) => ({ page_number: idx + 1, text }));
    pagesExtracted = Math.max(1, sections.length);
    detectedFormat = 'Word Document (.docx)';
    processingSummary = `Converted DOCX headings, paragraphs & Word tables into ${sections.length} Markdown section(s)`;
  } else if (ext === '.csv' || ext === '.tsv') {
    const delimiter: ',' | '\t' = ext === '.tsv' ? '\t' : ',';
    const utf8 = buffer.toString('utf8');
    rawText = delimitedToMarkdownSections(utf8, delimiter, titleHint);
    const sections = rawText.split(/\n{2,}/).filter(Boolean);
    structuredPages = sections.map((text, idx) => ({ page_number: idx + 1, text }));
    pagesExtracted = Math.max(1, sections.length);
    detectedFormat = ext === '.tsv' ? 'TSV Spreadsheet' : 'CSV Spreadsheet';
    processingSummary = `Parsed delimited spreadsheet into ${sections.length} header-preserved Markdown table section(s)`;
  } else if (ext === '.html' || ext === '.htm') {
    rawText = htmlToCleanMarkdown(buffer.toString('utf8'));
    const sections = rawText.split(/\n{2,}/).filter(Boolean);
    structuredPages = sections.map((text, idx) => ({ page_number: idx + 1, text }));
    pagesExtracted = Math.max(1, sections.length);
    detectedFormat = 'HTML Document';
    processingSummary = `Stripped markup/scripts safely and converted HTML content & tables into ${sections.length} Markdown section(s)`;
  } else if (ext === '.json') {
    try {
      rawText = jsonToCleanSections(buffer.toString('utf8'));
    } catch {
      throw new Error('Invalid JSON file. Please verify the file is valid UTF-8 JSON.');
    }
    const sections = rawText.split(/\n{2,}/).filter(Boolean);
    structuredPages = sections.map((text, idx) => ({ page_number: idx + 1, text }));
    pagesExtracted = Math.max(1, sections.length);
    detectedFormat = 'JSON Policy Data';
    processingSummary = `Structured JSON objects/arrays into ${sections.length} readable policy section(s)`;
  } else if (ext === '.rtf') {
    rawText = rtfToCleanText(buffer.toString('utf8'));
    const sections = rawText.split(/\n{2,}/).filter(Boolean);
    structuredPages = sections.map((text, idx) => ({ page_number: idx + 1, text }));
    pagesExtracted = Math.max(1, sections.length);
    detectedFormat = 'Rich Text (.rtf)';
    processingSummary = `Stripped RTF control codes into ${sections.length} clean text section(s)`;
  } else {
    rawText = normalizePlainOrMarkdown(buffer.toString('utf8'));
    const sections = rawText.split(/\n{2,}/).filter(Boolean);
    structuredPages = sections.map((text, idx) => ({ page_number: idx + 1, text }));
    pagesExtracted = Math.max(1, sections.length);
    detectedFormat = ext === '.txt' ? 'Plain Text (.txt)' : 'Markdown (.md)';
    processingSummary = `Normalized line endings into ${sections.length} section(s)`;
  }

  if (rawText.trim().length < 20) {
    throw new Error('Extracted policy content is too short (minimum 20 characters required).');
  }
  if (rawText.length > 500_000) {
    rawText = rawText.slice(0, 500_000);
    processingSummary += ' (trimmed at 500,000-char limit)';
  }

  return {
    raw_text: rawText,
    pages: structuredPages,
    detected_format: detectedFormat,
    pages_extracted: pagesExtracted,
    extracted_chars: rawText.length,
    processing_summary: processingSummary,
    suggested_title: titleHint,
    suggested_citation: suggestCitationFromTextOrFilename(rawText, filename),
  };
}
