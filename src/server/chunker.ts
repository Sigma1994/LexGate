import crypto from 'node:crypto';
import type { DocumentChunk, QuarantineRecord } from '../shared/types.ts';

export const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has',
  'will', 'shall', 'must', 'into', 'upon', 'under', 'only', 'any', 'all', 'not', 'but', 'per',
  'than', 'such', 'when', 'where', 'which', 'what', 'within', 'their', 'they', 'been', 'how',
  'many', 'did', 'does', 'who', 'whom', 'whose', 'why', 'can', 'could', 'would', 'should',
  'may', 'might', 'about', 'against', 'between', 'rules', 'rule', 'adopted', 'adopt', 'required',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.%/-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function extractKeywords(text: string, citationCode: string): string[] {
  const tokens = tokenize(`${citationCode} ${text}`);
  const freq = new Map<string, number>();
  for (const tok of tokens) {
    if (STOPWORDS.has(tok) || tok.length < 2) continue;
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 14)
    .map(([k]) => k);
}

function splitMarkdownTablePipeCount(line: string): number {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').length;
}

export function detectJaggedTable(block: string): {
  jagged: boolean;
  expectedColumns: number;
  observedLengths: number[];
  badRowIndex: number;
} {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  if (lines.length < 2) {
    return { jagged: false, expectedColumns: 0, observedLengths: [], badRowIndex: -1 };
  }
  const counts = lines.map(splitMarkdownTablePipeCount);
  const expected = counts[0];
  const badIdx = counts.findIndex((c) => c !== expected);
  return {
    jagged: badIdx !== -1,
    expectedColumns: expected,
    observedLengths: counts,
    badRowIndex: badIdx,
  };
}

function deterministicUuid(seed: string): string {
  const hex = crypto.createHash('sha256').update(seed).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function splitBlockIntoParentSections(pageText: string, maxParentChars = 1100): string[] {
  const rawParagraphs = pageText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (rawParagraphs.length === 0) return [];

  const parents: string[] = [];
  let buffer = '';

  for (const para of rawParagraphs) {
    const paraHasTable = para.split('\n').some((l) => l.trim().startsWith('|'));
    const bufHasTable = buffer.split('\n').some((l) => l.trim().startsWith('|'));

    if (!buffer) {
      buffer = para;
      continue;
    }

    // Keep tables as dedicated parent sections (unless tiny caption + table)
    if (
      buffer.length + para.length + 2 <= maxParentChars &&
      (!bufHasTable || !paraHasTable)
    ) {
      buffer = `${buffer}\n\n${para}`;
    } else {
      parents.push(buffer);
      buffer = para;
    }
  }
  if (buffer) {
    parents.push(buffer);
  }
  return parents;
}

function splitTableSectionIntoChildChunks(section: string, maxRowsPerChild = 2): string[] {
  const lines = section.split('\n');
  const firstPipeIdx = lines.findIndex((l) => l.trim().startsWith('|'));
  if (firstPipeIdx === -1) return [section];

  let lastPipeIdx = firstPipeIdx;
  for (let i = firstPipeIdx; i < lines.length; i++) {
    if (lines[i].trim().startsWith('|')) {
      lastPipeIdx = i;
    } else {
      break;
    }
  }

  const preamble = lines.slice(0, firstPipeIdx).join('\n').trim();
  const tableLines = lines.slice(firstPipeIdx, lastPipeIdx + 1).map((l) => l.trim());
  const postamble = lines.slice(lastPipeIdx + 1).join('\n').trim();

  if (tableLines.length < 3) {
    return [section];
  }

  const headerLine = tableLines[0];
  const hasSep = /^\|[\s:-|]+\|$/.test(tableLines[1]);
  const sepLine = hasSep ? tableLines[1] : null;
  const dataRows = tableLines.slice(hasSep ? 2 : 1);

  if (dataRows.length <= maxRowsPerChild && !postamble) {
    return [section];
  }

  const children: string[] = [];
  for (let start = 0; start < dataRows.length; start += maxRowsPerChild) {
    const slice = dataRows.slice(start, start + maxRowsPerChild);
    const tblParts = [headerLine, ...(sepLine ? [sepLine] : []), ...slice];
    let text = tblParts.join('\n');
    if (start === 0 && preamble) {
      text = `${preamble}\n${text}`;
    } else if (preamble) {
      const shortHeading = preamble.split('\n')[0].slice(0, 120);
      text = `${shortHeading}\n${text}`;
    }
    if (start + maxRowsPerChild >= dataRows.length && postamble) {
      text = `${text}\n${postamble}`;
    }
    children.push(text.trim());
  }

  if (postamble && children.length > 1 && postamble.length > 180) {
    // Give long postamble rule its own focused vector child as well
    children.push(postamble);
  }

  return children.length > 0 ? children : [section];
}

function splitProseSectionIntoChildChunks(section: string, targetChars = 340): string[] {
  if (section.length <= targetChars) {
    return [section];
  }

  const sentences = section
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 1) {
    // Hard word-boundary split for long single-sentence clauses
    const words = section.split(/\s+/);
    if (words.length <= 55) return [section];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')].filter(Boolean);
  }

  const children: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + sentence.length + 1 <= targetChars) {
      current = `${current} ${sentence}`;
    } else {
      children.push(current);
      current = sentence;
    }
  }
  if (current) {
    children.push(current);
  }

  // Merge tiny trailing fragment into previous child if under 90 chars
  if (children.length > 1 && children[children.length - 1].length < 90) {
    const last = children.pop()!;
    children[children.length - 1] = `${children[children.length - 1]} ${last}`;
  }

  return children;
}

