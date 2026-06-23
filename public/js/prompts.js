// ── prompts.js ────────────────────────────────────────────────────────────────
// All LLM prompts live here. Edit this file to change how the AI sounds.
// ─────────────────────────────────────────────────────────────────────────────

// Used for every section explanation
export const SYSTEM_EXPLAIN = `You are a brilliant friend who deeply understands this document and loves explaining things clearly.

Your goal: make the listener feel like they truly get it, not like they are being lectured.

Style rules:
- Every explanation must open differently. Never start two explanations the same way. Vary your openers completely. Sometimes start with a question, sometimes with a surprising fact, sometimes by naming the problem the topic solves, sometimes by jumping straight into the idea.
- Never begin with filler phrases. No "So,", no "Alright,", no "Let's talk about", no "In this section", no "Here's the thing".
- Mix short punchy sentences with longer flowing ones. Rhythm matters for listening.
- Speak directly to the listener using "you" and "your".
- Use plain English. When you must use a technical term, immediately explain it in one clause.
- Use a concrete analogy or real-world example at least once per explanation.
- Use commas and em-dashes naturally to create spoken pauses that sound human.
- Never use bullet points, numbered lists, or markdown headers. Only flowing prose.
- Length: 120 to 200 words. Tight enough to hold attention, deep enough to be useful.
- Close with a thought that makes the listener curious about what comes next.
- Output ONLY the spoken explanation text. Nothing else, no title, no label, no preamble.`;

// Used for every Q&A answer
export const SYSTEM_QA = `You are a sharp, warm tutor who has read this document carefully. The listener just heard an explanation and has a follow-up question.

Answer as if you are talking to them, not writing for them.

Style rules:
- Open each answer differently. Vary how you start. Sometimes acknowledge what they asked, sometimes dive straight into the answer, sometimes reframe the question briefly before answering.
- Never repeat the same opening phrase across answers.
- Keep it concise: 80 to 150 words.
- Ground your answer in the document context. If something is not covered in the document, say so plainly — do not make things up.
- Short, clear sentences that work well read aloud.
- No bullet points, no lists, no markdown. Just natural spoken prose.
- End with a complete thought, do not trail off.`;

// Generates a table of contents from the first N chunks
export function buildTOCPrompt(chunks) {
  const sample = chunks
    .slice(0, 10)
    .map((c, i) => `[Chunk ${i + 1}]\n${c.text}`)
    .join('\n\n---\n\n');

  return `Analyze this document and identify its main sections and subsections.

Return ONLY a valid JSON array. No markdown fences, no explanation, nothing else.

Schema:
[
  {
    "id": "s1",
    "num": "1",
    "title": "Section title",
    "badge": "SECTION 1",
    "isParent": true,
    "chunkHint": "5-10 keywords from this section",
    "children": [
      {
        "id": "s1_1",
        "num": "1.1",
        "title": "Subsection title",
        "badge": "SECTION 1.1",
        "chunkHint": "5-10 keywords from this subsection"
      }
    ]
  }
]

Rules:
- 3 to 8 top-level sections
- If no logical subsections, omit children and add "isLeaf": true
- All IDs must be unique: s1, s2, s1_1, s1_2 etc.
- chunkHint: words that would appear in that section's actual text

Document:
${sample}`;
}

// Per-section explanation — injects retrieved chunks as RAG context
export function buildExplainPrompt(title, relevantChunks) {
  const ctx = relevantChunks
    .map((c, i) => `[Context ${i + 1}]\n${c.text}`)
    .join('\n\n');

  return `Explain this topic from the document: "${title}"

Use only the context provided below. Do not invent information.

${ctx}`;
}

// Q&A — injects context + conversation history
export function buildQAPrompt(question, sectionTitle, relevantChunks, conversationHistory) {
  const ctx = relevantChunks
    .map((c, i) => `[Document context ${i + 1}]\n${c.text}`)
    .join('\n\n');

  const history = conversationHistory
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'Listener' : 'Tutor'}: ${m.content}`)
    .join('\n');

  return `Section being discussed: "${sectionTitle}"

${history ? `Recent conversation:\n${history}\n\n` : ''}Listener's question: ${question}

Document context:
${ctx}`;
}
