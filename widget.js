
(function () {
  // ------- DOM refs -------
  const dom = {
    tbody: null,
    error: null,
    tableTitle: null,
    qHeader: null,
    choiceHeader: null,
    dateHeader: null,
    reloadBtn: null,
    status: null
  };

  // ------- Configuration (defaults) -------
  let CONFIG = {
    // Headers/UI
    tableTitle: "Learning & Development Evaluation",
    colQuestionHeader: "Question",
    colChoiceHeader: "Response",
    colDateHeader: "Date",

    // Global choices (used when no per-row choices exist)
    choices: ["Yes", "No", "N/A"],

    // Core behaviour
    enforceRequired: false,
    restrictMaxToday: true,      // prevent future dates
    updateDateOnChange: false,   // reset date to today every time response changes
    showReloadButton: true,      // show/hide the Reload button

    // CSV config
    csvUrl: "",
    csvText: "",
    csvHasHeader: true,
    csvQuestionColumn: "Question",   // header name or 0-based index
    csvChoicesColumn: "Choices",     // header or index; optional
    csvChoicesDelimiter: "|",        // e.g., "Yes|No|N/A"
    csvCodeColumn: "Code",           // optional per-row code
    csvCacheBuster: true,

    // Fallback questions (used when CSV missing/unavailable)
    questions: [
      "Access Employee Portal within PageUp",
      "Complete Workplace Behaviour training",
      "Review HSE Essentials procedures",
      "Navigate to Operational Excellence Framework",
      "Complete training plan 1:1 with Staffing Development"
    ]
  };

  // Data derived from CSV (array of { q, choices?, code? })
  let ROWS = []; // canonical questions source used for rendering

  // ------- Helpers -------
  const todayStr = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  };

  function setHeight() {
    try {
      const h = document.body.scrollHeight + 16;
      if (window.JFCustomWidget?.requestFrameResize) {
        JFCustomWidget.requestFrameResize({ height: h });
      }
    } catch { /* no-op */ }
  }

  function setError(msg) {
    if (!msg) { dom.error.hidden = true; dom.error.textContent = ""; return; }
    dom.error.hidden = false; dom.error.textContent = msg;
  }

  function setStatus(msg) {
    dom.status.textContent = msg || "";
  }

  function normaliseChoices(cSetting) {
    if (!cSetting) return CONFIG.choices;
    if (Array.isArray(cSetting)) return cSetting;
    const s = String(cSetting).trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try { return JSON.parse(s); } catch {}
    }
    return s.split(",").map(x => x.trim()).filter(Boolean);
  }

  function applyHeaders() {
    dom.tableTitle.textContent = CONFIG.tableTitle;
    dom.qHeader.textContent = CONFIG.colQuestionHeader;
    dom.choiceHeader.textContent = CONFIG.colChoiceHeader;
    dom.dateHeader.textContent = CONFIG.colDateHeader;

    dom.reloadBtn.style.display = CONFIG.showReloadButton ? "inline-flex" : "none";
  }

  // ------- CSV handling -------
  async function loadCsvText() {
    let csvText = "";
    if (CONFIG.csvUrl) {
      const url = CONFIG.csvCacheBuster
        ? CONFIG.csvUrl + (CONFIG.csvUrl.includes("?") ? "&" : "?") + "_=" + Date.now()
        : CONFIG.csvUrl;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`CSV HTTP ${resp.status}`);
      csvText = await resp.text();
    } else if (CONFIG.csvText) {
      csvText = CONFIG.csvText;
    }
    return csvText;
  }

  function resolveColumn(hasHeader, metaFields, columnSpecifier) {
    // Accept header name, numeric string or number
    if (!hasHeader) {
      if (typeof columnSpecifier === "number") return columnSpecifier;
      if (typeof columnSpecifier === "string" && /^\d+$/.test(columnSpecifier)) return parseInt(columnSpecifier, 10);
      return 0; // default first column
    }
    // has header:
    if (typeof columnSpecifier === "string" && !/^\d+$/.test(columnSpecifier)) {
      const i = (metaFields || []).indexOf(columnSpecifier);
      return i >= 0 ? i : 0;
    }
    if (typeof columnSpecifier === "number") return columnSpecifier;
    if (typeof columnSpecifier === "string" && /^\d+$/.test(columnSpecifier)) return parseInt(columnSpecifier, 10);
    return 0;
  }

  function parseCsvForRows(text, hasHeader, questionColSpec, choicesColSpec, codeColSpec, choicesDelimiter) {
    if (!window.Papa) throw new Error("Papa Parse not found");

    const parsed = Papa.parse(text, {
      header: !!hasHeader,
      skipEmptyLines: "greedy",
      transformHeader: h => String(h || "").trim()
    });
    if (parsed.errors?.length) {
      console.warn("CSV parse warnings/errors:", parsed.errors.slice(0, 3));
    }

    const rowsOut = [];

    if (hasHeader) {
      const fields = parsed.meta?.fields || [];
      const qIdx = resolveColumn(true, fields, questionColSpec);
      const cIdx = choicesColSpec != null ? resolveColumn(true, fields, choicesColSpec) : null;
      const codeIdx = codeColSpec != null ? resolveColumn(true, fields, codeColSpec) : null;

      parsed.data.forEach(obj => {
        const rowArr = fields.map(f => obj[f]);
        const q = String(rowArr[qIdx] ?? "").trim();
        if (!q) return;

        const r = { q };
        if (cIdx != null) {
          const rawChoices = String(rowArr[cIdx] ?? "").trim();
          if (rawChoices) {
            r.choices = rawChoices.split(choicesDelimiter).map(s => s.trim()).filter(Boolean);
          }
        }
        if (codeIdx != null) {
          const code = String(rowArr[codeIdx] ?? "").trim();
          if (code) r.code = code;
        }
        rowsOut.push(r);
      });
    } else {
      // No header => arrays
      const qIdx = resolveColumn(false, null, questionColSpec);
      const cIdx = choicesColSpec != null ? resolveColumn(false, null, choicesColSpec) : null;
      const codeIdx = codeColSpec != null ? resolveColumn(false, null, codeColSpec) : null;

      parsed.data.forEach(arr => {
        if (!Array.isArray(arr)) return;
        const q = String(arr[qIdx] ?? "").trim();
        if (!q) return;

        const r = { q };
        if (cIdx != null) {
          const rawChoices = String(arr[cIdx] ?? "").trim();
          if (rawChoices) {
            r.choices = rawChoices.split(choicesDelimiter).map(s => s.trim()).filter(Boolean);
          }
        }
        if (codeIdx != null) {
          const code = String(arr[codeIdx] ?? "").trim();
          if (code) r.code = code;
        }
        rowsOut.push(r);
      });
    }

    return rowsOut;
  }

  async function loadRowsFromCsv() {
    const text = await loadCsvText();
    if (!text) return null;

    const rows = parseCsvForRows(
      text,
      !!CONFIG.csvHasHeader,
      CONFIG.csvQuestionColumn,
      CONFIG.csvChoicesColumn || null,
      CONFIG.csvCodeColumn || null,
      CONFIG.csvChoicesDelimiter || "|"
    );

    if (!rows?.length) throw new Error("No questions parsed from CSV");

    return rows;
  }

  // ------- Render / collect / hydrate -------
  function renderTable(rows, globalChoices) {
    dom.tbody.innerHTML = "";

    rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");

      // Column 1: read-only question (HTML supported)
      const tdQ = document.createElement("td");
      const p = document.createElement("p");
      p.className = "q";
      p.innerHTML = row.q;         // <-- HTML rendering enabled (links, lists, formatting)
      p.setAttribute("aria-readonly", "true");
      tdQ.appendChild(p);
      tr.appendChild(tdQ);

      // Column 2: single choice (radio group)
      const tdChoice = document.createElement("td");
      tdChoice.className = "choice-cell";
      const groupName = `row-${rowIndex}-choice`;

      const group = document.createElement("div");
      group.className = "radio-group";
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", `${CONFIG.colChoiceHeader} for "${stripHtml(row.q)}"`);

      const options = Array.isArray(row.choices) && row.choices.length ? row.choices : globalChoices;
      options.forEach((label, idx) => {
        const id = `${groupName}-${idx}`;
        const wrap = document.createElement("div");
        wrap.className = "radio-wrap";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = groupName;
        input.id = id;
        input.value = label;

        const lab = document.createElement("label");
        lab.setAttribute("for", id);
        lab.textContent = label;

        wrap.appendChild(input);
        wrap.appendChild(lab);
        group.appendChild(wrap);
      });

      tdChoice.appendChild(group);
      tr.appendChild(tdChoice);

      // Column 3: date picker
      const tdDate = document.createElement("td");
      const date = document.createElement("input");
      date.type = "date";
      date.className = "date";
      date.placeholder = "YYYY-MM-DD";
      if (CONFIG.restrictMaxToday) date.max = todayStr();
      tdDate.appendChild(date);
      tr.appendChild(tdDate);

      // Default/refresh date when a radio is selected
      group.addEventListener("change", () => {
        const shouldSet = CONFIG.updateDateOnChange || !date.value;
        if (shouldSet) {
          const t = todayStr();
          date.value = t;
          if (CONFIG.restrictMaxToday) date.max = t;
        }
        setHeight();
      });

      date.addEventListener("input", setHeight);

      dom.tbody.appendChild(tr);
    });

    setHeight();
  }

  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return (tmp.textContent || tmp.innerText || "").trim();
  }

  function collectData() {
    const out = [];
    const trs = dom.tbody.querySelectorAll("tr");
    trs.forEach((tr) => {
      const questionHtml = tr.querySelector(".q")?.innerHTML ?? "";
      const questionText = stripHtml(questionHtml);
      const choice = tr.querySelector('input[type="radio"]:checked')?.value ?? "";
      const date = tr.querySelector('input[type="date"]')?.value ?? "";

      // Look up code (if available) by matching text content
      const meta = ROWS.find(r => stripHtml(r.q) === questionText);
      const code = meta?.code;

      const rowOut = { question: questionText, choice, date };
      if (code) rowOut.code = code;
      out.push(rowOut);
    });
    return out;
  }

  // Hydrate by QUESTION TEXT (stable even if order changes)
  function hydrateValue(prevValue) {
    if (!prevValue) return;
    let savedRows;
    try { savedRows = typeof prevValue === "string" ? JSON.parse(prevValue) : prevValue; }
    catch { return; }
    if (!Array.isArray(savedRows)) return;

    savedRows.forEach(saved => {
      const tr = Array.from(dom.tbody.querySelectorAll("tr"))
        .find(tr0 => (stripHtml(tr0.querySelector(".q")?.innerHTML ?? "")) === saved.question);
      if (!tr) return;

      if (saved.choice) {
        const input = tr.querySelector(`input[type="radio"][value="${CSS.escape(saved.choice)}"]`);
        if (input) input.checked = true;
      }
      if (saved.date) {
        const date = tr.querySelector('input[type="date"]');
        if (date) date.value = saved.date;
      }
    });
  }

  // ------- Settings -------
  function readSettings() {
    const gs = (n, def) => {
      try { return JFCustomWidget.getWidgetSetting(n) ?? def; }
      catch { return def; }
    };

    CONFIG.tableTitle          = gs("tableTitle", CONFIG.tableTitle);
    CONFIG.colQuestionHeader   = gs("colQuestionHeader", CONFIG.colQuestionHeader);
    CONFIG.colChoiceHeader     = gs("colChoiceHeader", CONFIG.colChoiceHeader);
    CONFIG.colDateHeader       = gs("colDateHeader", CONFIG.colDateHeader);
    CONFIG.choices             = normaliseChoices(gs("choices", CONFIG.choices));
    CONFIG.enforceRequired     = !!gs("enforceRequired", CONFIG.enforceRequired);
    CONFIG.restrictMaxToday    = gs("restrictMaxToday", CONFIG.restrictMaxToday) !== false;
    CONFIG.updateDateOnChange  = !!gs("updateDateOnChange", CONFIG.updateDateOnChange);
    CONFIG.showReloadButton    = gs("showReloadButton", CONFIG.showReloadButton) !== false;

    // CSV settings
    CONFIG.csvUrl              = (gs("csvUrl", "") || "").trim();
    CONFIG.csvText             = gs("csvText", "");
    CONFIG.csvHasHeader        = !!gs("csvHasHeader", true);

    // normalise columns (allow numeric strings)
    const colQ   = gs("csvQuestionColumn", "Question");
    const colC   = gs("csvChoicesColumn", "Choices");
    const colCode= gs("csvCodeColumn", "Code");
    CONFIG.csvQuestionColumn   = (typeof colQ === "string" && /^\d+$/.test(colQ)) ? parseInt(colQ, 10) : colQ;
    CONFIG.csvChoicesColumn    = (typeof colC === "string" && /^\d+$/.test(colC)) ? parseInt(colC, 10) : colC;
    CONFIG.csvCodeColumn       = (typeof colCode === "string" && /^\d+$/.test(colCode)) ? parseInt(colCode, 10) : colCode;

    CONFIG.csvChoicesDelimiter = gs("csvChoicesDelimiter", CONFIG.csvChoicesDelimiter);
    CONFIG.csvCacheBuster      = !!gs("csvCacheBuster", true);

    // Fallback non-CSV questions (support newline or JSON array)
    const q = gs("questions", CONFIG.questions);
    CONFIG.questions = Array.isArray(q) ? q : String(q || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  // ------- Fetch & render flow (supports Reload) -------
  async function fetchAndRender({ preserve = true } = {}) {
    // Capture current answers to re-apply after reload (by question text)
    const snapshot = preserve ? collectData() : [];

    setStatus("Loading…");
    dom.reloadBtn.disabled = true;

    try {
      const csvRows = (CONFIG.csvUrl || CONFIG.csvText) ? (await loadRowsFromCsv()) : null;

      if (csvRows?.length) {
        ROWS = csvRows;
        setError("");
      } else {
        // Fall back to manual questions
        ROWS = CONFIG.questions.map(q => ({ q }));
      }

      renderTable(ROWS, CONFIG.choices);

      if (snapshot.length) hydrateValue(snapshot);

    } catch (err) {
      console.warn("CSV load failed; using fallback list:", err);
      if (!ROWS.length) {
        ROWS = CONFIG.questions.map(q => ({ q }));
        renderTable(ROWS, CONFIG.choices);
      }
      setError("Could not load CSV questions. Using fallback list.");
    } finally {
      setStatus("");
      dom.reloadBtn.disabled = false;
      setHeight();
    }
  }

  // ------- Init -------
  async function init() {
    dom.tbody = document.getElementById("tbody");
    dom.error = document.getElementById("error");
    dom.tableTitle = document.getElementById("tableTitle");
    dom.qHeader = document.getElementById("qHeader");
    dom.choiceHeader = document.getElementById("choiceHeader");
    dom.dateHeader = document.getElementById("dateHeader");
    dom.reloadBtn = document.getElementById("reloadBtn");
    dom.status = document.getElementById("status");

    readSettings();
    applyHeaders();

    // Bind Reload
    dom.reloadBtn.addEventListener("click", () => fetchAndRender({ preserve: true }));

    // Initial load
    await fetchAndRender({ preserve: false });

    // Hydrate saved value (edit/approval flows)
    const existing = (typeof JFCustomWidget.getValue === "function") ? JFCustomWidget.getValue() : null;
    if (existing) hydrateValue(existing);

    setHeight();

    // Submit handler
    JFCustomWidget.subscribe("submit", function () {
      if (CONFIG.enforceRequired) {
        // Require a selection in every row
        const missing = Array.from(dom.tbody.querySelectorAll("tr")).some(tr =>
          !tr.querySelector('input[type="radio"]:checked'));
        if (missing) {
          setError("Please answer all rows before submitting.");
          JFCustomWidget.sendSubmit({ valid: false });
          return;
        }
      }

      setError("");
      const value = collectData(); // array of {question, choice, date, code?}
      JFCustomWidget.sendSubmit({ valid: true, value: JSON.stringify(value) });
    });
  }

  // Best practice: run inside 'ready'
  if (window.JFCustomWidget?.subscribe) {
    JFCustomWidget.subscribe("ready", () => { init().catch(console.error); });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (window.JFCustomWidget) JFCustomWidget.subscribe("ready", () => { init().catch(console.error); });
    });
  }
})();
