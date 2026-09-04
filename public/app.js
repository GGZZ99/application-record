const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  store: null,
  editingId: null,
  draftScreenshots: [],
  saving: false,
};

const els = {
  count: $("#record-count"),
  search: $("#search-input"),
  statusFilter: $("#status-filter"),
  listPanel: $("#list-panel"),
  recordModal: $("#record-modal"),
  recordTitle: $("#record-modal-title"),
  recordForm: $("#record-form"),
  deleteRecordBtn: $("#btn-delete-record"),
  saveRecordBtn: $("#btn-save-record"),
  fieldsModal: $("#fields-modal"),
  fieldsList: $("#fields-list"),
  fieldAddForm: $("#field-add-form"),
  optionsLabel: $("#options-label"),
  app: $(".app"),
  viewRecords: $("#view-records"),
  viewResume: $("#view-resume"),
  navRecords: $("#nav-records"),
  navResume: $("#nav-resume"),
  resumeFileList: $("#resume-file-list"),
  resumePreview: $("#resume-preview"),
  resumeOpenBtn: $("#btn-resume-open"),
  resumeDirLabel: $("#resume-dir-label"),
  resumeCrumb: $("#resume-crumb"),
  toast: $("#toast"),
  lightbox: $("#lightbox"),
  lightboxImg: $("#lightbox-img"),
};

const modalMap = {
  record: () => els.recordModal,
  fields: () => els.fieldsModal,
};

let resumeFiles = [];
let resumeSelected = null;
let resumePath = "";
let currentView = "records";
let mammothLoading = null;
let markedLoading = null;

const mdNote = {
  active: false,
  mode: "edit", // edit | preview
  filename: null,
  title: "",
  body: "",
  saving: false,
};

let toastTimer = null;

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toast(message, type = "ok") {
  els.toast.hidden = false;
  els.toast.textContent = message;
  els.toast.classList.toggle("error", type === "error");
  requestAnimationFrame(() => els.toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => {
      els.toast.hidden = true;
    }, 200);
  }, 2800);
}

async function loadStore() {
  const res = await fetch("/api/store");
  if (!res.ok) throw new Error("无法读取数据");
  const data = await res.json();
  if (!Array.isArray(data.fields)) data.fields = [];
  if (!Array.isArray(data.records)) data.records = [];
  for (const record of data.records) {
    if (!Array.isArray(record.screenshots)) record.screenshots = [];
  }
  state.store = data;
}

async function saveStore() {
  const res = await fetch("/api/store", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.store),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "保存失败");
  }
}

function statusField() {
  return state.store.fields.find((f) => f.key === "status" && f.type === "select");
}

