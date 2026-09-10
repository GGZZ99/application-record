const CATEGORIES = [
  ["基本信息", ["基本信息", "个人日期"]],
  ["教育经历", ["硕士", "本科", "高中"]],
  ["项目经历", ["项目经历"]],
  ["校内职务", ["校内职务"]],
  ["技能与证书", ["专业技能", "语言证书", "证书荣誉"]],
  ["求职意向", ["求职偏好"]],
  ["自我评价与论文", ["长文本"]],
  ["家庭成员", ["父亲", "母亲", "配偶", "家属", "亲属"]],
  ["紧急联系人", ["紧急联系人"]],
  ["待补充与核实", ["待补充", "待核实"]],
];

let profile = { version: 1, entries: [] };
let view = "all";
let editing = null;
let toast = (message) => window.alert(message);
const collapsedCategories = new Set();
const collapsedProjects = new Set();
const collapsedEducation = new Set();
const saveTimers = new Map();

const $ = (id) => document.getElementById(id);

function categoryOf(entry) {
  if (entry.group.startsWith("项目：") || entry.group.startsWith("项目:")) return "项目经历";
  return CATEGORIES.find(([, groups]) => groups.includes(entry.group))?.[0] || entry.group || "其他资料";
}

function helperInstalled() {
  return document.documentElement.getAttribute("data-ar-helper") === "1";
}

function isGenericSource(source) {
  const text = String(source || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!text) return true;
  return /^(来自|来源于|根据|从)?(简历|resume|cv)(中)?(提取|填写|生成|获得|导出)?$/.test(text);
}

function normalizeProfile(data) {
  return {
    version: data.version,
    entries: data.entries.map((entry) => ({
      ...entry,
      source: isGenericSource(entry.source) ? "" : String(entry.source).trim(),
    })),
  };
}

function validateProfile(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 1000) {
    throw new Error("资料格式不正确");
  }
  const ids = new Set();
  for (const entry of data.entries) {
    if (
      !entry ||
      !["id", "group", "label", "value"].every((k) => typeof entry[k] === "string") ||
      !entry.id ||
      ids.has(entry.id) ||
      !Array.isArray(entry.aliases) ||
      !entry.aliases.every((x) => typeof x === "string") ||
      (entry.source !== undefined && typeof entry.source !== "string") ||
      ["date", "pending"].some((k) => typeof entry[k] !== "boolean") ||
      entry.value.length > 30000
    ) {
      throw new Error("资料字段不正确或编号重复");
    }
    ids.add(entry.id);
  }
  return data;
}

function notifyHelper() {
  window.postMessage({ type: "ar-profile-saved" }, "*");
}

let helperForcedOpen = false;

function renderHelperBanner() {
  const banner = $("helper-banner");
  const connected = $("helper-connected");
  const toggle = $("helper-toggle");
  if (!banner || !connected) return;
  const installed = helperInstalled();
  const dismissed = localStorage.getItem("ar-helper-dismissed") === "1";
  const open = helperForcedOpen || (!installed && !dismissed);
  banner.hidden = !open;
  connected.hidden = !installed;
  if (toggle) toggle.hidden = open;
  const toolbarBtn = $("btn-show-helper-toolbar");
  if (toolbarBtn) toolbarBtn.hidden = open;
}

