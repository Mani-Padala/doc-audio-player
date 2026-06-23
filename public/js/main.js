// ── main.js ───────────────────────────────────────────────────────────────────
// Application entry point. Imports all modules and wires the UI together.
// ─────────────────────────────────────────────────────────────────────────────

import { apiKeyStore, chunksStore, tocStore, filenameStore, clearAll } from './storage.js';
import { readFile, chunkText } from './chunker.js';
import { generateTOC, explainSection, answerQuestion, totalTokensUsed } from './ragClient.js';
import { Player, WordHighlighter } from './player.js';

// ── Module-level state ────────────────────────────────────────────────────────
let chunks      = [];
let toc         = [];
let allItems    = [];   // flattened toc
let currentIdx  = -1;
let explanations = {};  // sectionId → cached explanation text
let qaHistory   = [];   // { role, content } — per section conversation
let isStreaming  = false;

const player = new Player();
let highlighter = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Player callbacks ──────────────────────────────────────────────────────────
player.onEnd = () => {
  _markDone(currentIdx);
  _setPlayIcon(false);
  _setStatus(false);
  if (currentIdx < allItems.length - 1) {
    setTimeout(() => _goToItem(currentIdx + 1, true), 700);
  }
};

player.onProgress = ({ pct, elapsed, estTotal }) => {
  $('progressBar').style.width = pct + '%';
  if (elapsed   != null) $('timeElapsed').textContent = _fmt(elapsed);
  if (estTotal  != null) $('timeTotal').textContent   = _fmt(estTotal);
};

player.onWord = (charIdx) => highlighter?.highlight(charIdx);

// ═══════════════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
function _showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════
// UPLOAD & PROCESSING
// ═══════════════════════════════════════════════════════════════════
const dropZone = $('dropZone');
const fileInput = $('fileInput');
let _pendingFile = null; // file selected but not yet processed

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) _fileSelected(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) _fileSelected(e.target.files[0]);
});

// Called when a file is picked — show it selected, enable Start button
function _fileSelected(file) {
  _pendingFile = file;

  // Update drop zone UI
  dropZone.classList.add('file-selected');
  $('dropIcon').textContent  = '✅';
  $('dropTitle').textContent = file.name;
  $('dropSub').textContent   = (file.size / 1024).toFixed(1) + ' KB — ready to process';
  $('dropTypes').style.display = 'none';

  // Enable start button
  const btn = $('startBtn');
  btn.textContent = '▶  Start processing';
  btn.disabled = false;
  btn.classList.add('ready');

  // Scroll start button into view on mobile
  btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}



// API key — memory only, never persisted
$('apiKeyInput').addEventListener('input', function () {
  apiKeyStore.set(this.value);
  this.classList.remove('error');
});

// Clear key on every page load (incl. back button)
window.addEventListener('pageshow', () => {
  $('apiKeyInput').value = '';
  apiKeyStore.clear();
});