function statusTone(status) {
  if (!status) return "progress";
  if (status === "Offer") return "offer";
  if (status === "已拒绝" || status === "已放弃" || status === "已终止") return "reject";
  if (status === "待投递") return "accent";
  return "progress";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getValue(record, key) {
  return record?.values?.[key] ?? "";
}

function getScreenshots(record) {
  return Array.isArray(record?.screenshots) ? record.screenshots : [];
}

function shotUrl(filename) {
  return `/screenshots/${encodeURIComponent(filename)}`;
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const aDate = getValue(a, "applyDate") || a.updatedAt || a.createdAt || "";
    const bDate = getValue(b, "applyDate") || b.updatedAt || b.createdAt || "";
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

function filteredRecords() {
  const q = els.search.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  return sortRecords(state.store.records).filter((record) => {
    if (status && getValue(record, "status") !== status) return false;
    if (!q) return true;
    const company = String(getValue(record, "company")).toLowerCase();
    const position = String(getValue(record, "position")).toLowerCase();
    return company.includes(q) || position.includes(q);
  });
}

function listColumns() {
  return state.store.fields;
}

function isScreenshotsField(field) {
  return field?.type === "screenshots" || field?.key === "screenshots";
}

function renderStatusFilter() {
  const current = els.statusFilter.value;
  const field = statusField();
  const options = field?.options?.length
    ? field.options
    : [...new Set(state.store.records.map((r) => getValue(r, "status")).filter(Boolean))];

  els.statusFilter.innerHTML = `<option value="">全部状态</option>${options
    .map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
    .join("")}`;

  if ([...els.statusFilter.options].some((o) => o.value === current)) {
    els.statusFilter.value = current;
  }
}

function renderCount() {
  const total = state.store.records.length;
  const shown = filteredRecords().length;
  els.count.textContent =
    total === 0 ? "还没有记录" : shown === total ? `共 ${total} 条记录` : `显示 ${shown} / ${total} 条`;
}

function cellHtml(field, record) {
  if (isScreenshotsField(field)) {
    return `<div class="shot-cell">${screenshotsCellHtml(record)}</div>`;
  }
  const value = getValue(record, field.key);
  if (field.key === "company") {
    const position = getValue(record, "position");
    return `<span class="cell-main">${escapeHtml(value) || "未命名"}</span>${
      position ? `<span class="cell-sub">${escapeHtml(position)}</span>` : ""
    }`;
  }
  if (field.key === "position") {
    return escapeHtml(value) || "—";
  }
  if (field.type === "select" || field.key === "status") {
    return value
      ? `<span class="status-pill" data-tone="${statusTone(value)}">${escapeHtml(value)}</span>`
      : "—";
  }
  if (field.type === "textarea" || field.key === "notes") {
    return `<span class="cell-notes">${escapeHtml(value) || "—"}</span>`;
  }
  if (field.type === "date") {
    return `<span class="cell-muted">${escapeHtml(value) || "—"}</span>`;
  }
  return escapeHtml(value) || "—";
}

function screenshotsCellHtml(record, { removable = false } = {}) {
  const shots = getScreenshots(record);
  const thumbs = shots
    .map(
      (filename) => `
      <div class="shot-item">
        <img class="shot-thumb" src="${shotUrl(filename)}" alt="截图" data-shot-preview="${escapeHtml(filename)}" />
        ${
          removable
            ? `<button type="button" class="shot-remove" data-shot-remove="${escapeHtml(filename)}" aria-label="删除截图">×</button>`
            : ""
        }
      </div>`
    )
    .join("");

  return `
    <div class="shot-stack" data-shot-zone data-record-id="${escapeHtml(record.id)}">
      ${thumbs}
      <button type="button" class="shot-paste" data-shot-paste tabindex="0" title="点击后 Ctrl+V 粘贴截图">粘贴</button>
    </div>
  `;
}

function renderEmpty(message, actionLabel) {
  return `
    <div class="empty-state">
      <div>
        <h2>${escapeHtml(message)}</h2>
        <p>把公司、状态和各轮进度记下来，随时回来更新。</p>
      </div>
      <button type="button" class="btn btn-primary" id="btn-empty-add">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
        ${escapeHtml(actionLabel)}
      </button>
    </div>
  `;
}

function bindShotInteractions(root) {
  $$("[data-shot-zone]", root).forEach((zone) => {
    const pasteBtn = $("[data-shot-paste]", zone);
    pasteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      pasteBtn.focus();
      toast("已聚焦，可 Ctrl+V 粘贴截图");
    });
    pasteBtn?.addEventListener("keydown", (e) => e.stopPropagation());

    zone.addEventListener("click", (e) => {
      const preview = e.target.closest("[data-shot-preview]");
      if (preview) {
        e.stopPropagation();
        openLightbox(preview.dataset.shotPreview);
        return;
      }
      const removeBtn = e.target.closest("[data-shot-remove]");
      if (removeBtn) {
        e.stopPropagation();
        removeScreenshot(zone.dataset.recordId, removeBtn.dataset.shotRemove).catch((err) =>
          toast(err.message || "删除失败", "error")
        );
        return;
      }
      if (e.target.closest("[data-shot-paste]")) e.stopPropagation();
    });

    zone.addEventListener("paste", (e) => {
      e.stopPropagation();
      handlePasteEvent(e, zone.dataset.recordId).catch((err) => toast(err.message || "粘贴失败", "error"));
    });

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add("is-dragover");
      pasteBtn?.classList.add("is-dragover");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-dragover");
      pasteBtn?.classList.remove("is-dragover");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove("is-dragover");
      pasteBtn?.classList.remove("is-dragover");
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
      if (!file) {
        toast("请拖入图片文件", "error");
        return;
      }
      attachImageFile(zone.dataset.recordId, file).catch((err) => toast(err.message || "上传失败", "error"));
    });
  });
}

