/* ═══════════════════════════════════════════════════════════
   CODEMIND — app.js
   Wired for OpenRouter API
   ═══════════════════════════════════════════════════════════

   HOW TO SET YOUR KEY:
   1. Open this file in any text editor
   2. Replace 'YOUR_OPENROUTER_API_KEY_HERE' with your key
   3. Replace 'YOUR_MODEL_HERE' with your OpenRouter model
      e.g. 'meta-llama/llama-3.3-8b-instruct:free'
           'mistralai/mistral-7b-instruct:free'
           'google/gemma-2-9b-it:free'
   4. Save the file and open index.html in your browser

   ════════════════════════════════════════════════════════ */

const CONFIG = {
  API_KEY:  '',   // ← paste your key here
  MODEL:    '',                 // ← paste your model here
  ENDPOINT: 'https://openrouter.ai/api/v1/chat/completions',
};

/* ── System prompts per mode ── */
const PROMPTS = {
  review: `You are a senior code reviewer. Review the code for correctness, style, edge cases, and maintainability.
Use **bold** for key points, \`inline code\` for code references, and code blocks for examples.
Structure your response with: ## Summary, ## Issues Found (use ⚠️ HIGH / ⚡ MED / ✅ LOW severity), ## Recommendations`,

  debug: `You are a debugging expert. Find every bug, logic error, and runtime issue in the code.
Bold each bug title, explain the root cause clearly, and show the corrected code in a code block.
Structure: ## Bugs Found, ## Root Cause Analysis, ## Fixed Code`,

  explain: `You are a patient coding mentor. Explain what the code does in clear, simple terms.
Break it down step by step. Use headers for sections, bullet points for steps,
and code blocks to reference specific parts of the code.`,

  optimize: `You are a performance engineer. Analyze time complexity, memory usage, and readability.
Rate the current code's performance, explain bottlenecks, and provide an optimized version.
Structure: ## Complexity Analysis, ## Bottlenecks, ## Optimized Version, ## Improvement Summary`,

  security: `You are a security auditor. Identify ALL vulnerabilities: injection flaws, auth issues,
data exposure, insecure logic, etc. Rate each as CRITICAL / HIGH / MEDIUM / LOW.
Structure: ## Security Score /10, ## Vulnerabilities (severity + description + fix per item), ## Hardened Code`,

  refactor: `You are a clean-code expert. Refactor the code for readability, DRY principles, and best practices.
Explain each change you make. Provide the full refactored version in a code block.
Structure: ## What Changed & Why, ## Refactored Code, ## Before vs After Summary`,
};

/* ── Error classification map ── */
const ERROR_MAP = {
  auth:     { label: 'AUTH ERROR',    hint: 'Your API key is missing or invalid. Open app.js and set your CONFIG.API_KEY.' },
  rate:     { label: 'RATE LIMITED',  hint: 'You\'ve hit the rate limit. Wait 30 seconds and try again.' },
  overload: { label: 'OVERLOADED',    hint: 'The server is under high load. Wait a few seconds and retry.' },
  network:  { label: 'NO NETWORK',    hint: 'Check your internet connection, then try again.' },
  empty:    { label: 'INPUT EMPTY',   hint: 'Paste some code into the editor before analyzing.' },
  too_long: { label: 'TOO LONG',      hint: 'Code exceeds the limit. Try a smaller snippet (under 30,000 chars).' },
  timeout:  { label: 'TIMEOUT',       hint: 'The request timed out. Check your connection or retry.' },
  parse:    { label: 'PARSE ERROR',   hint: 'Unexpected API response format. Check the browser console (F12).' },
  unknown:  { label: 'UNKNOWN ERROR', hint: 'An unexpected error occurred. Open the browser console (F12) for details.' },
};

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
let selectedMode = 'review';
let chatHistory  = JSON.parse(localStorage.getItem('codemind_history') || '[]');
let activeIndex  = null;

/* ═══════════════════════════════════════════════════════════
   DOM REFERENCES
═══════════════════════════════════════════════════════════ */
const codeInput    = document.getElementById('codeInput');
const analyzeBtn   = document.getElementById('analyzeBtn');
const btnText      = document.getElementById('btnText');
const lineCount    = document.getElementById('lineCount');
const errorPanel   = document.getElementById('errorPanel');
const errorMsg     = document.getElementById('errorMsg');
const errorType    = document.getElementById('errorType');
const errorHint    = document.getElementById('errorHint');
const responseArea = document.getElementById('responseArea');
const historyList  = document.getElementById('historyList');
const emptyHistory = document.getElementById('emptyHistory');
const langSelect   = document.getElementById('langSelect');

/* ═══════════════════════════════════════════════════════════
   MODE TABS
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('.mode-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

/* ═══════════════════════════════════════════════════════════
   EDITOR — stats + keyboard shortcuts
═══════════════════════════════════════════════════════════ */
codeInput.addEventListener('input', updateStats);

