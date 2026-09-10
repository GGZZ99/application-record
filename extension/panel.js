let profile = { version: 1, entries: [] }, view = 'all', editing = null;
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const expandedCategories = new Set();
const expandedProjects = new Set();
const expandedEducation = new Set();
const categories = [
  ['基本信息', ['基本信息', '个人日期']],
  ['教育经历', ['硕士', '本科', '高中']],
  ['项目经历', ['项目经历']],
  ['校内职务', ['校内职务']],
  ['技能与证书', ['专业技能', '语言证书', '证书荣誉']],
  ['求职意向', ['求职偏好']],
  ['自我评价与论文', ['长文本']],
  ['家庭成员', ['父亲', '母亲', '配偶', '家属', '亲属']],
  ['紧急联系人', ['紧急联系人']],
  ['待补充与核实', ['待补充', '待核实']]
];
const PROFILE_URL = 'http://127.0.0.1:8787/api/profile';
function categoryOf(entry) {
  if (entry.group.startsWith('项目：') || entry.group.startsWith('项目:')) return '项目经历';
  return categories.find(([, groups]) => groups.includes(entry.group))?.[0] || entry.group || '其他资料';
}
async function loadRemoteProfile() {
  try {
    const res = await fetch(PROFILE_URL);
    if (!res.ok) return null;
    const data = await res.json();
    ResumeEngine.validate(data);
    await chrome.storage.local.set({ profile: data });
    return data;
  } catch {
    return null;
  }
}

