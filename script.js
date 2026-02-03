/* ═══════════════════════════════════════════════
   TransLumen — Application Logic
   ═══════════════════════════════════════════════ */

// ─── State ─────────────────────────────────────
let currentMode = "text";
let uploadedFile = null;
let translatedPages = [];

// ─── Constants ─────────────────────────────────
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const LANG_NAMES = {
  auto: "Auto Detect",
  en: "English",
  id: "Indonesian",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  nl: "Dutch",
  sv: "Swedish",
  pl: "Polish",
  th: "Thai",
  vi: "Vietnamese",
  ms: "Malay",
};

/* ═══ DOM READY ═══ */
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initDropzone();
  initSwapButton();
  loadThemeFromStorage();
});

/* ═══════════════════════════════════════════════
   1. DARK / LIGHT MODE TOGGLE
   ═══════════════════════════════════════════════ */
function initThemeToggle() {
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute("data-bs-theme");
  const next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-bs-theme", next);
  saveThemeToStorage(next);
}

function saveThemeToStorage(theme) {
  try {
    localStorage.setItem("tl-theme", theme);
  } catch (e) {
    /* ignore */
  }
}

function loadThemeFromStorage() {
  try {
    const saved = localStorage.getItem("tl-theme");
    if (saved) document.documentElement.setAttribute("data-bs-theme", saved);
  } catch (e) {
    /* ignore */
  }
}

/* ═══════════════════════════════════════════════
   2. SWAP LANGUAGES BUTTON
   ═══════════════════════════════════════════════ */
function initSwapButton() {
  document.getElementById("swapBtn").addEventListener("click", swapLangs);
}

function swapLangs() {
  const src = document.getElementById("sourceLang");
  const tgt = document.getElementById("targetLang");
  if (src.value === "auto") return; // can't swap auto-detect
  const tmp = src.value;
  src.value = tgt.value;
  tgt.value = tmp;
}

/* ═══════════════════════════════════════════════
   3. MODE SWITCH  (Text ↔ PDF)
   ═══════════════════════════════════════════════ */
function switchMode(mode) {
  currentMode = mode;

  // Toggle tab active state
  document
    .getElementById("textTabBtn")
    .classList.toggle("active", mode === "text");
  document
    .getElementById("pdfTabBtn")
    .classList.toggle("active", mode === "pdf");

  // Toggle panels
  document.getElementById("textMode").style.display =
    mode === "text" ? "flex" : "none";
  document.getElementById("pdfMode").style.display =
    mode === "pdf" ? "block" : "none";

  // Hide PDF output when switching
  hidePdfOutput();

  // Update footer label
  updateCharCount();
}

/* ═══════════════════════════════════════════════
   4. CHARACTER / FILE COUNTER
   ═══════════════════════════════════════════════ */
function updateCharCount() {
  const el = document.getElementById("charCount");
  if (currentMode === "text") {
    const len = document.getElementById("inputText").value.length;
    el.textContent = len + " character" + (len !== 1 ? "s" : "");
  } else {
    el.textContent = uploadedFile ? uploadedFile.name : "No file selected";
  }
}

/* ═══════════════════════════════════════════════
   5. PDF DRAG & DROP / FILE SELECT
   ═══════════════════════════════════════════════ */
function initDropzone() {
  const area = document.getElementById("dropArea");

  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.classList.add("dragover");
  });
  area.addEventListener("dragleave", (e) => {
    e.preventDefault();
    area.classList.remove("dragover");
  });
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") setFile(file);
  });
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) setFile(file);
}

function setFile(file) {
  // ── size guard ──
  if (file.size > MAX_FILE_BYTES) {
    alert(
      "File is too large (" +
        (file.size / (1024 * 1024)).toFixed(2) +
        " MB).\nMaximum allowed size is 20 MB.",
    );
    return;
  }

  uploadedFile = file;
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent =
    (file.size / (1024 * 1024)).toFixed(2) + " MB";
  document.getElementById("pdfInfo").classList.remove("d-none");
  document.getElementById("pdfInfo").classList.add("d-flex");
  updateCharCount();
}

function removeFile() {
  uploadedFile = null;
  translatedPages = [];
  document.getElementById("pdfInfo").classList.add("d-none");
  document.getElementById("pdfInfo").classList.remove("d-flex");
  document.getElementById("fileInput").value = "";
  hidePdfOutput();
  updateCharCount();
}

/* ═══════════════════════════════════════════════
   6. PROGRESS BAR HELPERS
   ═══════════════════════════════════════════════ */
function showProgress(visible) {
  const el = document.getElementById("progressWrap");
  el.classList.toggle("d-none", !visible);
}

function setProgress(pct, label) {
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressPercent").textContent = pct + "%";
  if (label) document.getElementById("progressText").textContent = label;
}

