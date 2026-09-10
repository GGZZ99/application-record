(() => {
  globalThis.__resumeHelper?.dispose?.();
  const controller = new AbortController();
  let disposed = false;
  const storageChanged = (changes, area) => { if (!disposed && area === 'local' && changes.profile) entries = changes.profile.newValue?.entries || []; };
  const instance = { dispose };
  globalThis.__resumeHelper = instance;
  let entries = [], target = null, previous = null;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;inset:0 auto auto 0;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial}*{box-sizing:border-box}section{font:14px/1.5 system-ui,sans-serif;color:#202724;background:#fff;border:1px solid #cbd5ce;border-radius:6px;box-shadow:0 5px 22px #0002;padding:10px;width:min(340px,calc(100vw - 16px));max-height:300px;overflow:auto}header{display:flex;justify-content:space-between;align-items:center;color:#526157;font-size:12px;margin-bottom:6px}button{font:inherit;cursor:pointer;letter-spacing:0}header button{border:0;background:none;padding:4px 8px;color:#526157}section>button{display:block;width:100%;text-align:left;border:0;border-top:1px solid #eef1ef;background:white;padding:9px 4px;color:#202724;overflow-wrap:anywhere}section>button:hover,section>button:focus{background:#edf5ef}small{display:block;color:#617368}p{margin:8px 0}';
  const box = document.createElement('section');
  box.setAttribute('aria-label', '网申填写候选');
  shadow.append(style, box);
  const hide = () => { host.remove(); };
  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    host.remove();
    entries = [];
    target = previous = null;
    try { globalThis.chrome?.storage?.onChanged?.removeListener(storageChanged); } catch {}
    if (globalThis.__resumeHelper === instance) delete globalThis.__resumeHelper;
  }
  function connected() {
    if (disposed) return false;
    try {
      if (globalThis.chrome?.runtime?.id && typeof globalThis.chrome.runtime.sendMessage === 'function') return true;
    } catch {}
    dispose();
    return false;
  }
  function notifyContext(message) {
    if (!connected()) return false;
    try {
      // Invalidated contexts can throw before returning a promise.
      Promise.resolve(globalThis.chrome.runtime.sendMessage(message)).catch(error => {
        if (!connected() || /context invalidated/i.test(String(error))) dispose();
      });
      return true;
    } catch {
      dispose();
      return false;
    }
  }
  if (!connected()) return;
  try {
    chrome.storage.onChanged.addListener(storageChanged);
    Promise.resolve(chrome.storage.local.get('profile')).then(({ profile }) => {
      if (!disposed) entries = profile?.entries || [];
    }).catch(() => dispose());
  } catch {
    dispose();
    return;
  }
  function position() {
    if (!target?.isConnected || !host.isConnected) return;
    const rect = target.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) { hide(); return; }
    const width = Math.min(340, innerWidth - 16);
    const gap = 12, margin = 8;
    box.style.maxHeight = Math.min(300, innerHeight - margin * 2) + 'px';
    let left, top;
    if (rect.right + gap + width <= innerWidth - margin) {
      left = rect.right + gap;
      top = Math.max(margin, Math.min(rect.top, innerHeight - box.offsetHeight - margin));
    } else if (rect.left - gap - width >= margin) {
      left = rect.left - gap - width;
      top = Math.max(margin, Math.min(rect.top, innerHeight - box.offsetHeight - margin));
    } else {
      const available = rect.top - gap - margin;
      // Never cover the site's dropdown below the active field.
      if (available < 80) { hide(); return; }
      box.style.maxHeight = Math.min(300, available) + 'px';
      left = Math.max(margin, Math.min(rect.left, innerWidth - width - margin));
      top = rect.top - gap - box.offsetHeight;
    }
    host.style.left = left + 'px';
    host.style.top = top + 'px';
  }
  function describe(el) {
    const labels = Array.from(el.labels || []).map(x => x.textContent);
    const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '');
    const explicit = [...labels, ...labelled, el.getAttribute('aria-label')].filter(x => x?.trim());
    let nearby = '';
    if (!explicit.length) {
      // Follow only the current field's wrappers, never the text of a whole row.
      for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        const prev = node.previousElementSibling;
        if (prev) {
          const text = prev.textContent.trim();
          if (!prev.matches('input,textarea,select,button') && !prev.querySelector('input,textarea,select,button') && prev.getClientRects().length && text.length > 1 && text.length <= 60) nearby = text;
          // A preceding control or unrelated sibling is a boundary, not a label.
          break;
        }
        const parent = node.parentElement;
        if (!parent || parent.querySelectorAll('input:not([type=hidden]),textarea,select').length !== 1) break;
      }
    }
    return [...explicit, nearby, el.getAttribute('placeholder'), el.name, el.id, el.autocomplete].filter(Boolean).join(' ').slice(0, 400);
  }
  function groupTitle(el) {
    const group = el.closest('fieldset,section,.education-item');
    return group?.querySelector(':scope > legend,:scope > h2,:scope > h3,:scope > h4')?.textContent?.trim().slice(0, 100) || '';
  }
  function write(el, value) {
    if (!connected()) throw new Error('插件连接已失效，请重新启用');
    if (!el.isConnected || el.disabled || el.readOnly) throw new Error('字段已不可填写');
    if (el instanceof HTMLSelectElement) {
      const option = Array.from(el.options).find(o => !o.disabled && (o.text.trim() === value || o.value === value));
      if (!option) throw new Error('下拉选项不匹配，请手动选择');
      value = option.value;
    }
    if (el.maxLength > 0 && value.length > el.maxLength) throw new Error('内容超出字段长度，请在资料页调整后填写');
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function render(el) {
    if (!connected()) return;
    if (!(el instanceof Element) || !el.matches('input,textarea,select') || el.disabled || el.readOnly || /^(password|file|hidden|submit|button|reset|checkbox|radio|color|range)$/.test(el.type)) { hide(); return; }
    target = el;
    const label = describe(el);
    const date = ResumeEngine.isDate(label, el.type);
    if (!notifyContext({ type: 'context', text: label || '未识别字段', date })) return;
    box.replaceChildren();
    const header = document.createElement('header');
    const title = document.createElement('span'); title.textContent = date ? '日期备忘' : '网申资料候选';
    const close = document.createElement('button'); close.textContent = '×'; close.title = '关闭'; close.onclick = hide;
    header.append(title, close); box.append(header);
    const candidates = date ? [] : ResumeEngine.rank(entries, label, groupTitle(el));
    if (!candidates.length) { const p = document.createElement('p'); p.textContent = date ? '日期请参考右侧栏，手动填写。' : '暂无确定候选，可在右侧栏搜索并复制。'; box.append(p); }
    for (const entry of candidates) {
      const button = document.createElement('button');
      const small = document.createElement('small'); small.textContent = entry.group + ' · ' + entry.label;
      const text = document.createElement('span'); text.textContent = entry.value.length > 130 ? entry.value.slice(0, 130) + '…' : entry.value;
      button.append(small, text); button.title = entry.value;
      button.onclick = () => {
        try {
          previous = { el: target, value: target.value };
          write(target, entry.value);
          box.replaceChildren(header);
          const undo = document.createElement('button'); undo.textContent = '已填入 · 撤销';
          undo.onclick = () => { try { write(previous.el, previous.value); hide(); } catch (error) { undo.textContent = error.message; } };
          box.append(undo);
        } catch (error) { title.textContent = error.message; }
      };
      box.append(button);
    }
    document.documentElement.append(host);
    position();
  }
  const options = { signal: controller.signal };
  document.addEventListener('focusin', event => { if (!event.composedPath().includes(host)) render(event.target); }, options);
  document.addEventListener('click', event => { if (event.target instanceof Element && event.target.matches('input,textarea,select') && (event.target !== target || !host.isConnected)) render(event.target); }, options);
  document.addEventListener('pointerdown', event => { if (!event.composedPath().includes(host) && event.target !== target) hide(); }, { ...options, capture: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, options);
  window.addEventListener('resize', position, options);
  document.addEventListener('scroll', position, { ...options, capture: true });
})();