function renderList() {
  renderStatusFilter();
  renderCount();

  const records = filteredRecords();
  if (state.store.records.length === 0) {
    els.listPanel.innerHTML = renderEmpty("还没有记录", "新建第一条");
    $("#btn-empty-add")?.addEventListener("click", () => openRecordModal());
    return;
  }

  if (records.length === 0) {
    els.listPanel.innerHTML = renderEmpty("没有匹配的记录", "新增记录");
    $("#btn-empty-add")?.addEventListener("click", () => openRecordModal());
    return;
  }

  const cols = listColumns().filter(
    (f) => !(f.key === "position" && listColumns().some((c) => c.key === "company"))
  );

  const head = cols.map((f) => `<th>${escapeHtml(f.label)}</th>`).join("");

  const rows = records
    .map((record) => {
      const tds = cols
        .map((f) => {
          const cls = isScreenshotsField(f) ? ' class="shot-cell"' : "";
          return `<td${cls}>${cellHtml(f, record)}</td>`;
        })
        .join("");
      return `<tr data-id="${escapeHtml(record.id)}" tabindex="0">${tds}</tr>`;
    })
    .join("");

  const cards = records
    .map((record) => {
      const company = getValue(record, "company") || "未命名公司";
      const position = getValue(record, "position");
      const status = getValue(record, "status");
      const applyDate = getValue(record, "applyDate");
      const interview = getValue(record, "interview");
      const offer = getValue(record, "offer");
      return `
        <article class="record-card" data-id="${escapeHtml(record.id)}" tabindex="0">
          <div class="record-card-top">
            <div>
              <h3>${escapeHtml(company)}</h3>
              ${position ? `<div class="cell-sub">${escapeHtml(position)}</div>` : ""}
            </div>
            ${
              status
                ? `<span class="status-pill" data-tone="${statusTone(status)}">${escapeHtml(status)}</span>`
                : ""
            }
          </div>
          <div class="meta">
            ${applyDate ? `<span>投递 ${escapeHtml(applyDate)}</span>` : ""}
            ${interview ? `<span>面试 ${escapeHtml(interview)}</span>` : ""}
            ${offer ? `<span>Offer ${escapeHtml(offer)}</span>` : ""}
          </div>
          <div class="shot-cell" style="margin-top:12px">${screenshotsCellHtml(record)}</div>
        </article>
      `;
    })
    .join("");

  els.listPanel.innerHTML = `
    <div class="table-wrap">
      <table class="records-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card-list">${cards}</div>
  `;

  $$("[data-id]", els.listPanel).forEach((node) => {
    if (!node.matches("tr, article")) return;
    const open = () => openRecordModal(node.dataset.id);
    node.addEventListener("click", (e) => {
      if (e.target.closest("[data-shot-zone]")) return;
      open();
    });
    node.addEventListener("keydown", (e) => {
      if (e.target.closest("[data-shot-zone]")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });

  bindShotInteractions(els.listPanel);
}

function openLightbox(filename) {
  els.lightboxImg.src = shotUrl(filename);
  els.lightbox.hidden = false;
}

function closeLightbox() {
  els.lightbox.hidden = true;
  els.lightboxImg.removeAttribute("src");
}

function openModal(kind) {
  const root = modalMap[kind]?.();
  if (!root) return;
  root.hidden = false;
  document.body.style.overflow = "hidden";
  const focusable = root.querySelector("input, select, textarea, button");
  focusable?.focus();
}

function closeModal(kind) {
  const root = modalMap[kind]?.();
  if (!root) return;
  root.hidden = true;
  const anyOpen = Object.values(modalMap).some((get) => !get().hidden);
  if (!anyOpen) document.body.style.overflow = "";
  if (kind === "record") {
    state.editingId = null;
    state.draftScreenshots = [];
    els.recordForm.reset();
  }
}

function setView(view) {
  currentView = view === "resume" ? "resume" : "records";
  const isResume = currentView === "resume";

  els.viewRecords.hidden = isResume;
  els.viewResume.hidden = !isResume;
  els.app.classList.toggle("view-resume-mode", isResume);
  document.body.classList.toggle("resume-mode", isResume);

  els.navRecords.classList.toggle("is-active", !isResume);
  els.navResume.classList.toggle("is-active", isResume);
  if (isResume) {
    els.navRecords.removeAttribute("aria-current");
    els.navResume.setAttribute("aria-current", "page");
  } else {
    els.navResume.removeAttribute("aria-current");
    els.navRecords.setAttribute("aria-current", "page");
  }

  document.title = isResume ? "我的简历" : "应聘记录";
}

async function switchView(view) {
  setView(view);
  if (view === "resume") {
    try {
      await loadResumeList();
    } catch (err) {
      els.resumeFileList.innerHTML = `<li><p style="color:#b91c1c;margin:0">${escapeHtml(err.message)}</p></li>`;
    }
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind, file) {
  if (kind === "folder") return "文件夹";
  if (kind === "image") return file?.imageType || "图片";
  return (
    {
      pdf: "PDF",
      docx: "Word",
      doc: "Word",
      markdown: "Markdown",
      text: "文本",
      other: "文件",
    }[kind] || "文件"
  );
}

function resumeJoinPath(...parts) {
  return parts.filter(Boolean).join("/");
}

function resumeParentPath(rel) {
  if (!rel) return "";
  const parts = rel.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function folderIconSvg() {
  return `<svg class="resume-item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>`;
}

function fileIconSvg(kind) {
  if (kind === "image") {
    return `<svg class="resume-item-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><path d="m8 16 3-3 2 2 3-4 3 5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `<svg class="resume-item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h7l3 3v13H7V4z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M14 4v3h3" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>`;
}

async function ensureMammoth() {
  if (window.mammoth) return window.mammoth;
  if (!mammothLoading) {
    mammothLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mammoth@1.9.0/mammoth.browser.min.js";
      script.onload = () => (window.mammoth ? resolve(window.mammoth) : reject(new Error("mammoth 加载失败")));
      script.onerror = () => reject(new Error("无法加载 Word 预览组件（需联网）"));
      document.head.appendChild(script);
    });
  }
  return mammothLoading;
}

async function ensureMarked() {
  if (window.marked) return window.marked;
  if (!markedLoading) {
    markedLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js";
      script.onload = () => (window.marked ? resolve(window.marked) : reject(new Error("marked 加载失败")));
      script.onerror = () => reject(new Error("无法加载 Markdown 预览组件（需联网）"));
      document.head.appendChild(script);
    });
  }
  return markedLoading;
}

function parseMdNote(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const title = (lines[0] || "").trim();
  let i = 1;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i < lines.length && /^-{3,}$/.test(lines[i].trim())) {
    i += 1;
    while (i < lines.length && !lines[i].trim()) i += 1;
  }
  return { title, body: lines.slice(i).join("\n") };
}

function serializeMdNote(title, body) {
  return `${String(title || "").trim()}\n\n---\n\n${String(body || "").replace(/\s+$/, "")}\n`;
}

function syncMdNoteFromDom() {
  if (!mdNote.active || mdNote.mode !== "edit") return;
  const titleEl = $("#md-title-input");
  const bodyEl = $("#md-body-input");
  if (titleEl) mdNote.title = titleEl.value;
  if (bodyEl) mdNote.body = bodyEl.value;
}

function openMdWorkspace({ filename = null, title = "", body = "", mode = "edit" } = {}) {
  mdNote.active = true;
  mdNote.filename = filename;
  mdNote.title = title;
  mdNote.body = body;
  mdNote.mode = mode;
  resumeSelected = filename
    ? resumeFiles.find((f) => f.path === filename || f.name === filename) || {
        name: filename.split("/").pop(),
        path: filename,
        url: `/resume-files/${filename.split("/").map(encodeURIComponent).join("/")}`,
        kind: "markdown",
      }
    : null;
  renderResumeFileList();
  if (resumeSelected) {
    els.resumeOpenBtn.hidden = false;
    els.resumeOpenBtn.href = resumeSelected.url;
  } else {
    els.resumeOpenBtn.hidden = true;
  }
  renderMdWorkspace();
}

function startNewMdNote() {
  openMdWorkspace({
    filename: null,
    title: "",
    body: "",
    mode: "edit",
  });
}

async function openMdNoteFile(file) {
  const text = await (await fetch(file.url)).text();
  const parsed = parseMdNote(text);
  openMdWorkspace({
    filename: file.path || file.name,
    title: parsed.title || file.name.replace(/\.md$/i, ""),
    body: parsed.body,
    mode: "preview",
  });
}

async function renderMdPreviewHtml(title, body) {
  const marked = await ensureMarked();
  const html = marked.parse(body || "", { breaks: true });
  return `
    <article class="md-preview-doc">
      <h1 class="md-preview-title">${escapeHtml(title || "未命名")}</h1>
      <div class="md-preview-rule" aria-hidden="true"></div>
      <div class="md-preview-body">${html || "<p class='md-preview-empty-body'>正文为空</p>"}</div>
    </article>
  `;
}

async function renderMdWorkspace() {
  const isEdit = mdNote.mode === "edit";
  const saving = mdNote.saving;
  els.resumePreview.innerHTML = `
    <div class="md-workspace">
      <header class="md-toolbar">
        <div class="md-mode-switch" role="tablist" aria-label="编辑模式">
          <button type="button" class="md-mode-btn ${isEdit ? "is-active" : ""}" data-md-mode="edit">编辑</button>
          <button type="button" class="md-mode-btn ${!isEdit ? "is-active" : ""}" data-md-mode="preview">预览</button>
        </div>
        <div class="md-toolbar-actions">
          <button type="button" class="btn btn-ghost" id="btn-md-cancel">取消</button>
          <button type="button" class="btn btn-primary" id="btn-md-save" ${saving ? "disabled" : ""}>${
            saving ? "保存中…" : "保存"
          }</button>
        </div>
      </header>
      <div class="md-workspace-body" id="md-workspace-body"></div>
    </div>
  `;

  const bodyRoot = $("#md-workspace-body");
  if (isEdit) {
    bodyRoot.innerHTML = `
      <input id="md-title-input" class="md-title-input" type="text" maxlength="120" placeholder="第一行：标题" value="${escapeHtml(mdNote.title)}" />
      <div class="md-sep" aria-hidden="true"></div>
      <textarea id="md-body-input" class="md-body-input" placeholder="正文（支持 Markdown）">${escapeHtml(mdNote.body)}</textarea>
    `;
  } else {
    bodyRoot.innerHTML = `<div class="resume-preview-empty"><h3>预览加载中…</h3></div>`;
    try {
      bodyRoot.innerHTML = await renderMdPreviewHtml(mdNote.title, mdNote.body);
    } catch (err) {
      bodyRoot.innerHTML = `
        <div class="resume-preview-fallback">
          <h3>预览失败</h3>
          <p>${escapeHtml(err.message || "请检查网络后重试")}</p>
        </div>
      `;
    }
  }

  $$("[data-md-mode]", els.resumePreview).forEach((btn) => {
    btn.addEventListener("click", async () => {
      syncMdNoteFromDom();
      mdNote.mode = btn.dataset.mdMode === "preview" ? "preview" : "edit";
      await renderMdWorkspace();
    });
  });
  $("#btn-md-cancel")?.addEventListener("click", () => {
    mdNote.active = false;
    mdNote.filename = null;
    showResumeEmpty();
    renderResumeFileList();
  });
  $("#btn-md-save")?.addEventListener("click", () => {
    saveMdNote().catch((err) => toast(err.message || "保存失败", "error"));
  });
}

async function saveMdNote() {
  if (mdNote.saving) return;
  syncMdNoteFromDom();
  const title = mdNote.title.trim();
  if (!title) {
    toast("请先填写标题", "error");
    mdNote.mode = "edit";
    await renderMdWorkspace();
    $("#md-title-input")?.focus();
    return;
  }

  mdNote.saving = true;
  await renderMdWorkspace();
  try {
    const res = await fetch("/api/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body: mdNote.body,
        filename: mdNote.filename,
        folder: resumePath,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "保存失败");
    mdNote.filename = data.filename;
    await loadResumeList(resumePath);
    const file = resumeFiles.find((f) => f.path === data.filename || f.name === data.filename);
    if (file) {
      resumeSelected = file;
      els.resumeOpenBtn.hidden = false;
      els.resumeOpenBtn.href = file.url;
      renderResumeFileList();
    }
    toast(`已保存到 data/resume/${data.filename}`);
    mdNote.mode = "preview";
  } finally {
    mdNote.saving = false;
    await renderMdWorkspace();
  }
}

function showResumeEmpty() {
  mdNote.active = false;
  els.resumeOpenBtn.hidden = true;
  els.resumePreview.innerHTML = `
    <div class="resume-preview-empty">
      <h3>选择文件预览</h3>
      <p>点「新增记录」写 Markdown 笔记，或将 PDF / Word / 图片放到 <code>data/resume/</code>。</p>
    </div>
  `;
}

async function loadResumeList(path = resumePath) {
  resumePath = path || "";
  const q = resumePath ? `?path=${encodeURIComponent(resumePath)}` : "";
  const res = await fetch(`/api/resume${q}`);
  if (!res.ok) throw new Error("无法读取简历目录");
  const data = await res.json();
  resumeFiles = Array.isArray(data.files) ? data.files : [];
  if (els.resumeDirLabel) {
    els.resumeDirLabel.textContent = `目录：${data.dir || "data/resume"}/`;
  }
  renderResumeCrumb();
  renderResumeFileList();
  if (mdNote.active && mdNote.filename) {
    const still = resumeFiles.find((f) => f.path === mdNote.filename || f.name === mdNote.filename);
    if (still) resumeSelected = still;
  } else if (resumeSelected && !mdNote.active) {
    const still = resumeFiles.find((f) => f.path === resumeSelected.path || f.name === resumeSelected.name);
    if (still) await previewResumeFile(still);
    else if (resumeSelected.type === "dir") {
      resumeSelected = null;
    } else {
      resumeSelected = null;
      showResumeEmpty();
    }
  }
}

function renderResumeCrumb() {
  if (!els.resumeCrumb) return;
  if (!resumePath) {
    els.resumeCrumb.hidden = true;
    els.resumeCrumb.innerHTML = "";
    return;
  }
  const parts = resumePath.split("/").filter(Boolean);
  let acc = "";
  const crumbs = [
    `<button type="button" class="resume-crumb-btn" data-resume-path="">根目录</button>`,
  ];
  parts.forEach((part, idx) => {
    acc = resumeJoinPath(acc, part);
    const isLast = idx === parts.length - 1;
    crumbs.push(`<span class="resume-crumb-sep">/</span>`);
    if (isLast) {
      crumbs.push(`<span class="resume-crumb-current">${escapeHtml(part)}</span>`);
    } else {
      crumbs.push(
        `<button type="button" class="resume-crumb-btn" data-resume-path="${escapeHtml(acc)}">${escapeHtml(part)}</button>`
      );
    }
  });
  els.resumeCrumb.hidden = false;
  els.resumeCrumb.innerHTML = crumbs.join("");
}

function renderResumeFileList() {
  if (!resumeFiles.length) {
    els.resumeFileList.innerHTML = `
      <li class="resume-preview-fallback" style="min-height:auto;padding:12px 0;place-content:start">
        <p>${
          resumePath
            ? "当前文件夹为空。"
            : "目录为空。点「新增记录」创建 Markdown，或把文件/文件夹放进 <code>data/resume/</code>。"
        }</p>
      </li>
    `;
    return;
  }

  const activePath = mdNote.active && mdNote.filename ? mdNote.filename : resumeSelected?.path || resumeSelected?.name;
  els.resumeFileList.innerHTML = resumeFiles
    .map((file) => {
      const key = file.path || file.name;
      const active = activePath === key ? "is-active" : "";
      if (file.type === "dir" || file.kind === "folder") {
        return `
          <li>
            <button type="button" class="resume-file-item resume-file-item--folder ${active}" data-resume-path="${escapeHtml(key)}">
              <span class="resume-file-leading">${folderIconSvg()}</span>
              <span class="resume-file-meta">
                <strong>${escapeHtml(file.name)}</strong>
                <span>文件夹 · ${file.count ?? 0} 项</span>
              </span>
            </button>
          </li>
        `;
      }

      const typeText = kindLabel(file.kind, file);
      const sizeText = formatBytes(file.size);
      const thumb =
        file.kind === "image" && file.url
          ? `<img class="resume-thumb" src="${escapeHtml(file.url)}" alt="" loading="lazy" />`
          : `<span class="resume-file-leading">${fileIconSvg(file.kind)}</span>`;

      return `
        <li>
          <button type="button" class="resume-file-item ${file.kind === "image" ? "resume-file-item--image" : ""} ${active}" data-resume-name="${escapeHtml(key)}">
            ${thumb}
            <span class="resume-file-meta">
              <strong>${escapeHtml(file.name)}</strong>
              <span>${escapeHtml(typeText)}${sizeText ? ` · ${sizeText}` : ""}</span>
            </span>
          </button>
        </li>
      `;
    })
    .join("");
}

async function openResumeFolder(path) {
  mdNote.active = false;
  resumeSelected = null;
  els.resumeOpenBtn.hidden = true;
  showResumeEmpty();
  await loadResumeList(path);
}

async function previewResumeFile(file) {
  mdNote.active = false;
  resumeSelected = file;
  renderResumeFileList();
  els.resumeOpenBtn.hidden = false;
  els.resumeOpenBtn.href = file.url;

  if (file.kind === "markdown" || file.ext === ".md") {
    await openMdNoteFile(file);
    return;
  }

  els.resumePreview.innerHTML = `<div class="resume-preview-empty"><h3>加载中…</h3></div>`;

  try {
    if (file.kind === "image") {
      els.resumePreview.innerHTML = `
        <div class="resume-image-preview">
          <img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.name)}" />
          <p class="resume-image-caption">${escapeHtml(file.name)} · ${escapeHtml(kindLabel(file.kind, file))}</p>
        </div>
      `;
      return;
    }

    if (file.kind === "pdf") {
      els.resumePreview.innerHTML = `<iframe src="${escapeHtml(file.url)}" title="${escapeHtml(file.name)}"></iframe>`;
      return;
    }

    if (file.kind === "text") {
      const text = await (await fetch(file.url)).text();
      els.resumePreview.innerHTML = `<pre class="resume-preview-text">${escapeHtml(text)}</pre>`;
      return;
    }

    if (file.kind === "docx") {
      const mammoth = await ensureMammoth();
      const buffer = await (await fetch(file.url)).arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      els.resumePreview.innerHTML = `<div class="resume-docx">${result.value || "<p>（空文档）</p>"}</div>`;
      return;
    }

    els.resumePreview.innerHTML = `
      <div class="resume-preview-fallback">
        <h3>暂不支持在线预览</h3>
        <p>「${escapeHtml(file.name)}」可点击「新窗口」查看或下载。</p>
      </div>
    `;
  } catch (err) {
    els.resumePreview.innerHTML = `
      <div class="resume-preview-fallback">
        <h3>预览失败</h3>
        <p>${escapeHtml(err.message || "请尝试新窗口打开")}</p>
      </div>
    `;
  }
}

function fieldControl(field, value) {
  const required = field.required ? "required" : "";
  const name = escapeHtml(field.key);
  const safeValue = escapeHtml(value);

  if (field.type === "textarea") {
    return `<textarea name="${name}" ${required}>${safeValue}</textarea>`;
  }
  if (field.type === "select") {
    const opts = (field.options || [])
      .map((opt) => {
        const selected = String(value) === String(opt) ? "selected" : "";
        return `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
      })
      .join("");
    return `<select name="${name}" ${required}><option value="">请选择</option>${opts}</select>`;
  }
  if (field.type === "date") {
    return `<input type="date" name="${name}" value="${safeValue}" ${required} />`;
  }
  return `<input type="text" name="${name}" value="${safeValue}" ${required} />`;
}

function currentFormShots() {
  if (state.editingId) {
    const record = state.store.records.find((r) => r.id === state.editingId);
    return getScreenshots(record);
  }
  return state.draftScreenshots;
}

function shotPaneHtml() {
  const shots = currentFormShots();
  const recordId = state.editingId || "draft";
  const thumbs = shots
    .map(
      (filename) => `
      <div class="shot-item">
        <img class="shot-thumb" src="${shotUrl(filename)}" alt="截图" data-shot-preview="${escapeHtml(filename)}" />
        <button type="button" class="shot-remove" data-shot-remove="${escapeHtml(filename)}" aria-label="删除截图">×</button>
      </div>`
    )
    .join("");

  return `
    <div class="shot-pane">
      <span class="label">截图</span>
      <div class="shot-pane-box" data-shot-zone data-record-id="${escapeHtml(recordId)}" tabindex="0">
        <p class="shot-pane-hint">在此区域 Ctrl+V 粘贴截图，或拖入图片文件（保存到 data/screenshots/）</p>
        <div class="shot-stack">
          ${thumbs}
          <button type="button" class="shot-paste" data-shot-paste>粘贴截图</button>
        </div>
      </div>
    </div>
  `;
}

/** Refresh screenshots UI only — keep other form inputs intact. */
function refreshShotPane() {
  const next = document.createElement("div");
  next.innerHTML = shotPaneHtml().trim();
  const pane = next.firstElementChild;
  const current = els.recordForm.querySelector(".shot-pane");
  if (current) current.replaceWith(pane);
  else els.recordForm.appendChild(pane);
  bindShotInteractions(pane);
}

function renderRecordForm(record) {
  const values = record?.values || {};
  const parts = state.store.fields.map((field) => {
    if (isScreenshotsField(field)) return shotPaneHtml();
    const reqMark = field.required ? " *" : "";
    return `
      <label class="${field.type === "textarea" ? "span-2" : ""}">
        <span>${escapeHtml(field.label)}${reqMark}</span>
        ${fieldControl(field, values[field.key] ?? "")}
      </label>
    `;
  });
  if (!state.store.fields.some(isScreenshotsField)) parts.push(shotPaneHtml());
  els.recordForm.innerHTML = parts.join("");
  bindShotInteractions(els.recordForm);
}

function openRecordModal(id = null) {
  state.editingId = id;
  state.draftScreenshots = [];
  const record = id ? state.store.records.find((r) => r.id === id) : null;
  els.recordTitle.textContent = record ? "编辑记录" : "新增记录";
  els.deleteRecordBtn.hidden = !record;
  renderRecordForm(record);
  openModal("record");
}

function collectFormValues(form) {
  const data = new FormData(form);
  const values = {};
  for (const field of state.store.fields) {
    if (isScreenshotsField(field)) continue;
    const raw = data.get(field.key);
    values[field.key] = raw == null ? "" : String(raw).trim();
  }
  return values;
}

async function withSaving(btn, fn) {
  if (state.saving) return;
  state.saving = true;
  const prev = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "保存中…";
  }
  try {
    await fn();
  } finally {
    state.saving = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
}

async function uploadImageBlob(blob) {
  const type = blob.type || "image/png";
  if (!type.startsWith("image/")) throw new Error("剪贴板中没有图片");
  const res = await fetch("/api/screenshots", {
    method: "POST",
    headers: { "Content-Type": type },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "上传失败");
  return data.filename;
}

async function attachImageFile(recordId, fileOrBlob) {
  const filename = await uploadImageBlob(fileOrBlob);
  if (!recordId || recordId === "draft") {
    state.draftScreenshots.push(filename);
    if (!els.recordModal.hidden) refreshShotPane();
    toast("截图已保存，保存记录后生效");
    return;
  }

  const record = state.store.records.find((r) => r.id === recordId);
  if (!record) throw new Error("记录不存在");
  if (!Array.isArray(record.screenshots)) record.screenshots = [];
  record.screenshots.push(filename);
  record.updatedAt = new Date().toISOString();
  await saveStore();

  if (state.editingId === recordId && !els.recordModal.hidden) {
    refreshShotPane();
  }
  renderList();
  toast("截图已保存到 data/screenshots/");
}

async function handlePasteEvent(e, recordId) {
  const items = [...(e.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) {
    toast("剪贴板里没有图片", "error");
    return;
  }
  e.preventDefault();
  const blob = imageItem.getAsFile();
  if (!blob) throw new Error("无法读取图片");
  await attachImageFile(recordId, blob);
}

async function deleteScreenshotFile(filename) {
  await fetch(`/api/screenshots/${encodeURIComponent(filename)}`, { method: "DELETE" });
}

async function removeScreenshot(recordId, filename) {
  if (!confirm("删除这张截图？")) return;

  if (!recordId || recordId === "draft") {
    state.draftScreenshots = state.draftScreenshots.filter((f) => f !== filename);
    await deleteScreenshotFile(filename);
    if (!els.recordModal.hidden) refreshShotPane();
    toast("已删除截图");
    return;
  }

  const record = state.store.records.find((r) => r.id === recordId);
  if (!record) return;
  record.screenshots = getScreenshots(record).filter((f) => f !== filename);
  record.updatedAt = new Date().toISOString();
  await saveStore();
  await deleteScreenshotFile(filename);

  if (state.editingId === recordId && !els.recordModal.hidden) {
    refreshShotPane();
  }
  renderList();
  toast("已删除截图");
}

async function onSaveRecord(e) {
  e.preventDefault();
  await withSaving(els.saveRecordBtn, async () => {
    const values = collectFormValues(els.recordForm);
    for (const field of state.store.fields) {
      if (isScreenshotsField(field)) continue;
      if (field.required && !values[field.key]) {
        toast(`请填写「${field.label}」`, "error");
        els.recordForm.querySelector(`[name="${field.key}"]`)?.focus();
        return;
      }
    }

    const now = new Date().toISOString();
    if (state.editingId) {
      const idx = state.store.records.findIndex((r) => r.id === state.editingId);
      if (idx === -1) throw new Error("记录不存在");
      state.store.records[idx] = {
        ...state.store.records[idx],
        updatedAt: now,
        values,
        screenshots: getScreenshots(state.store.records[idx]),
      };
    } else {
      state.store.records.push({
        id: uid(),
        createdAt: now,
        updatedAt: now,
        values,
        screenshots: [...state.draftScreenshots],
      });
      state.draftScreenshots = [];
    }

    await saveStore();
    closeModal("record");
    renderList();
    toast("已保存到 data/store.json");
  });
}

async function onDeleteRecord() {
  if (!state.editingId) return;
  if (!confirm("确定删除这条记录？相关截图也会删除。")) return;
  const record = state.store.records.find((r) => r.id === state.editingId);
  const shots = getScreenshots(record);
  state.store.records = state.store.records.filter((r) => r.id !== state.editingId);
  await saveStore();
  await Promise.all(shots.map((f) => deleteScreenshotFile(f)));
  closeModal("record");
  renderList();
  toast("记录已删除");
}

function slugKey(label) {
  const ascii = label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
  if (ascii && /^[a-z_]/.test(ascii)) return ascii.slice(0, 40);
  return `field_${Date.now().toString(36)}`;
}

function fieldTypeLabel(type) {
  return (
    {
      text: "文本",
      date: "日期",
      select: "选项",
      textarea: "多行",
      screenshots: "截图",
    }[type] || type
  );
}

function renderFieldsList() {
  if (!state.store.fields.length) {
    els.fieldsList.innerHTML = `<li class="field-item"><div class="field-item-meta"><strong>暂无字段</strong><span>先添加一个字段吧</span></div></li>`;
    return;
  }

  els.fieldsList.innerHTML = state.store.fields
    .map((field, index) => {
      const req = field.required ? " · 必填" : "";
      return `
        <li class="field-item" data-index="${index}" draggable="true">
          <button type="button" class="field-drag" aria-label="拖动排序" title="拖动排序">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 7h.01M8 12h.01M8 17h.01M16 7h.01M16 12h.01M16 17h.01" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </button>
          <div class="field-item-meta">
            <strong>${escapeHtml(field.label)}</strong>
            <span>${escapeHtml(field.key)} · ${fieldTypeLabel(field.type)}${req}</span>
          </div>
          <div class="field-item-actions">
            <button type="button" class="icon-btn" data-action="delete" aria-label="删除字段">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M9 7V5h6v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  bindFieldDrag();
}

let dragFromIndex = null;

function bindFieldDrag() {
  $$(".field-item", els.fieldsList).forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      if (e.target.closest("[data-action]")) {
        e.preventDefault();
        return;
      }
      dragFromIndex = Number(item.dataset.index);
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(dragFromIndex));
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      $$(".field-item", els.fieldsList).forEach((el) => el.classList.remove("drag-over"));
      dragFromIndex = null;
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      const from = dragFromIndex ?? Number(e.dataTransfer.getData("text/plain"));
      const to = Number(item.dataset.index);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
      reorderField(from, to).catch((err) => toast(err.message || "排序失败", "error"));
    });
  });
}

function openFieldsModal() {
  renderFieldsList();
  openModal("fields");
}

async function reorderField(from, to) {
  const fields = state.store.fields;
  if (from < 0 || to < 0 || from >= fields.length || to >= fields.length) return;
  const [item] = fields.splice(from, 1);
  fields.splice(to, 0, item);
  await saveStore();
  renderFieldsList();
  renderList();
  toast("字段顺序已更新");
}

async function deleteField(index) {
  const field = state.store.fields[index];
  if (!field) return;
  if (!confirm(`删除字段「${field.label}」？已有记录中的该值也会被清除。`)) return;
  state.store.fields.splice(index, 1);
  if (!isScreenshotsField(field)) {
    for (const record of state.store.records) {
      if (record.values && field.key in record.values) {
        delete record.values[field.key];
      }
    }
  }
  await saveStore();
  renderFieldsList();
  renderList();
  toast(`已删除字段「${field.label}」`);
}

async function onAddField(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = new FormData(form);
  let key = String(data.get("key") || "").trim();
  const label = String(data.get("label") || "").trim();
  const type = String(data.get("type") || "text");
  const required = data.get("required") === "on";
  const optionsRaw = String(data.get("options") || "");

  if (!label) {
    toast("请填写显示名", "error");
    return;
  }
  if (!key) key = slugKey(label);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    toast("字段键格式不正确", "error");
    return;
  }
  if (state.store.fields.some((f) => f.key === key)) {
    toast("字段键已存在", "error");
    return;
  }
  if (type === "screenshots" && state.store.fields.some(isScreenshotsField)) {
    toast("截图字段已存在", "error");
    return;
  }

  const field = { key, label, type };
  if (required) field.required = true;
  if (type === "select") {
    const options = optionsRaw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!options.length) {
      toast("选项类型请至少填写一个选项", "error");
      return;
    }
    field.options = options;
  }

  state.store.fields.push(field);
  await saveStore();
  form.reset();
  syncOptionsVisibility();
  renderFieldsList();
  renderList();
  toast(`已添加字段「${label}」`);
}

function syncOptionsVisibility() {
  const type = els.fieldAddForm.elements.type.value;
  els.optionsLabel.hidden = type !== "select";
}

function bindEvents() {
  $("#btn-add").addEventListener("click", () => openRecordModal());
  $("#btn-fields").addEventListener("click", openFieldsModal);
  els.navRecords.addEventListener("click", () => {
    switchView("records").catch((err) => toast(err.message || "切换失败", "error"));
  });
  els.navResume.addEventListener("click", () => {
    switchView("resume").catch((err) => toast(err.message || "打开失败", "error"));
  });
  $("#btn-resume-new").addEventListener("click", () => startNewMdNote());
  $("#btn-resume-refresh").addEventListener("click", () => {
    loadResumeList(resumePath).catch((err) => toast(err.message || "刷新失败", "error"));
  });
  els.resumeFileList.addEventListener("click", (e) => {
    const folderBtn = e.target.closest("[data-resume-path]");
    if (folderBtn && folderBtn.classList.contains("resume-file-item--folder")) {
      openResumeFolder(folderBtn.dataset.resumePath).catch((err) => toast(err.message || "打开失败", "error"));
      return;
    }
    const btn = e.target.closest("[data-resume-name]");
    if (!btn) return;
    const key = btn.dataset.resumeName;
    const file = resumeFiles.find((f) => f.path === key || f.name === key);
    if (!file) return;
    previewResumeFile(file).catch((err) => toast(err.message || "预览失败", "error"));
  });
  els.resumeCrumb?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-resume-path]");
    if (!btn) return;
    openResumeFolder(btn.dataset.resumePath || "").catch((err) => toast(err.message || "打开失败", "error"));
  });
  els.search.addEventListener("input", renderList);
  els.statusFilter.addEventListener("change", renderList);
  els.recordForm.addEventListener("submit", (e) => {
    onSaveRecord(e).catch((err) => toast(err.message || "保存失败", "error"));
  });
  els.deleteRecordBtn.addEventListener("click", () => {
    onDeleteRecord().catch((err) => toast(err.message || "删除失败", "error"));
  });
  els.fieldAddForm.addEventListener("submit", (e) => {
    onAddField(e).catch((err) => toast(err.message || "添加失败", "error"));
  });
  els.fieldAddForm.elements.type.addEventListener("change", syncOptionsVisibility);

  $$("[data-close]").forEach((node) => {
    node.addEventListener("click", () => closeModal(node.dataset.close));
  });

  $$("[data-close-lightbox]").forEach((node) => {
    node.addEventListener("click", closeLightbox);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!els.lightbox.hidden) {
      closeLightbox();
      return;
    }
    if (!els.recordModal.hidden) closeModal("record");
    else if (!els.fieldsModal.hidden) closeModal("fields");
  });

  els.fieldsList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const item = btn.closest("[data-index]");
    if (!item) return;
    const index = Number(item.dataset.index);
    if (btn.dataset.action === "delete") {
      deleteField(index).catch((err) => toast(err.message || "操作失败", "error"));
    }
  });
}

async function init() {
  bindEvents();
  syncOptionsVisibility();
  try {
    await loadStore();
    renderList();
  } catch (err) {
    els.count.textContent = "加载失败";
    els.listPanel.innerHTML = `
      <div class="empty-state">
        <div>
          <h2>无法加载数据</h2>
          <p>${escapeHtml(err.message || "请确认已运行 node server.mjs")}</p>
        </div>
      </div>
    `;
  }
}

init();
