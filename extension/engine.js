(() => {
  const normalize = value => String(value || '').toLowerCase().replace(/[\s:：*（()）_\-]/g, '');
  const isDate = (text, type = '') => /^(date|datetime-local|month|week|time)$/.test(type) || /日期|时间|年月|出生(?!地)|入学年|毕业年|起止|开始|结束|birthday|birthdate|startdate|enddate|graduationdate|\bdate\b|yyyy/i.test(text);
  const emergency = text => /紧急|emergency/i.test(text);
  function contactKind(text) {
    if (/关系|relationship|relation/i.test(text)) return 'relation';
    if (/电话|手机|号码|phone|mobile|tel/i.test(text)) return 'phone';
    if (/姓名|名字|name/i.test(text) || /^(紧急联系人|emergencycontact)$/i.test(normalize(text))) return 'name';
    return '';
  }
  function familyRole(text) {
    const roles = [];
    if (/父亲|父方|father/i.test(text)) roles.push('父亲');
    if (/母亲|母方|mother/i.test(text)) roles.push('母亲');
    if (/配偶|spouse/i.test(text)) roles.push('配偶');
    return roles.length === 1 ? roles[0] : '';
  }
  const family = text => /家庭成员|家属|亲属|父亲|母亲|配偶|father|mother|spouse/i.test(text);
  function familyKind(text) {
    if (/单位|公司|雇主|employer|company|organization/i.test(text)) return 'organization';
    if (/职务|职位|岗位|职业|position|occupation|jobtitle/i.test(text)) return 'position';
    if (/政治面貌|政治身份/i.test(text)) return 'politics';
    if (/地址|住址|居住地|address/i.test(text)) return 'address';
    if (/性别|gender|sex/i.test(text)) return 'gender';
    return contactKind(text);
  }
  function rank(entries, label, context = '') {
    const query = normalize(label);
    if (!query) return [];
    const emergencyField = emergency(label + ' ' + context);
    const familyField = !emergencyField && family(label + ' ' + context);
    const role = familyRole(label) || familyRole(context);
    return entries.filter(e => {
      if (!e.value || e.date || e.pending) return false;
      const identity = e.group + ' ' + e.label;
      if (emergencyField) return emergency(identity);
      if (emergency(identity)) return false;
      if (familyField) return family(identity) && (!role || familyRole(identity) === role);
      return !family(identity);
    }).map(entry => {
      let score = 0;
      if (familyField) {
        const requested = familyKind(label);
        if (!requested || requested !== familyKind(entry.label)) return { entry, score: 0 };
        score = 100;
      }
      if (emergencyField) {
        const requested = contactKind(label);
        const available = contactKind(entry.label);
        if (!requested || requested !== available) return { entry, score: 0 };
        score = 100;
      }
      for (const alias of [entry.label, ...entry.aliases]) {
        const a = normalize(alias);
        if (a.length < 2) continue;
        if (query === a) score = Math.max(score, 100);
        else if (query.includes(a)) score = Math.max(score, 50 + Math.min(a.length, 20));
      }
      if (score && normalize(context).includes(normalize(entry.group))) score += 15;
      return { entry, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.entry);
  }
  function validate(profile) {
    if (!profile || profile.version !== 1 || !Array.isArray(profile.entries) || profile.entries.length > 1000) throw new Error('资料格式不正确');
    const ids = new Set();
    for (const e of profile.entries) {
      if (!e || !['id', 'group', 'label', 'value'].every(k => typeof e[k] === 'string') || !e.id || ids.has(e.id) || !Array.isArray(e.aliases) || !e.aliases.every(x => typeof x === 'string') || (e.source !== undefined && typeof e.source !== 'string') || ['date', 'pending'].some(k => typeof e[k] !== 'boolean') || e.value.length > 30000) throw new Error('资料字段不正确或编号重复');
      ids.add(e.id);
    }
    return profile;
  }
  globalThis.ResumeEngine = { normalize, isDate, rank, validate };
})();