async function start() {
  profile = (await loadRemoteProfile()) || (await chrome.storage.local.get('profile')).profile || { version: 1, entries: [] };
  const session = await chrome.storage.session.get(['pageStatus', 'context', 'dateField']);
  status(session.pageStatus || '点击扩展图标启用当前网页。资料与应聘记录本地服务同步。');
  $('context').textContent = session.context || '';
  if (session.dateField) view = 'dates';
  render();
}
function render() {
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  const query = $('search').value.trim().toLowerCase();
  const entries = profile.entries.filter(e => (view !== 'dates' || e.date) && (view !== 'pending' || e.pending) && [categoryOf(e), e.group, e.label, e.value, ...e.aliases].join(' ').toLowerCase().includes(query));
  $('entries').replaceChildren();
  const containers = new Map();
  const projectContainers = new Map();
  const educationContainers = new Map();
  if (view === 'all') {
    const names = [...new Set([...categories.map(([name]) => name), ...entries.map(categoryOf)])];
    for (const name of names) {
      const count = entries.filter(e => categoryOf(e) === name).length;
      if (!count) continue;
      const details = document.createElement('details'); details.className = 'category';
      details.open = Boolean(query) || expandedCategories.has(name);
      const summary = document.createElement('summary');
      const label = document.createElement('span'); label.textContent = name;
      const badge = document.createElement('span'); badge.className = 'count'; badge.textContent = `${count} 条`;
      summary.append(label, badge);
      const content = document.createElement('div'); content.className = 'category-content';
      details.append(summary, content);
      details.addEventListener('toggle', () => {
        if (!details.isConnected || query) return;
        if (details.open) expandedCategories.add(name); else expandedCategories.delete(name);
      });
      containers.set(name, content);
      $('entries').append(details);
    }
    const projects = containers.get('项目经历');
    if (projects) {
      const groups = [...new Set(entries.filter(e => categoryOf(e) === '项目经历').map(e => e.group))];
      for (const group of groups) {
        const records = profile.entries.filter(e => e.group === group);
        const value = label => records.find(e => e.label === label)?.value;
        const details = document.createElement('details'); details.className = 'project';
        details.open = Boolean(query) || expandedProjects.has(group);
        const summary = document.createElement('summary');
        const title = document.createElement('strong'); title.textContent = value('项目名称') || group;
        const dates = document.createElement('span'); dates.className = 'project-dates';
        dates.textContent = value('项目起止日期') || '起止时间待补充';
        const meta = document.createElement('span'); meta.className = 'project-meta';
        meta.textContent = [value('项目角色'), value('项目单位')].filter(Boolean).join(' · ');
        summary.append(title, dates, meta);
        const content = document.createElement('div'); content.className = 'project-content';
        details.append(summary, content);
        details.addEventListener('toggle', () => {
          if (!details.isConnected || query) return;
          if (details.open) expandedProjects.add(group); else expandedProjects.delete(group);
        });
        projects.append(details);
        projectContainers.set(group, content);
      }
    }
    const education = containers.get('教育经历');
    if (education) {
      const groups = [...new Set(entries.filter(e => categoryOf(e) === '教育经历').map(e => e.group))];
      for (const group of groups) {
        const records = profile.entries.filter(e => e.group === group);
        const value = label => records.find(e => e.label === label)?.value;
        const details = document.createElement('details'); details.className = 'education'; details.open = Boolean(query) || expandedEducation.has(group);
        const summary = document.createElement('summary');
        const title = document.createElement('strong'); title.textContent = group;
        const dates = document.createElement('span'); dates.className = 'project-dates'; dates.textContent = value('教育起止日期') || '起止时间待补充';
        const school = document.createElement('span'); school.className = 'project-meta'; school.textContent = [value('学校名称'), value('学院')].filter(Boolean).join(' · ') || '学校和学院待补充';
        summary.append(title, dates, school);
        const content = document.createElement('div'); content.className = 'project-content'; details.append(summary, content);
        details.addEventListener('toggle', () => { if (!details.isConnected || query) return; if (details.open) expandedEducation.add(group); else expandedEducation.delete(group); });
        education.append(details); educationContainers.set(group, content);
      }
    }
  }
  for (const entry of entries) {
    const article = document.createElement('article');
    const meta = document.createElement('div'); meta.className = 'meta';
    const group = document.createElement('span'); group.textContent = entry.group;
    const edit = document.createElement('button'); edit.textContent = '编辑'; edit.onclick = () => openEditor(entry);
    meta.append(group, edit);
    const title = document.createElement('h3'); title.textContent = entry.label + (entry.pending ? ' · 待确认' : '');
    const value = document.createElement('div'); value.className = 'value'; value.textContent = entry.value || '待补充';
    article.append(meta, title, value);
    if (entry.source) { const source = document.createElement('small'); source.textContent = entry.source; article.append(source); }
    if (entry.value) { const copy = document.createElement('button'); copy.className = 'copy'; copy.textContent = '复制'; copy.onclick = async () => { try { await navigator.clipboard.writeText(entry.value); status('已复制：' + entry.label); } catch { status('复制失败，请选中文字复制'); } }; article.append(copy); }
    (projectContainers.get(entry.group) || educationContainers.get(entry.group) || containers.get(categoryOf(entry)) || $('entries')).append(article);
  }
  if (!entries.length) $('entries').textContent = profile.entries.length ? '暂无匹配资料' : '欢迎使用！点击右上角 ＋ 新增个人资料，或在底部导入自己的资料备份。';
}
function openEditor(entry) {
  editing = entry?.id || null;
  const form = $('edit-form'); form.reset();
  const groupSelect = form.elements.group;
  groupSelect.replaceChildren(new Option('请选择分组', ''));
  const groupNames = [...new Set([...categories.flatMap(([, groups]) => groups), ...profile.entries.map(e => e.group)].filter(Boolean))];
  for (const name of groupNames) groupSelect.add(new Option(name, name));
  const newOption = new Option('＋ 新增分组', '');
  newOption.dataset.create = 'true';
  groupSelect.add(newOption);
  groupSelect.value = entry?.group || '';
  updateGroupInput();
  for (const key of ['label', 'value', 'source']) form.elements[key].value = entry?.[key] || '';
  form.elements.aliases.value = entry?.aliases.join(', ') || '';
  for (const key of ['date', 'pending']) form.elements[key].checked = entry?.[key] || false;
  $('delete').hidden = !entry;
  $('editor').showModal();
}
function updateGroupInput() {
  const form = $('edit-form');
  const creating = form.elements.group.selectedOptions[0]?.dataset.create === 'true';
  $('new-group-row').hidden = !creating;
  form.elements.newGroup.disabled = !creating;
  form.elements.newGroup.required = creating;
  form.elements.group.required = !creating;
  form.elements.newGroup.setCustomValidity('');
}
$('edit-form').elements.group.onchange = () => {
  updateGroupInput();
  if (!$('new-group-row').hidden) $('edit-form').elements.newGroup.focus();
};
$('edit-form').elements.newGroup.oninput = event => event.target.setCustomValidity('');
async function save(next) {
  ResumeEngine.validate(next);
  await chrome.storage.local.set({ profile: next });
  profile = next;
  render();
  try {
    const res = await fetch(PROFILE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next)
    });
    if (!res.ok) throw new Error('本地服务未保存');
  } catch {
    status('已保存在插件缓存。启动 start.bat 后会再同步到应聘记录。');
  }
}
$('edit-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const entry = { id: editing || crypto.randomUUID(), aliases: form.elements.aliases.value.split(/[,，]/).map(x => x.trim()).filter(Boolean) };
  entry.group = form.elements.newGroup.disabled ? form.elements.group.value : form.elements.newGroup.value.trim();
  if (!entry.group) {
    form.elements.newGroup.setCustomValidity('请输入分组名称');
    form.reportValidity();
    return;
  }
  for (const key of ['label', 'value', 'source']) entry[key] = form.elements[key].value.trim();
  for (const key of ['date', 'pending']) entry[key] = form.elements[key].checked;
  try { await save({ ...profile, entries: editing ? profile.entries.map(e => e.id === editing ? entry : e) : [...profile.entries, entry] }); $('editor').close(); status('已保存到本机'); } catch (e) { alert(e.message); }
};
$('add').onclick = () => openEditor(null);
$('cancel').onclick = () => $('editor').close();
$('delete').onclick = async () => { if (confirm('删除这条资料？')) { await save({ ...profile, entries: profile.entries.filter(e => e.id !== editing) }); $('editor').close(); } };
$('search').oninput = render;
document.querySelectorAll('nav button').forEach(button => { button.onclick = () => { view = button.dataset.view; render(); }; });
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '网申资料备份.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2_000_000) throw new Error('文件不能超过 2 MB');
    const imported = ResumeEngine.validate(JSON.parse(await file.text()));
    if (confirm('导入将替换当前资料，建议先导出备份。继续？')) { await save(imported); status('资料已导入'); }
  } catch (error) { status('导入失败：' + error.message); }
  event.target.value = '';
};
$('clear').onclick = async () => { if (confirm('清空扩展内全部资料？此操作无法撤销，建议先导出备份。')) { await save({ version: 1, entries: [] }); status('扩展内资料已清空'); } };
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.profile) { profile = changes.profile.newValue || { version: 1, entries: [] }; render(); }
  if (area === 'session') {
    if (changes.pageStatus) status(changes.pageStatus.newValue);
    if (changes.context) $('context').textContent = changes.context.newValue;
    if (changes.dateField?.newValue) { view = 'dates'; $('search').value = ''; render(); }
  }
});
start();