function showHelperBanner() {
  helperForcedOpen = true;
  localStorage.removeItem("ar-helper-dismissed");
  renderHelperBanner();
  loadExtensionPath();
  $("helper-banner")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadExtensionPath() {
  const el = $("helper-path");
  if (!el) return;
  try {
    const data = await (await fetch("/api/extension", { cache: "no-store" })).json();
    const dir = String(data.dir || "").trim();
    el.textContent = dir || "extension";
  } catch {
    el.textContent = "读取失败，请手动选择项目里的 extension 文件夹";
  }
}

export async function loadProfileView() {
  renderHelperBanner();
  await loadExtensionPath();
  const res = await fetch("/api/profile");
  if (!res.ok) throw new Error("无法读取网申资料");
  const raw = validateProfile(await res.json());
  profile = normalizeProfile(raw);
  renderProfile();
  if (JSON.stringify(raw) !== JSON.stringify(profile)) {
    persistProfile(profile, false).catch(() => {});
  }
}

async function persistProfile(next, rerender = false) {
  validateProfile(next);
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  if (!res.ok) throw new Error("保存失败");
  profile = next;
  updateFilledCount();
  notifyHelper();
  if (rerender) renderProfile();
}

async function saveProfile(next) {
  await persistProfile(next, true);
}

function updateFilledCount() {
  const filled = profile.entries.filter((e) => e.value).length;
  if ($("profile-count")) {
    $("profile-count").textContent = `共 ${profile.entries.length} 条，已填写 ${filled} 条`;
  }
}

function scheduleEntrySave(id, value) {
  const entry = profile.entries.find((e) => e.id === id);
  if (!entry) return;
  entry.value = value;
  updateFilledCount();
  const copyBtn = document.querySelector(`[data-copy-id="${CSS.escape(id)}"]`);
  if (copyBtn) copyBtn.hidden = !value;
  clearTimeout(saveTimers.get(id));
  saveTimers.set(
    id,
    setTimeout(() => {
      persistProfile({ version: profile.version, entries: profile.entries }).catch((err) =>
        toast(err.message || "保存失败", "error")
      );
    }, 400)
  );
}

function isLongField(entry) {
  if (entry.value.includes("\n") || entry.value.length > 60) return true;
  return /描述|职责|评价|技能|荣誉|介绍|备注/.test(entry.label);
}

function createFieldRow(entry) {
  const row = document.createElement("label");
  row.className = "profile-field";
  const name = document.createElement("span");
  name.className = "profile-field-label";
  name.textContent = entry.label + (entry.date ? "（日期备忘）" : "") + (entry.pending ? "（待确认）" : "");
  const field = isLongField(entry) ? document.createElement("textarea") : document.createElement("input");
  field.className = "profile-field-input";
  field.dataset.entryId = entry.id;
  field.value = entry.value;
  field.placeholder = "点击填写";
  field.maxLength = 30000;
  if (field.tagName === "TEXTAREA") field.rows = 4;
  else field.type = "text";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn btn-ghost profile-field-copy";
  copy.dataset.copyId = entry.id;
  copy.textContent = "复制";
  copy.hidden = !entry.value;
  row.append(name, field, copy);
  if (entry.source) {
    const hint = document.createElement("small");
    hint.className = "profile-field-hint";
    hint.textContent = entry.source;
    row.append(hint);
  }
  return row;
}

function renderProfile() {
  const query = ($("profile-search")?.value || "").trim().toLowerCase();
  const entries = profile.entries.filter(
    (e) =>
      (view !== "dates" || e.date) &&
      (view !== "pending" || e.pending) &&
      [categoryOf(e), e.group, e.label, e.value, ...e.aliases].join(" ").toLowerCase().includes(query)
  );
  updateFilledCount();
  document.querySelectorAll("#profile-nav [data-view]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.view === view));
  });

  const root = $("profile-entries");
  if (!root) return;
  root.replaceChildren();
  const containers = new Map();
  const projectContainers = new Map();
  const educationContainers = new Map();

  if (view === "all") {
    const names = [...new Set([...CATEGORIES.map(([name]) => name), ...entries.map(categoryOf)])];
    for (const name of names) {
      const count = entries.filter((e) => categoryOf(e) === name).length;
      if (!count) continue;
      const details = document.createElement("details");
      details.className = "profile-category";
      details.open = Boolean(query) || !collapsedCategories.has(name);
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      label.textContent = name;
      const badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = `${count} 条`;
      summary.append(label, badge);
      const content = document.createElement("div");
      content.className = "profile-category-content";
      details.append(summary, content);
      details.addEventListener("toggle", () => {
        if (!details.isConnected || query) return;
        if (details.open) collapsedCategories.delete(name);
        else collapsedCategories.add(name);
      });
      containers.set(name, content);
      root.append(details);
    }

    const projects = containers.get("项目经历");
    if (projects) {
      const groups = [...new Set(entries.filter((e) => categoryOf(e) === "项目经历").map((e) => e.group))];
      for (const group of groups) {
        const records = profile.entries.filter((e) => e.group === group);
        const value = (label) => records.find((e) => e.label === label)?.value;
        const details = document.createElement("details");
        details.className = "profile-project";
        details.open = Boolean(query) || !collapsedProjects.has(group);
        const summary = document.createElement("summary");
        const title = document.createElement("strong");
        title.textContent = value("项目名称") || group;
        const dates = document.createElement("span");
        dates.className = "profile-dates";
        dates.textContent = value("项目起止日期") || "起止时间待补充";
        const meta = document.createElement("span");
        meta.className = "profile-meta";
        meta.textContent = [value("项目角色"), value("项目单位")].filter(Boolean).join(" · ");
        summary.append(title, dates, meta);
        const content = document.createElement("div");
        content.className = "profile-project-content";
        details.append(summary, content);
        details.addEventListener("toggle", () => {
          if (!details.isConnected || query) return;
          if (details.open) collapsedProjects.delete(group);
          else collapsedProjects.add(group);
        });
        projects.append(details);
        projectContainers.set(group, content);
      }
    }

    const education = containers.get("教育经历");
    if (education) {
      const groups = [...new Set(entries.filter((e) => categoryOf(e) === "教育经历").map((e) => e.group))];
      for (const group of groups) {
        const records = profile.entries.filter((e) => e.group === group);
        const value = (label) => records.find((e) => e.label === label)?.value;
        const details = document.createElement("details");
        details.className = "profile-project";
        details.open = Boolean(query) || !collapsedEducation.has(group);
        const summary = document.createElement("summary");
        const title = document.createElement("strong");
        title.textContent = group;
        const dates = document.createElement("span");
        dates.className = "profile-dates";
        dates.textContent = value("教育起止日期") || "起止时间待补充";
        const school = document.createElement("span");
        school.className = "profile-meta";
        school.textContent = [value("学校名称"), value("学院")].filter(Boolean).join(" · ") || "学校和学院待补充";
        summary.append(title, dates, school);
        const content = document.createElement("div");
        content.className = "profile-project-content";
        details.append(summary, content);
        details.addEventListener("toggle", () => {
          if (!details.isConnected || query) return;
          if (details.open) collapsedEducation.delete(group);
          else collapsedEducation.add(group);
        });
        education.append(details);
        educationContainers.set(group, content);
      }
    }
  }

  for (const entry of entries) {
    const row = createFieldRow(entry);
    (projectContainers.get(entry.group) || educationContainers.get(entry.group) || containers.get(categoryOf(entry)) || root).append(row);
  }

  if (!entries.length) {
    root.innerHTML = `<p class="profile-empty">${
      profile.entries.length ? "暂无匹配资料" : "还没有资料。点击「新增字段」或先填写模板里的空白项。"
    }</p>`;
  }
}