/* ═══════════════════════════════════════════════
   7. PDF OUTPUT HELPERS
   ═══════════════════════════════════════════════ */
function showPdfOutput() {
  document.getElementById("pdfOutput").classList.remove("d-none");
}
function hidePdfOutput() {
  document.getElementById("pdfOutput").classList.add("d-none");
}

/* ═══════════════════════════════════════════════
   8. MAIN TRANSLATE DISPATCHER
   ═══════════════════════════════════════════════ */
async function translate() {
  if (currentMode === "text") {
    await translateText();
  } else {
    await translatePdf();
  }
}

/* ═══════════════════════════════════════════════
   9. TEXT TRANSLATION  (via Anthropic API)
   ═══════════════════════════════════════════════ */
async function translateText() {
  const input = document.getElementById("inputText").value.trim();
  if (!input) {
    alert("Please enter some text to translate.");
    return;
  }

  const srcName = LANG_NAMES[document.getElementById("sourceLang").value];
  const tgtName = LANG_NAMES[document.getElementById("targetLang").value];

  const btn = document.getElementById("translateBtn");
  btn.classList.add("loading");
  btn.disabled = true;
  document.getElementById("outputText").value = "";

  const prompt = `You are a professional academic translator. Translate the following text from ${srcName} to ${tgtName}.

Rules:
- Preserve all formatting, paragraph breaks, and structure.
- Use formal, scholarly register.
- Keep technical and domain-specific terms accurate.
- Output ONLY the translated text. No explanations, no preamble.

Text to translate:
${input}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    document.getElementById("outputText").value =
      data.content?.[0]?.text ||
      "Translation failed. Please check your API access.";
  } catch (err) {
    document.getElementById("outputText").value = "Error: " + err.message;
  }

  btn.classList.remove("loading");
  btn.disabled = false;
}

/* ═══════════════════════════════════════════════
   10. PDF TRANSLATION  (via Anthropic API + PDF document input)
   ═══════════════════════════════════════════════ */
async function translatePdf() {
  if (!uploadedFile) {
    alert("Please upload a PDF file.");
    return;
  }

  const srcName = LANG_NAMES[document.getElementById("sourceLang").value];
  const tgtName = LANG_NAMES[document.getElementById("targetLang").value];

  const btn = document.getElementById("translateBtn");
  btn.classList.add("loading");
  btn.disabled = true;
  hidePdfOutput();
  translatedPages = [];
  showProgress(true);
  setProgress(0, "Reading PDF…");

  try {
    // 1. Convert file → base64
    const base64 = await fileToBase64(uploadedFile);
    setProgress(15, "Sending to Claude AI…");

    // 2. Build prompt — single continuous output, no page markers
    const prompt = `You are a professional academic translator. The attached PDF is a research or journal document.
Translate the ENTIRE document from ${srcName} to ${tgtName}.

Rules:
- Preserve all structure: headings, sub-headings, paragraphs, lists, figure captions, table contents, and references.
- Use formal, scholarly register throughout.
- Keep technical, scientific, and domain-specific terminology accurate.
- Translate every part of the document — do not skip or summarise anything.
- Output ONLY the translated text in one continuous block. No explanations or preamble.`;

    // 3. API call with document source
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    setProgress(75, "Translating…");
    const data = await res.json();
    const fullText = data.content?.[0]?.text || "";

    // 4. Store as a single block
    translatedPages = fullText.trim() ? [{ content: fullText.trim() }] : [];

    setProgress(100, "Done!");
    renderPdfOutput();
  } catch (err) {
    alert("Translation error: " + err.message);
  }

  btn.classList.remove("loading");
  btn.disabled = false;
  setTimeout(() => showProgress(false), 1400);
}

/* ═══════════════════════════════════════════════
   11. UTILITY — File → Base64
   ═══════════════════════════════════════════════ */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════
   13. RENDER PDF OUTPUT INSIDE THE CARD
   ═══════════════════════════════════════════════ */
function renderPdfOutput() {
  const container = document.getElementById("pdfPagesPreview");

  if (translatedPages.length === 0) {
    container.innerHTML =
      '<em style="color:var(--tl-ink-light);">No output received.</em>';
  } else {
    container.innerHTML = escapeHtml(translatedPages[0].content).replace(
      /\n/g,
      "<br>",
    );
  }

  showPdfOutput();
}

/* ═══════════════════════════════════════════════
   14. DOWNLOAD TRANSLATED TEXT AS .txt
   ═══════════════════════════════════════════════ */
function downloadTranslation() {
  const body = translatedPages.length > 0 ? translatedPages[0].content : "";

  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "translumen_output.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════
   15. UTILITY — HTML Escape
   ═══════════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