codeInput.addEventListener('keydown', e => {
  // Tab → 2 spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = codeInput.selectionStart;
    codeInput.value = codeInput.value.slice(0, s) + '  ' + codeInput.value.slice(s);
    codeInput.selectionStart = codeInput.selectionEnd = s + 2;
  }
  // Ctrl/Cmd + Enter → analyze
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    analyze();
  }
});

function updateStats() {
  const v = codeInput.value;
  const lines = v ? v.split('\n').length : 0;
  lineCount.textContent = `${lines} line${lines !== 1 ? 's' : ''} · ${v.length.toLocaleString()} chars`;
}

updateStats();

/* ═══════════════════════════════════════════════════════════
   ERROR HANDLING
═══════════════════════════════════════════════════════════ */
function classifyError(err, status) {
  const m = (err.message || '').toLowerCase();
  if (!navigator.onLine)                                          return 'network';
  if (status === 401 || m.includes('api_key') || m.includes('auth') || m.includes('unauthorized')) return 'auth';
  if (status === 429 || m.includes('rate limit') || m.includes('too many')) return 'rate';
  if (status === 529 || status === 503 || m.includes('overload') || m.includes('unavailable')) return 'overload';
  if (status === 408 || m.includes('timeout'))                   return 'timeout';
  if (m.includes('too long') || m.includes('token') || m.includes('context length')) return 'too_long';
  if (m.includes('parse') || m.includes('json') || m.includes('unexpected')) return 'parse';
  return 'unknown';
}

function showError(err, status) {
  const key  = classifyError(err, status);
  const info = ERROR_MAP[key];
  errorType.textContent = info.label;
  errorMsg.textContent  = err.message || String(err);
  errorHint.textContent = info.hint;
  errorPanel.classList.add('show');
}

function clearError() {
  errorPanel.classList.remove('show');
}

/* ═══════════════════════════════════════════════════════════
   MARKDOWN RENDERER
   Converts AI markdown response → safe HTML with syntax highlighting
═══════════════════════════════════════════════════════════ */
function renderMarkdown(raw) {
  // Step 1: escape HTML to prevent XSS
  let t = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Step 2: fenced code blocks with syntax highlighting
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    // unescape for hljs processing
    const src = code
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const highlighted = (lang && hljs.getLanguage(lang))
      ? hljs.highlight(src, { language: lang }).value
      : hljs.highlightAuto(src).value;
    return `<pre><code class="hljs">${highlighted}</code></pre>`;
  });

  // Step 3: headings
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Step 4: bold / italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  t = t.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Step 5: inline code
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Step 6: blockquote
  t = t.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Step 7: severity badges
  t = t.replace(/⚠️\s*HIGH/g,       '<span class="sev-high">⚠️ HIGH</span>');
  t = t.replace(/⚡\s*MED(IUM)?/g,  '<span class="sev-med">⚡ MED</span>');
  t = t.replace(/✅\s*LOW/g,        '<span class="sev-low">✅ LOW</span>');
  t = t.replace(/\bCRITICAL\b/g,    '<span class="sev-high">CRITICAL</span>');

  // Step 8: horizontal rule
  t = t.replace(/^---$/gm, '<hr>');

  // Step 9: unordered lists
  t = t.replace(/((?:^[-*] .+\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^[-*] /, '')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });

  // Step 10: ordered lists
  t = t.replace(/((?:^\d+\. .+\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  });

  // Step 11: paragraphs
  t = t.replace(/\n\n(?!<)/g, '</p><p>');
  t = `<p>${t}</p>`;
  t = t.replace(/\n(?!<)/g, '<br>');

  // Step 12: clean up malformed <p> wrapping around block elements
  t = t.replace(/<p>\s*<\/p>/g, '');
  ['h1','h2','h3','ul','ol','pre','hr','blockquote'].forEach(tag => {
    t = t.replace(new RegExp(`<p>(<${tag}>)`, 'g'), '$1');
    t = t.replace(new RegExp(`(</${tag}>)</p>`, 'g'), '$1');
  });

  return t;
}