function openEditor(entry) {
  editing = entry?.id || null;
  const form = $("profile-edit-form");
  form.reset();
  const groupSelect = form.elements.group;
  groupSelect.replaceChildren(new Option("请选择分组", ""));
  const groupNames = [...new Set([...CATEGORIES.flatMap(([, groups]) => groups), ...profile.entries.map((e) => e.group)].filter(Boolean))];
  for (const name of groupNames) groupSelect.add(new Option(name, name));
  const newOption = new Option("＋ 新增分组", "");
  newOption.dataset.create = "true";
  groupSelect.add(newOption);
  groupSelect.value = entry?.group || "";
  updateGroupInput();
  for (const key of ["label", "value", "source"]) form.elements[key].value = entry?.[key] || "";
  form.elements.aliases.value = entry?.aliases.join(", ") || "";
  for (const key of ["date", "pending"]) form.elements[key].checked = entry?.[key] || false;
  $("btn-profile-delete").hidden = !entry;
  $("profile-editor-title").textContent = entry ? "编辑资料" : "新增资料";
  $("profile-editor").showModal();
}

function updateGroupInput() {
  const form = $("profile-edit-form");
  const creating = form.elements.group.selectedOptions[0]?.dataset.create === "true";
  $("profile-new-group-row").hidden = !creating;
  form.elements.newGroup.disabled = !creating;
  form.elements.newGroup.required = creating;
  form.elements.group.required = !creating;
  form.elements.newGroup.setCustomValidity("");
}

function parseImportedProfile(text) {
  let raw = String(text || "").trim();
  if (!raw) throw new Error("请先粘贴 JSON");
  if (raw.length > 2_000_000) throw new Error("内容过大");
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("不是合法 JSON，请检查 DeepSeek 输出");
  }
  return normalizeProfile(validateProfile(data));
}

