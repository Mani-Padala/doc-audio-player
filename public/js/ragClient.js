// ── ragClient.js ──────────────────────────────────────────────────────────────
// All Groq API communication. Handles TOC generation and streamed explanations.
// ─────────────────────────────────────────────────────────────────────────────

import { buildTOCPrompt, buildExplainPrompt, buildQAPrompt, SYSTEM_EXPLAIN, SYSTEM_QA } from './prompts.js';
import { retrieveChunks } from './chunker.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

export let totalTokensUsed = 0;

// ── Core request ──────────────────────────────────────────────────────────────
async function _call(apiKey, messages, { stream = false, maxTokens = 1024, temp = 0.75 } = {}) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: temp, stream, messages }),
  });

  if (!res.ok) {
    let msg = `Groq error ${res.status}`;
    try { const e = await res.json(); msg = e.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res;
}

// ── Streaming helper — calls onToken for each streamed token ──────────────────
async function _stream(apiKey, messages, opts, onToken) {
  const res     = await _call(apiKey, messages, { ...opts, stream: true });
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const token  = parsed.choices?.[0]?.delta?.content;
        if (token) { full += token; onToken?.(token, full); }
        // Track token usage when Groq sends it
        const usage = parsed.x_groq?.usage;
        if (usage) totalTokensUsed += (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
      } catch (_) {}
    }
  }
  return full;
}

// ── Generate table of contents (non-streaming, needs JSON back) ───────────────
export async function generateTOC(apiKey, chunks) {
  const res  = await _call(apiKey, [
    { role: 'system', content: 'Output only valid JSON arrays. No markdown fences, no explanation.' },
    { role: 'user',   content: buildTOCPrompt(chunks) },
  ], { maxTokens: 3000, temp: 0.2 });

  const data = await res.json();
  totalTokensUsed += data.usage?.total_tokens || 0;

  let raw = data.choices[0].message.content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error('Could not parse TOC from LLM response: ' + raw.slice(0, 200));
  }
}

// ── Explain a section — streams tokens, returns full text ─────────────────────
export async function explainSection(apiKey, section, chunks, onToken) {
  const relevant = retrieveChunks(chunks, section.chunkHint || '', section.title, 4);
  return _stream(apiKey, [
    { role: 'system', content: SYSTEM_EXPLAIN },
    { role: 'user',   content: buildExplainPrompt(section.title, relevant) },
  ], { maxTokens: 600, temp: 0.8 }, onToken);
}

// ── Answer a Q&A question — streams tokens, returns full text ─────────────────
export async function answerQuestion(apiKey, question, section, chunks, history, onToken) {
  const relevant = retrieveChunks(chunks, section.chunkHint || '', section.title, 5);
  return _stream(apiKey, [
    { role: 'system', content: SYSTEM_QA },
    { role: 'user',   content: buildQAPrompt(question, section.title, relevant, history) },
  ], { maxTokens: 500, temp: 0.7 }, onToken);
}