/* ═══════════════════════════════════════════════════════════
   RENDER RESPONSE PANEL
═══════════════════════════════════════════════════════════ */
function renderResponse(item) {
  const time = new Date(item.timestamp).toLocaleTimeString();

  responseArea.innerHTML = `
    <div class="response-panel">
      <div class="response-header">
        <div class="response-meta">
          <span class="res-badge">${item.mode.toUpperCase()}</span>
          <span class="res-model">${CONFIG.MODEL} · ${time}</span>
        </div>
        <div class="res-actions">
          <button class="res-btn" id="copyResBtn">Copy</button>
          <button class="res-btn" id="reuseBtn">Reuse Code</button>
        </div>
      </div>
      <div class="response-body">${renderMarkdown(item.response)}</div>
    </div>
  `;

  document.getElementById('copyResBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(item.response).then(() => {
      const btn = document.getElementById('copyResBtn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });

  document.getElementById('reuseBtn').addEventListener('click', () => {
    codeInput.value = item.code;
    updateStats();
    codeInput.focus();
    codeInput.scrollIntoView({ behavior: 'smooth' });
  });
}

/* ═══════════════════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════════════════ */
function saveHistory() {
  localStorage.setItem('codemind_history', JSON.stringify(chatHistory.slice(0, 50)));
}

function renderHistory() {
  if (!chatHistory.length) {
    historyList.innerHTML = '';
    historyList.appendChild(emptyHistory);
    return;
  }

  emptyHistory.remove();
  historyList.innerHTML = '';

  chatHistory.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'history-item' + (i === activeIndex ? ' active' : '');
    el.innerHTML = `
      <div class="hi-mode">${item.mode.toUpperCase()} · ${item.lang || 'auto'}</div>
      <div class="hi-preview">${item.code.slice(0, 80).replace(/\n/g, ' ')}</div>
      <div class="hi-time">${new Date(item.timestamp).toLocaleString()}</div>
    `;
    el.addEventListener('click', () => {
      activeIndex = i;
      codeInput.value = item.code;
      updateStats();

      // Switch to matching mode tab
      document.querySelectorAll('.mode-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === item.mode);
      });
      selectedMode = item.mode;

      clearError();
      renderResponse(item);
      renderHistory();
      responseArea.scrollIntoView({ behavior: 'smooth' });
    });
    historyList.appendChild(el);
  });
}

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  if (!confirm('Clear all session history?')) return;
  chatHistory  = [];
  activeIndex  = null;
  saveHistory();
  renderHistory();
  responseArea.innerHTML = '';
});

/* ═══════════════════════════════════════════════════════════
   ANALYZE — main API call
═══════════════════════════════════════════════════════════ */
analyzeBtn.addEventListener('click', analyze);

async function analyze() {
  const code = codeInput.value.trim();
  clearError();

  // ── Input validation ──
  if (!code) {
    showError(new Error('Code input is empty. Paste some code to analyze.'), null);
    return;
  }
  if (code.length > 30000) {
    showError(new Error(`Code is too long (${code.length.toLocaleString()} chars). Max ~30,000.`), null);
    return;
  }
  if (!CONFIG.API_KEY || CONFIG.API_KEY === 'YOUR_OPENROUTER_API_KEY_HERE') {
    showError(new Error('No API key set. Open app.js and fill in CONFIG.API_KEY.'), 401);
    return;
  }
  if (!CONFIG.MODEL || CONFIG.MODEL === 'YOUR_MODEL_HERE') {
    showError(new Error('No model set. Open app.js and fill in CONFIG.MODEL.'), null);
    return;
  }

  // ── Detect language ──
  const lang = langSelect.value !== 'auto'
    ? langSelect.value
    : (hljs.highlightAuto(code).language || 'unknown');

  // ── Loading state ──
  setLoading(true);
  responseArea.innerHTML = `
    <div class="response-panel" style="opacity:0.5">
      <div class="response-header">
        <div class="response-meta">
          <span class="res-badge">WORKING</span>
          <span class="res-model">thinking…</span>
        </div>
      </div>
      <div class="response-body" style="font-family:var(--font-code);font-size:13px;color:var(--muted2)">
        Analyzing your code<span class="typing-cursor"></span>
      </div>
    </div>`;

  let statusCode = null;

  try {
    const response = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'HTTP-Referer': window.location.href,
        'X-Title': 'CodeMind',
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: PROMPTS[selectedMode],
          },
          {
            role: 'user',
            content: `Language: ${lang}\n\n\`\`\`${lang}\n${code}\n\`\`\``,
          },
        ],
      }),
    });

    statusCode = response.status;

    if (!response.ok) {
      let body = {};
      try { body = await response.json(); } catch (_) {}
      const msg = body?.error?.message || `HTTP ${response.status} — ${response.statusText}`;
      throw Object.assign(new Error(msg), { status: response.status });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '(no response received)';

    // ── Save to history ──
    const item = {
      mode:      selectedMode,
      lang,
      code,
      response:  text,
      timestamp: Date.now(),
    };

    chatHistory.unshift(item);
    activeIndex = 0;
    saveHistory();
    renderHistory();
    renderResponse(item);
    responseArea.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    responseArea.innerHTML = '';
    showError(err, statusCode || err.status);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  analyzeBtn.disabled = on;
  analyzeBtn.classList.toggle('loading', on);
  btnText.textContent = on ? 'Analyzing…' : 'Analyze';
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
renderHistory();