export function initProfileView(options = {}) {
  if (options.toast) toast = options.toast;
  const openModal = options.openModal || (() => {});
  const closeModal = options.closeModal || (() => {});
  loadExtensionPath();
  renderHelperBanner();

  $("btn-copy-ext")?.addEventListener("click", async () => {
    await loadExtensionPath();
    const text = $("helper-path")?.textContent?.trim();
    if (!text || text.startsWith("正在读取") || text.startsWith("读取失败")) {
      toast("还没有拿到本机路径，请稍后重试", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制扩展目录路径");
    } catch {
      toast("复制失败，请手动选中路径", "error");
    }
  });
  $("btn-dismiss-helper")?.addEventListener("click", () => {
    helperForcedOpen = false;
    localStorage.setItem("ar-helper-dismissed", "1");
    renderHelperBanner();
  });
  $("btn-show-helper")?.addEventListener("click", showHelperBanner);
  $("btn-show-helper-toolbar")?.addEventListener("click", showHelperBanner);
  $("btn-profile-add")?.addEventListener("click", () => openEditor(null));
  $("profile-search")?.addEventListener("input", renderProfile);
  $("profile-entries")?.addEventListener("input", (event) => {
    const field = event.target.closest("[data-entry-id]");
    if (!field || field !== event.target) return;
    scheduleEntrySave(field.dataset.entryId, field.value);
  });
  $("profile-entries")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-copy-id]");
    if (!btn) return;
    event.preventDefault();
    const entry = profile.entries.find((item) => item.id === btn.dataset.copyId);
    if (!entry?.value) return;
    try {
      await navigator.clipboard.writeText(entry.value);
      toast("已复制：" + entry.label);
    } catch {
      toast("复制失败，请选中文字复制", "error");
    }
  });
  document.querySelectorAll("#profile-nav [data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view;
      renderProfile();
    });
  });
  $("profile-edit-form").elements.group.addEventListener("change", () => {
    updateGroupInput();
    if (!$("profile-new-group-row").hidden) $("profile-edit-form").elements.newGroup.focus();
  });
  $("profile-edit-form").elements.newGroup.addEventListener("input", (event) => event.target.setCustomValidity(""));
  $("profile-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const entry = {
      id: editing || crypto.randomUUID(),
      aliases: form.elements.aliases.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean),
    };
    entry.group = form.elements.newGroup.disabled ? form.elements.group.value : form.elements.newGroup.value.trim();
    if (!entry.group) {
      form.elements.newGroup.setCustomValidity("请输入分组名称");
      form.reportValidity();
      return;
    }
    for (const key of ["label", "value", "source"]) entry[key] = form.elements[key].value.trim();
    for (const key of ["date", "pending"]) entry[key] = form.elements[key].checked;
    try {
      await saveProfile({
        ...profile,
        entries: editing ? profile.entries.map((e) => (e.id === editing ? entry : e)) : [...profile.entries, entry],
      });
      $("profile-editor").close();
      toast("已保存到本机");
    } catch (err) {
      toast(err.message || "保存失败", "error");
    }
  });
  $("btn-profile-cancel").addEventListener("click", () => $("profile-editor").close());
  $("btn-profile-delete").addEventListener("click", async () => {
    if (!confirm("删除这条资料？")) return;
    try {
      await saveProfile({ ...profile, entries: profile.entries.filter((e) => e.id !== editing) });
      $("profile-editor").close();
      toast("已删除");
    } catch (err) {
      toast(err.message || "删除失败", "error");
    }
  });
  $("btn-profile-export").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "网申资料备份.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("btn-profile-import")?.addEventListener("click", () => {
    if ($("profile-import-json")) $("profile-import-json").value = "";
    openModal("profileImport");
    $("profile-import-json")?.focus();
  });
  $("btn-copy-deepseek-prompt")?.addEventListener("click", async () => {
    const text = $("deepseek-prompt")?.value || "";
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制提示词，请和简历一起发给 DeepSeek");
    } catch {
      $("deepseek-prompt")?.select();
      toast("复制失败，请手动选中提示词", "error");
    }
  });
  $("btn-profile-import-confirm")?.addEventListener("click", async () => {
    try {
      const imported = parseImportedProfile($("profile-import-json")?.value || "");
      await saveProfile(imported);
      closeModal("profileImport");
      toast("资料已导入");
    } catch (err) {
      toast("导入失败：" + (err.message || "JSON 格式不正确"), "error");
    }
  });
  $("btn-profile-clear").addEventListener("click", async () => {
    if (!confirm("清空全部网申资料？此操作无法撤销，建议先导出备份。")) return;
    try {
      await saveProfile({ version: 1, entries: [] });
      toast("资料已清空");
    } catch (err) {
      toast(err.message || "清空失败", "error");
    }
  });
}