export interface PageInput {
  page_number: number;
  text: string;
}

export interface ChunkPagesResult {
  parentChunks: DocumentChunk[];
  childChunks: DocumentChunk[];
  quarantined: QuarantineRecord[];
}

export function chunkDocumentPages(params: {
  doc_id: string;
  doc_title: string;
  version_id: string;
  citation_code: string;
  pages: PageInput[];
  run_id: string;
  now_iso?: string;
  deterministic_seed_prefix?: string;
  first_parent_id?: string;
  ocr_confidence?: number;
}): ChunkPagesResult {
  const nowIso = params.now_iso ?? new Date().toISOString();
  const ocrConfidence = params.ocr_confidence ?? 0.99;
  const parentChunks: DocumentChunk[] = [];
  const childChunks: DocumentChunk[] = [];
  const quarantined: QuarantineRecord[] = [];

  let parentSeq = 0;

  for (const page of params.pages) {
    const trimmedPage = page.text.trim();
    if (!trimmedPage) continue;

    const sections = splitBlockIntoParentSections(trimmedPage);
    for (let secIdx = 0; secIdx < sections.length; secIdx++) {
      const sec = sections[secIdx];
      const jaggedCheck = detectJaggedTable(sec);
      if (jaggedCheck.jagged) {
        const qId = params.deterministic_seed_prefix
          ? deterministicUuid(`${params.deterministic_seed_prefix}:q:${page.page_number}:${secIdx}`)
          : crypto.randomUUID();
        quarantined.push({
          quarantine_id: qId,
          run_id: params.run_id,
          doc_id: params.doc_id,
          doc_title: params.doc_title,
          page_number: page.page_number,
          reason_code: 'JAGGED_TABLE_COLUMNS',
          ocr_confidence: 0.88,
          raw_payload: {
            expected_columns: jaggedCheck.expectedColumns,
            observed_row_lengths: jaggedCheck.observedLengths,
            row_index: jaggedCheck.badRowIndex,
            snippet: sec.slice(0, 260),
            action_taken: 'Quarantined without auto-padding or LLM repair',
          },
          created_at: nowIso,
        });
        continue;
      }

      const isTable = sec.split('\n').some((l) => l.trim().startsWith('|'));
      const useFirstFixed = parentSeq === 0 && Boolean(params.first_parent_id);
      const parentId = useFirstFixed
        ? params.first_parent_id!
        : params.deterministic_seed_prefix
          ? deterministicUuid(`${params.deterministic_seed_prefix}:p:${page.page_number}:${secIdx}`)
          : crypto.randomUUID();
      parentSeq += 1;

      const parentChunk: DocumentChunk = {
        chunk_id: parentId,
        version_id: params.version_id,
        parent_chunk_id: null,
        chunk_tier: 'parent',
        kind: isTable ? 'table' : 'text',
        page_number: page.page_number,
        ocr_confidence: ocrConfidence,
        text_content: sec,
        token_count: tokenize(sec).length,
        keywords: extractKeywords(sec, params.citation_code),
      };
      parentChunks.push(parentChunk);

      const childTexts = isTable
        ? splitTableSectionIntoChildChunks(sec, 2)
        : splitProseSectionIntoChildChunks(sec, 340);

      childTexts.forEach((cText, childIdx) => {
        const childId = params.deterministic_seed_prefix
          ? deterministicUuid(`${params.deterministic_seed_prefix}:c:${page.page_number}:${secIdx}:${childIdx}`)
          : crypto.randomUUID();
        const childIsTable = cText.split('\n').some((l) => l.trim().startsWith('|'));
        childChunks.push({
          chunk_id: childId,
          version_id: params.version_id,
          parent_chunk_id: parentId,
          chunk_tier: 'child',
          kind: childIsTable ? 'table' : 'text',
          page_number: page.page_number,
          ocr_confidence: ocrConfidence,
          text_content: cText,
          token_count: tokenize(cText).length,
          keywords: extractKeywords(cText, params.citation_code),
        });
      });
    }
  }

  return { parentChunks, childChunks, quarantined };
}
