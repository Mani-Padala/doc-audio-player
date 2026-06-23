// ── chunker.js ────────────────────────────────────────────────────────────────
// Reads uploaded files and splits them into overlapping chunks for RAG.
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE    = 700;  // target tokens per chunk (~500 words)
const CHARS_PER_TOK = 4;

// ── Load mammoth for .docx parsing (CDN, loaded on demand) ───────────────────
async function loadMammoth() {
  if (window.mammoth) return window.mammoth;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Failed to load mammoth.js — check your internet connection.'));
    document.head.appendChild(s);
  });
  return window.mammoth;
}

// ── Read file → raw text ──────────────────────────────────────────────────────
export async function readFile(file) {
  if (file.name.toLowerCase().endsWith('.docx')) {
    const mammoth = await loadMammoth();
    const result  = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!result.value?.trim()) throw new Error('Document appears empty or could not be read.');
    return result.value;
  }
  // .txt / .md
  const text = await file.text();
  if (!text?.trim()) throw new Error('File appears empty.');
  return text;
}

// ── Split raw text into overlapping chunks ────────────────────────────────────
export function chunkText(rawText) {
  const text  = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  const toks   = t => Math.ceil(t.length / CHARS_PER_TOK);
  const chunks = [];
  let cur = [], curT = 0;

  for (const para of paras) {
    const pt = toks(para);
    if (curT + pt <= CHUNK_SIZE) {
      cur.push(para);
      curT += pt;
    } else {
      if (cur.length) chunks.push(_makeChunk(cur, chunks.length));
      // carry last paragraph as overlap
      const overlap = cur.length ? [cur[cur.length - 1]] : [];
      cur  = [...overlap, para];
      curT = overlap.reduce((s, p) => s + toks(p), 0) + pt;
    }
  }
  if (cur.length) chunks.push(_makeChunk(cur, chunks.length));
  return chunks;
}

function _makeChunk(paras, idx) {
  const text = paras.join('\n\n');
  return { id: idx, text, preview: text.slice(0, 100).replace(/\n/g, ' ') + '…' };
}

// ── Retrieve relevant chunks for a section (keyword scoring) ─────────────────
export function retrieveChunks(chunks, hint = '', title = '', max = 4) {
  if (!chunks.length) return [];

  const query    = `${title} ${hint}`.toLowerCase();
  const keywords = query
    .split(/\s+/)
    .filter(w => w.length > 3)
    .map(w => w.replace(/[^a-z0-9]/g, ''));

  const scored = chunks.map(c => {
    const lower = c.text.toLowerCase();
    const score = keywords.reduce(
      (s, kw) => s + (lower.match(new RegExp(kw, 'g')) || []).length,
      0
    );
    return { c, score };
  });

  const top = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.c.id - b.c.id); // restore document order

  // Fallback: return first two chunks if no keyword matches
  return (top.length ? top : scored.slice(0, 2)).map(s => s.c);
}
