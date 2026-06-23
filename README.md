# 🎧 Doc Audio Player

An AI-powered document player that reads your files aloud — section by section — in plain conversational English. Ask follow-up questions by typing or speaking. Built with vanilla JS, Groq (LLaMA 3.3), and Web Speech API.

---

## What it does

- Upload a `.docx`, `.txt`, or `.md` file
- The document gets chunked and a table of contents is generated automatically
- Each section is explained conversationally using RAG (only relevant chunks are sent to the LLM)
- Play, pause, skip sections — with word-level highlighting as it reads
- Ask questions about any section by typing or using your microphone
- Answers stream in and are read aloud automatically

---

## Project structure

```
doc-audio-player/
├── server.js           ← Node.js static file server
├── package.json        ← project manifest
├── render.yaml         ← Render deployment config
├── .gitignore
└── public/
    ├── index.html      ← HTML shell (no logic)
    ├── style.css       ← all styles
    └── js/
        ├── main.js         ← app entry point, wires everything
        ├── prompts.js      ← all LLM prompts (edit here to change AI tone)
        ├── chunker.js      ← file reading + RAG chunking
        ├── ragClient.js    ← all Groq API calls
        ├── player.js       ← Web Speech API + word highlighting
        └── storage.js      ← API key and session state management
```

---

## Requirements

- [Node.js](https://nodejs.org) v18 or higher (for running locally)
- A free [Groq API key](https://console.groq.com/keys)
- A modern browser — Chrome or Edge recommended (best Web Speech API support)

---

## Run locally

```bash
# 1. Clone or unzip the project
cd doc-audio-player

# 2. Start the server (no npm install needed — zero dependencies)
node server.js
```

You'll see:

```
🎧  Doc Audio Player

   Local   → http://localhost:3000
   Network → http://192.168.x.x:3000   ← open this on your phone
```

Open the Local URL in your browser, or the Network URL on any device on the same WiFi.

> **Note:** Both devices must be on the same WiFi network for the Network URL to work.

---

## Test on mobile (same WiFi)

1. Run `node server.js` on your computer
2. Note the `Network →` URL printed in the terminal
3. Type that URL into your phone's browser
4. The app works fully on mobile — microphone input included

---

## Deploy to Render (free, public URL)

Render gives you a permanent public URL for free. The app sleeps after 15 minutes of inactivity and takes ~30 seconds to wake on the next visit.

### Step 1 — Push to GitHub

```bash
cd doc-audio-player
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/doc-audio-player.git
git push -u origin main
```

### Step 2 — Create a Render Web Service

1. Go to [render.com](https://render.com) and sign up (free, use GitHub login)
2. Click **New** → **Web Service**
3. Connect your GitHub account and select the `doc-audio-player` repository
4. Render auto-detects settings from `render.yaml` — no manual config needed
5. Click **Deploy**
6. Wait ~2 minutes → you get a URL like `https://doc-audio-player.onrender.com`

Share that URL with anyone — no installation needed on their end.

### Keep it from sleeping (optional)

The free Render tier sleeps after 15 min of no traffic. To prevent this:

1. Sign up at [UptimeRobot](https://uptimerobot.com) (free)
2. Add a new monitor → HTTP(S) → paste your Render URL
3. Set interval to 10 minutes
4. Done — the service stays awake

---

## Get a Groq API key

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up free — no credit card required
3. Click **Create API Key**
4. Copy the key (starts with `gsk_`)
5. Paste it into the app when prompted

The key is held in memory only — never stored in the browser or sent anywhere except directly to Groq's API.

**Free tier limits:** ~14,400 tokens/minute, resets every minute. Plenty for normal use.

---

## Customise the AI voice and tone

All prompts are in `public/js/prompts.js`. Edit this file to change how the AI explains things or answers questions.

- `SYSTEM_EXPLAIN` — controls the tone and style of section explanations
- `SYSTEM_QA` — controls how follow-up questions are answered
- `buildTOCPrompt()` — controls how the table of contents is generated
- `buildExplainPrompt()` — builds the per-section RAG prompt
- `buildQAPrompt()` — builds the Q&A prompt with conversation history

---

## How RAG works in this app

1. The uploaded document is split into overlapping ~700-token chunks
2. When explaining a section, the app scores every chunk against the section title and keywords
3. The top 4 most relevant chunks are retrieved and injected into the prompt as context
4. The LLM only sees those chunks — not the full document — keeping token usage low
5. For Q&A, the top 5 chunks are retrieved based on the section + question keywords
6. Conversation history (last 4 turns) is also included so follow-up questions have context

---

## Browser support

| Browser | Explanation | Word highlight | Voice input | Voice output    |
| ------- | ----------- | -------------- | ----------- | --------------- |
| Chrome  | ✅          | ✅             | ✅          | ✅              |
| Edge    | ✅          | ✅             | ✅          | ✅              |
| Safari  | ✅          | ✅             | ✅          | ✅ (iOS voices) |
| Firefox | ✅          | ✅             | ❌          | ⚠️ limited      |

Chrome or Edge gives the best experience overall.

---

## Troubleshooting

**App doesn't move past the upload screen**

- Make sure you've entered your Groq API key before uploading
- Check the browser console (F12) for error messages

**"Groq error 401"**

- Your API key is invalid or expired — generate a new one at [console.groq.com/keys](https://console.groq.com/keys)

**"Groq error 429"**

- You've hit the rate limit — wait 60 seconds and try again

**Voice input not working**

- Voice input requires Chrome or Edge
- Make sure you've granted microphone permission when the browser asks

**Audio not playing**

- Some browsers require a user gesture before allowing audio — click anywhere on the page first
- Check that your device volume is up and not muted

**Render app takes long to load**

- The free tier sleeps after 15 min — first request takes ~30s to wake up
- Set up UptimeRobot (see above) to keep it awake

**`.docx` file not reading correctly**

- The app uses [mammoth.js](https://github.com/mwilliamson/mammoth.js) loaded from CDN — make sure you have internet access when uploading
- Very complex formatting (tables, embedded images) may not extract perfectly — plain text content always works

---

## Tech stack

| Layer           | Technology                                   |
| --------------- | -------------------------------------------- |
| Server          | Node.js (built-ins only, zero dependencies)  |
| Frontend        | Vanilla JS ES modules                        |
| LLM             | Groq API — LLaMA 3.3 70B                     |
| RAG             | Keyword-scored chunk retrieval (client-side) |
| TTS             | Web Speech API (browser built-in)            |
| Voice input     | Web Speech Recognition API                   |
| `.docx` parsing | mammoth.js (CDN)                             |
| Hosting         | Render (free tier)                           |