async function _startProcessing(file) {
  const key = apiKeyStore.get();
  if (!key) {
    const inp = $('apiKeyInput');
    inp.classList.add('error');
    inp.focus();
    inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  _showScreen('processingScreen');
  _hideProcError();
  _resetSteps();
  explanations = {};

  // Step 1 — Read & chunk
  _setStep(1, 'active');
  try {
    const raw = await readFile(file);
    chunks = chunkText(raw);
    chunksStore.save(chunks);
    filenameStore.save(file.name);
    _setStep(1, 'done', `${chunks.length} chunks`);
  } catch (e) {
    _setStep(1, 'error');
    _showProcError('Could not read file: ' + e.message);
    return;
  }

  // Step 2 — Generate TOC via Groq
  _setStep(2, 'active');
  try {
    toc = await generateTOC(key, chunks);
    if (!Array.isArray(toc) || toc.length === 0) throw new Error('LLM returned an empty table of contents.');
    tocStore.save(toc);
    _setStep(2, 'done', `${toc.length} sections`);
  } catch (e) {
    _setStep(2, 'error');
    _showProcError('TOC generation failed: ' + e.message);
    return;
  }

  // Step 3 — Build player
  _setStep(3, 'active');
  await _tick(100);
  _buildPlayer(file.name, toc);
  _setStep(3, 'done');
  await _tick(400);
  _showScreen('playerApp');
}

// ═══════════════════════════════════════════════════════════════════
// PLAYER UI
// ═══════════════════════════════════════════════════════════════════
function _buildPlayer(filename, sections) {
  // Flatten sections + children into a single list
  allItems = [];
  sections.forEach(s => {
    allItems.push(s);
    s.children?.forEach(c => allItems.push(c));
  });

  const name = filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  $('docTitle').textContent = name;
  $('docMeta').textContent  = `${sections.length} sections · ${allItems.length} topics`;
  document.title = name + ' — Audio Player';

  // Build sidebar
  const sb = $('sidebar');
  sb.innerHTML = '<div class="sidebar-label">Contents</div>';
  sections.forEach(s => {
    sb.appendChild(_makeSidebarItem(s, false));
    s.children?.forEach(c => sb.appendChild(_makeSidebarItem(c, true)));
  });

  // Reset state
  currentIdx = -1;
  player.stop();
  _setPlayIcon(false);
  _setStatus(false);
  $('sectionCount').textContent = `0 / ${allItems.length}`;
  $('emptyState').style.display    = 'flex';
  $('sectionContent').style.display = 'none';
}

function _makeSidebarItem(item, isSub) {
  const div = document.createElement('div');
  div.className = 'section-item' + (isSub ? ' sub' : '');
  div.id = 'si-' + item.id;
  div.innerHTML = `
    <span class="section-num">${item.num}</span>
    <span class="section-name">${item.title}</span>
    <span class="done-mark" id="done-${item.id}">✓</span>
  `;
  div.addEventListener('click', () => _goToItem(allItems.findIndex(x => x.id === item.id), false));
  return div;
}

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════
async function _goToItem(idx, autoPlay = false) {
  if (idx < 0 || idx >= allItems.length) return;
  player.stop();
  currentIdx = idx;

  const item = allItems[idx];
  _renderSection(item);
  _updateSidebar();
  _clearQA();

  $('sectionCount').textContent  = `${idx + 1} / ${allItems.length}`;
  $('npTitle').textContent        = item.title;
  $('npSub').textContent          = item.badge || '';
  $('progressBar').style.width   = '0%';
  $('timeElapsed').textContent   = '0:00';
  $('timeTotal').textContent     = '—';

  if (autoPlay) await _fetchAndSpeak(item);
}

// ═══════════════════════════════════════════════════════════════════
// SECTION RENDERING
// ═══════════════════════════════════════════════════════════════════
function _renderSection(item) {
  $('emptyState').style.display    = 'none';
  $('sectionContent').style.display = 'block';
  $('secBadge').textContent   = item.badge || '';
  $('secHeading').textContent = item.title;

  const el = $('explanationText');
  if (explanations[item.id]) {
    highlighter = new WordHighlighter(el);
    highlighter.render(explanations[item.id]);
  } else {
    el.innerHTML = '<span style="color:var(--muted);font-size:14px">Generating explanation…</span>';
  }
}

// ── Fetch explanation via RAG + Groq, then speak ──────────────────────────────
async function _fetchAndSpeak(item) {
  const key = apiKeyStore.get();
  if (!key) {
    $('explanationText').textContent = '⚠ API key missing — reload and re-enter your Groq key.';
    return;
  }

  // Already cached — speak immediately
  if (explanations[item.id]) {
    player.speak(explanations[item.id]);
    _setPlayIcon(true);
    _setStatus(true);
    return;
  }

  // Stream explanation
  isStreaming = true;
  _setStatus(false, 'Generating…');
  const el = $('explanationText');
  el.innerHTML = '<span class="stream-cursor"></span>';

  try {
    const text = await explainSection(key, item, chunks, (_, full) => {
      el.textContent = full;
    });

    explanations[item.id] = text;
    highlighter = new WordHighlighter(el);
    highlighter.render(text);

    isStreaming = false;
    player.speak(text);
    _setPlayIcon(true);
    _setStatus(true);
  } catch (e) {
    isStreaming = false;
    el.textContent = '⚠ Error: ' + e.message;
    _setStatus(false, 'Error');
  }
}

// ═══════════════════════════════════════════════════════════════════
// PLAYER CONTROLS
// ═══════════════════════════════════════════════════════════════════
$('playBtn').addEventListener('click', async () => {
  if (isStreaming) return;
  if (currentIdx === -1) { await _goToItem(0, true); return; }

  if (player.isPlaying) {
    player.pause();
    _setPlayIcon(false);
    _setStatus(false);
  } else if (player.canResume) {
    player.resume();
    _setPlayIcon(true);
    _setStatus(true);
  } else {
    await _fetchAndSpeak(allItems[currentIdx]);
  }
});

$('prevBtn').addEventListener('click', () => {
  if (currentIdx > 0) _goToItem(currentIdx - 1, player.isPlaying || player.canResume);
});

$('nextBtn').addEventListener('click', () => {
  if (currentIdx < allItems.length - 1) _goToItem(currentIdx + 1, player.isPlaying || player.canResume);
});

$('speedBtn').addEventListener('click', () => {
  const s = player.cycleSpeed();
  const btn = $('speedBtn');
  btn.textContent = s + '×';
  btn.classList.toggle('on', s !== 1);
  if (player.isPlaying && currentIdx >= 0 && explanations[allItems[currentIdx].id]) {
    player.stop();
    player.speak(explanations[allItems[currentIdx].id]);
  }
});

$('voiceSelect').addEventListener('change', function () {
  player.setVoice(this.value);
});

// ═══════════════════════════════════════════════════════════════════
// Q&A
// ═══════════════════════════════════════════════════════════════════
function _clearQA() {
  qaHistory = [];
  $('qaThread').innerHTML   = '';
  $('tokensUsed').textContent = '';
}

$('sendBtn').addEventListener('click', _sendQuestion);
$('qaInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendQuestion(); }
});
$('qaInput').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

