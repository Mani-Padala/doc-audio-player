// ── player.js ─────────────────────────────────────────────────────────────────
// Web Speech API wrapper and word-level highlighter.
// ─────────────────────────────────────────────────────────────────────────────

const SPEEDS = [0.8, 1, 1.2, 1.5, 1.8];

// ── TTS Player ────────────────────────────────────────────────────────────────
export class Player {
  constructor() {
    this.isPlaying  = false;
    this.isPaused   = false;
    this._utterance = null;
    this._voices    = [];
    this._voice     = null;
    this._speedIdx  = 1;
    this._speed     = 1;

    // Callbacks set by main.js
    this.onEnd      = null;
    this.onProgress = null;
    this.onWord     = null;

    this._loadVoices();
  }

  // ── Voices ──────────────────────────────────────────────────────────────────
  _loadVoices() {
    const load = () => {
      this._voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      this._populateSelect();
    };
    load();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = load;
    }
  }

  _populateSelect() {
    const sel = document.getElementById('voiceSelect');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Default voice</option>';
    this._voices.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = v.name.replace(/Google |Microsoft /g, '');
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  setVoice(idx) {
    this._voice = idx !== '' ? this._voices[parseInt(idx)] : null;
  }

  // ── Speed ────────────────────────────────────────────────────────────────────
  cycleSpeed() {
    this._speedIdx = (this._speedIdx + 1) % SPEEDS.length;
    this._speed    = SPEEDS[this._speedIdx];
    return this._speed;
  }

  // ── Playback ─────────────────────────────────────────────────────────────────
  speak(text, onEndOverride) {
    this.stop();
    if (!text?.trim()) return;

    this._utterance      = new SpeechSynthesisUtterance(text);
    this._utterance.rate = this._speed;
    if (this._voice) this._utterance.voice = this._voice;

    const totalLen = text.length;
    const t0       = Date.now();

    this._utterance.onboundary = (e) => {
      if (e.name !== 'word') return;
      this.onWord?.(e.charIndex, e.charLength || 6);
      if (this.onProgress) {
        const elapsed = (Date.now() - t0) / 1000;
        this.onProgress({
          pct:      (e.charIndex / totalLen) * 100,
          elapsed,
          estTotal: e.charIndex > 0 ? (elapsed / e.charIndex) * totalLen : 0,
        });
      }
    };

    this._utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused  = false;
      this.onProgress?.({ pct: 100 });
      (onEndOverride || this.onEnd)?.();
    };

    this._utterance.onerror = (e) => {
      if (e.error !== 'interrupted') { this.isPlaying = false; this.isPaused = false; }
    };

    this.isPlaying = true;
    this.isPaused  = false;
    speechSynthesis.speak(this._utterance);
  }

  pause() {
    if (!this.isPlaying) return;
    speechSynthesis.pause();
    this.isPaused  = true;
    this.isPlaying = false;
  }

  resume() {
    if (!this.isPaused) return;
    speechSynthesis.resume();
    this.isPaused  = false;
    this.isPlaying = true;
  }

  stop() {
    speechSynthesis.cancel();
    this.isPlaying  = false;
    this.isPaused   = false;
    this._utterance = null;
  }

  get canResume() { return this.isPaused; }
}

// ── Word Highlighter ──────────────────────────────────────────────────────────
export class WordHighlighter {
  constructor(container) {
    this._container = container;
    this._spans     = [];
    this._lastIdx   = 0;
  }

  // Render text as individually-spanned words
  render(text) {
    this._spans   = [];
    this._lastIdx = 0;
    this._container.innerHTML = '';

    let pos = 0;
    for (const part of text.split(/(\s+)/)) {
      if (/^\s+$/.test(part)) {
        this._container.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = part;
        this._container.appendChild(span);
        this._spans.push({ span, start: pos, end: pos + part.length });
      }
      pos += part.length;
    }
  }

  // Highlight the word at charIndex
  highlight(charIndex) {
    this._spans.forEach(s => s.span.classList.remove('speaking'));

    // Search forward from last position (fast path)
    for (let i = this._lastIdx; i < this._spans.length; i++) {
      if (this._inRange(this._spans[i], charIndex)) {
        this._spans[i].span.classList.add('speaking');
        this._lastIdx = i;
        return;
      }
    }
    // Fallback: scan from beginning (after seeking or restart)
    for (let i = 0; i < this._spans.length; i++) {
      if (this._inRange(this._spans[i], charIndex)) {
        this._spans[i].span.classList.add('speaking');
        this._lastIdx = i;
        return;
      }
    }
  }

  _inRange(s, ci) { return s.start <= ci && ci <= s.end + 1; }

  clear()  { this._spans.forEach(s => s.span.classList.remove('speaking')); }
  reset()  { this.clear(); this._lastIdx = 0; }
}