async function _sendQuestion() {
  const inp = $('qaInput');
  const q   = inp.value.trim();
  if (!q || isStreaming || currentIdx < 0) return;
  inp.value = '';
  inp.style.height = 'auto';

  const key = apiKeyStore.get();
  if (!key) { _addBubble('assistant', '⚠ API key missing — reload and re-enter your Groq key.'); return; }

  const item = allItems[currentIdx];
  _addBubble('user', q);
  const ansEl = _addBubble('assistant', null);

  // Thinking animation
  const thinking = document.createElement('div');
  thinking.className = 'qa-thinking';
  thinking.innerHTML = '<div class="qa-dot"></div><div class="qa-dot"></div><div class="qa-dot"></div>';
  ansEl.appendChild(thinking);

  qaHistory.push({ role: 'user', content: q });

  try {
    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size:14px;line-height:1.7';
    thinking.remove();
    ansEl.appendChild(textEl);

    let ansText = '';
    ansText = await answerQuestion(key, q, item, chunks, qaHistory.slice(0, -1), (_, full) => {
      textEl.textContent = full;
      ansEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    qaHistory.push({ role: 'assistant', content: ansText });

    // Speak button
    const playBtn = document.createElement('button');
    playBtn.className   = 'qa-play-btn';
    playBtn.textContent = '▶ Read aloud';
    playBtn.addEventListener('click', () => _speakQA(ansText, playBtn));
    ansEl.appendChild(playBtn);

    // Token counter
    $('tokensUsed').textContent = `Session tokens used: ~${totalTokensUsed}`;

    // Auto-speak answer
    _speakQA(ansText, playBtn);

  } catch (e) {
    thinking.remove();
    ansEl.innerHTML = `<div style="font-size:14px;color:var(--red)">⚠ ${e.message}</div>`;
  }
}

function _speakQA(text, btn) {
  player.stop();
  if (btn.classList.contains('playing')) {
    btn.classList.remove('playing');
    btn.textContent = '▶ Read aloud';
    return;
  }
  document.querySelectorAll('.qa-play-btn').forEach(b => {
    b.classList.remove('playing'); b.textContent = '▶ Read aloud';
  });
  btn.classList.add('playing');
  btn.textContent = '⏸ Pause';
  _setStatus(true, 'Reading answer…');

  player.speak(text, () => {
    btn.classList.remove('playing');
    btn.textContent = '▶ Read aloud';
    _setStatus(false);
  });
}

function _addBubble(role, text) {
  const thread = $('qaThread');
  const div    = document.createElement('div');
  div.className = 'qa-bubble ' + role;

  const label = document.createElement('div');
  label.className   = 'bubble-label';
  label.textContent = role === 'user' ? 'You' : 'Answer';
  div.appendChild(label);

  if (text) {
    const t = document.createElement('div');
    t.style.cssText = 'font-size:14px;line-height:1.7';
    t.textContent   = text;
    div.appendChild(t);
  }

  thread.appendChild(div);
  div.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return div;
}

// ═══════════════════════════════════════════════════════════════════
// VOICE INPUT
// ═══════════════════════════════════════════════════════════════════
let recognition  = null;
let isRecording  = false;

$('micBtn').addEventListener('click', () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Voice input not supported in this browser. Try Chrome.'); return; }

  if (isRecording) { recognition?.stop(); return; }

  recognition             = new SR();
  recognition.lang        = 'en-US';
  recognition.interimResults = true;

  const inp = $('qaInput');
  const btn = $('micBtn');
  btn.classList.add('recording');
  isRecording = true;

  recognition.onresult = e => {
    inp.value = Array.from(e.results).map(r => r[0].transcript).join('');
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
  };
  recognition.onend = () => {
    btn.classList.remove('recording');
    isRecording = false;
    if (inp.value.trim()) _sendQuestion();
  };
  recognition.onerror = () => { btn.classList.remove('recording'); isRecording = false; };
  recognition.start();
});

// ═══════════════════════════════════════════════════════════════════
// RESET
// ═══════════════════════════════════════════════════════════════════
function _resetToUpload() {
  player.stop();
  currentIdx   = -1;
  chunks       = [];
  toc          = [];
  allItems     = [];
  explanations = {};
  isStreaming  = false;
  _pendingFile = null;
  fileInput.value = '';

  // Reset drop zone UI
  dropZone.classList.remove('file-selected');
  $('dropIcon').textContent  = '📄';
  $('dropTitle').textContent = 'Drop your document here';
  $('dropSub').textContent   = 'or click to browse';
  $('dropTypes').style.display = '';
  const btn = $('startBtn');
  btn.textContent = 'Choose a file to continue';
  btn.disabled = true;
  btn.classList.remove('ready');

  clearAll();
  _resetSteps();
  _hideProcError();
  _showScreen('uploadScreen');
}

$('topbarIcon').addEventListener('click', _resetToUpload);
$('newFileBtn').addEventListener('click', _resetToUpload);
$('backBtn').addEventListener('click', _resetToUpload);
$('startBtn').addEventListener('click', () => {
  if (_pendingFile) _startProcessing(_pendingFile);
});

// ═══════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════
function _setPlayIcon(playing) {
  $('playIcon').innerHTML = playing
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

function _setStatus(active, label) {
  $('statusDot').className      = 'status-dot' + (active ? ' active' : '');
  $('statusLabel').textContent  = label ?? (active ? 'Playing' : 'Paused');
}

function _markDone(idx) {
  if (idx < 0 || idx >= allItems.length) return;
  document.getElementById('done-' + allItems[idx].id)?.classList.add('show');
}

function _updateSidebar() {
  document.querySelectorAll('.section-item').forEach(e => e.classList.remove('active'));
  if (currentIdx >= 0) {
    const el = document.getElementById('si-' + allItems[currentIdx].id);
    el?.classList.add('active');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function _setStep(n, state, detail) {
  const el  = $('step' + n);
  const ind = $('si' + n);
  el.className = 'proc-step ' + state;
  if      (state === 'active') ind.innerHTML  = '<div class="spinner"></div>';
  else if (state === 'done')   ind.textContent = detail ? `✓ ${detail}` : '✓';
  else if (state === 'error')  ind.textContent = '✗';
  else                          ind.textContent = '';
}

function _resetSteps() { [1, 2, 3].forEach(n => _setStep(n, '')); }

function _showProcError(msg) {
  const el = $('procError');
  el.textContent = msg;
  el.classList.add('visible');
  $('backBtn').classList.add('visible');
}

function _hideProcError() {
  $('procError').classList.remove('visible');
  $('backBtn').classList.remove('visible');
}

function _fmt(s) {
  if (!s || isNaN(s) || s <= 0) return '—';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function _tick(ms = 0) { return new Promise(r => setTimeout(r, ms)); }
