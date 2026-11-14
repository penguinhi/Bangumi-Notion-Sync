// ==UserScript==
// @name         Bangumi → Notion 同步
// @namespace    penguinhi.bangumi.notion
// @version      2.4.0
// @description  把 bgm.tv 的动画收藏单向同步到 Notion:没有的新建,已有的更新状态、集数和进度,并补全空字段
// @author       penguinhi
// @match        *://bgm.tv/subject/*
// @match        *://bangumi.tv/subject/*
// @match        *://chii.in/subject/*
// @connect      api.notion.com
// @connect      api.bgm.tv
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置(Token 等密钥见下方 SECRETS)──
  const CFG = {
    ON_EXISTING: 'advance', // 已有条目:'advance' 更新状态/集数/进度并补空日期, 'skip' 不碰
    DELETE_BEHAVIOR: 'ignore', // 取消收藏:'ignore' 只提示, 'archive' 移入废纸篓
    START_DATE_FALLBACK_TODAY: false, // true:推不出开始日期时填当天, false:留空
    TITLE_GUARD: true, // 链接匹配不到时再按标题查重
    ONLY_ANIME: true,
    SET_PAGE_COVER: false, // 同时设为页面顶部大图
    TIMEZONE: 'Asia/Tokyo',

    PROP: {
      title: 'Title',
      altTitle: 'Alternative Title',
      status: 'Status',
      epsWatched: 'Episodes Watched',
      eps: 'Episodes',
      rating: 'Rating',
      startDate: 'Start Date',
      finishDate: 'Finish Date',
      aired: 'Aired',
      bangumi: 'Bangumi',
      comment: 'Comment',
      cover: 'Cover',
    },
  };

  // ── 密钥:存在脚本管理器本地,首次点按钮时打开设置面板,可从菜单修改 ──
  const SECRETS = [
    {
      key: 'NOTION_TOKEN',
      label: 'Notion Integration Token',
      hidden: true,
      link: 'https://www.notion.so/my-integrations',
    },
    { key: 'NOTION_DB_ID', label: 'Notion 数据库 ID' },
    {
      key: 'BGM_TOKEN',
      label: 'Bangumi Access Token',
      hidden: true,
      link: 'https://next.bgm.tv/demo/access-token',
    },
    { key: 'BGM_USER', label: 'Bangumi 用户名或 UID' },
  ];
  const SECRET_PREFIX = 'secret:';

  function loadSecrets() {
    SECRETS.forEach(function (s) {
      CFG[s.key] = GM_getValue(SECRET_PREFIX + s.key, '');
    });
    return SECRETS.every(function (s) {
      return !!CFG[s.key];
    });
  }

  // 页面内的设置面板。
  let panelEl = null;
  function openSettings() {
    if (panelEl) return;
    const css = (node, style) => Object.assign(node.style, style);
    const make = (tag, text, style) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (style) css(node, style);
      return node;
    };

    panelEl = make('div', '', {
      position: 'fixed',
      inset: '0',
      zIndex: 100000,
      background: 'rgba(0,0,0,.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    const box = make('div', '', {
      width: '380px',
      maxWidth: 'calc(100vw - 32px)',
      padding: '18px 20px',
      borderRadius: '8px',
      background: '#fff',
      color: '#333',
      font: '13px/1.5 -apple-system, "Hiragino Sans", "Microsoft YaHei", sans-serif',
      boxShadow: '0 4px 24px rgba(0,0,0,.2)',
    });
    box.appendChild(make('div', 'Bangumi → Notion 同步设置', { fontSize: '15px', fontWeight: '600' }));
    box.appendChild(
      make('div', '只保存在本机的脚本管理器里。', {
        marginTop: '4px',
        fontSize: '12px',
        color: '#888',
      })
    );

    const inputs = {};
    SECRETS.forEach(function (s) {
      const cur = GM_getValue(SECRET_PREFIX + s.key, '');
      const row = make('div', '', { marginTop: '12px' });
      const head = make('div', s.label, { fontSize: '12px', color: '#666' });
      if (s.link) {
        const a = make('a', '去获取', { marginLeft: '8px', color: '#c96a71' });
        a.href = s.link;
        a.target = '_blank';
        a.rel = 'noopener';
        head.appendChild(a);
      }
      const input = make('input', '', {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        marginTop: '4px',
        padding: '6px 8px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        font: '13px monospace',
      });
      input.type = s.hidden ? 'password' : 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (s.hidden) input.placeholder = cur ? '已设置,留空保留原值' : '';
      else input.value = cur;
      row.appendChild(head);
      row.appendChild(input);
      box.appendChild(row);
      inputs[s.key] = input;
    });

    const msg = make('div', '', { minHeight: '18px', marginTop: '10px', fontSize: '12px', color: '#d64545' });
    const btnStyle = {
      marginLeft: '8px',
      padding: '6px 14px',
      borderRadius: '999px',
      border: '1px solid #F09199',
      cursor: 'pointer',
      font: 'inherit',
    };
    const actions = make('div', '', { textAlign: 'right' });
    const cancel = make('button', '取消', Object.assign({}, btnStyle, { background: '#fff', color: '#c96a71' }));
    const save = make('button', '保存并同步', Object.assign({}, btnStyle, { background: '#F09199', color: '#fff' }));
    actions.appendChild(cancel);
    actions.appendChild(save);
    box.appendChild(msg);
    box.appendChild(actions);

    function close() {
      panelEl.remove();
      panelEl = null;
    }
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () {
      const missing = [];
      SECRETS.forEach(function (s) {
        const v = inputs[s.key].value.trim();
        if (v) GM_setValue(SECRET_PREFIX + s.key, v);
        else if (!GM_getValue(SECRET_PREFIX + s.key, '')) missing.push(s.label);
      });
      if (missing.length) {
        msg.textContent = '还缺:' + missing.join('、');
        return;
      }
      close();
      loadSecrets();
      sync({ force: true });
    });
    panelEl.addEventListener('keydown', function (e) {
      e.stopPropagation(); // 别让站点快捷键吃掉输入
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') save.click();
    });

    panelEl.appendChild(box);
    document.body.appendChild(panelEl);
    const firstEmpty = SECRETS.find(function (s) {
      return !GM_getValue(SECRET_PREFIX + s.key, '');
    });
    inputs[(firstEmpty || SECRETS[0]).key].focus();
  }

  GM_registerMenuCommand('设置 Token / 数据库', openSettings);
  GM_registerMenuCommand('清除已保存的 Token', function () {
    if (!confirm('清除本地保存的 Notion / Bangumi Token、数据库 ID 和用户名?')) return;
    SECRETS.forEach(function (s) {
      GM_setValue(SECRET_PREFIX + s.key, '');
    });
    loadSecrets();
    toast('已清除。下次点「同步到 Notion」时会重新询问。', 'done');
  });

  const STATUS_MAP = {
    1: 'Plan to Watch',
    2: 'Completed',
    3: 'Watching',
    4: 'On-Hold',
    5: 'Dropped',
  };

  // 这三种都会填 Finish Date
  const FINISHED = ['Completed', 'On-Hold', 'Dropped'];

  const NOTION_VERSION = '2022-06-28';
  const UA = 'penguinhi/bangumi-notion-sync (userscript)';

  // ── 请求 ──
  function request({ method = 'GET', url, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: body ? JSON.stringify(body) : undefined,
        onload: (res) => {
          let parsed = null;
          try {
            parsed = res.responseText ? JSON.parse(res.responseText) : null;
          } catch (e) {}
          resolve({ status: res.status, data: parsed, raw: res.responseText });
        },
        onerror: () => reject(new Error('网络请求失败: ' + method + ' ' + url)),
        ontimeout: () => reject(new Error('请求超时: ' + method + ' ' + url)),
        timeout: 20000,
      });
    });
  }

  function bgm(path, auth) {
    const headers = { Accept: 'application/json', 'User-Agent': UA };
    if (auth !== false) headers.Authorization = 'Bearer ' + CFG.BGM_TOKEN;
    return request({ url: 'https://api.bgm.tv' + path, headers });
  }

  function notion(method, path, body) {
    return request({
      method,
      url: 'https://api.notion.com/v1' + path,
      headers: {
        Authorization: 'Bearer ' + CFG.NOTION_TOKEN,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body,
    });
  }

  // ── 工具 ──
  const subjectId = (location.pathname.match(/\/subject\/(\d+)/) || [])[1];

  // updated_at 可能是秒级时间戳或 ISO 字符串,统一转毫秒
  function toMillis(v) {
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') {
      if (/^\d+$/.test(v)) {
        const n = Number(v);
        return n < 1e12 ? n * 1000 : n;
      }
      const t = Date.parse(v);
      return isNaN(t) ? null : t;
    }
    return null;
  }

  // 按 TIMEZONE 取日期。bgm.tv 显示 UTC+8,所以站上 23 点后的记录在东京算次日。
  function bgmDay(ms) {
    return new Date(ms).toLocaleDateString('sv-SE', { timeZone: CFG.TIMEZONE });
  }

  function today() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: CFG.TIMEZONE });
  }

  function subjectUrl(id) {
    return 'https://bgm.tv/subject/' + id;
  }

  function dateOf(prop) {
    return prop && prop.type === 'date' && prop.date ? prop.date.start : null;
  }

  function selectOf(prop) {
    return prop && prop.type === 'select' && prop.select ? prop.select.name : null;
  }

  function numberOf(prop) {
    return prop && prop.type === 'number' ? prop.number : null;
  }

  function textOf(prop) {
    if (!prop) return '';
    const parts = prop.type === 'title' ? prop.title : prop.type === 'rich_text' ? prop.rich_text : [];
    return (parts || []).map((t) => t.plain_text || '').join('');
  }

  // 属性存在且没有值。数据库里没有这一列或类型不符时返回 false,不去写它。
  function isBlank(prop) {
    if (!prop) return false;
    switch (prop.type) {
      case 'title':
      case 'rich_text':
      case 'files':
        return !(prop[prop.type] || []).length;
      case 'date':
        return !prop.date;
      default:
        return false;
    }
  }

  // 上次记录的指纹里,评分或吐槽和现在不同
  function notesChanged(stored, col) {
    try {
      const p = JSON.parse(stored);
      return Array.isArray(p) && (p[1] !== col.rate || p[3] !== (col.comment || ''));
    } catch (e) {
      return false;
    }
  }

  // ── 界面 ──
  let toastEl;
  function toast(msg, tone) {
    tone = tone || 'info';
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, {
        position: 'fixed',
        right: '16px',
        bottom: '56px',
        zIndex: 99999,
        maxWidth: '260px',
        padding: '9px 13px',
        borderRadius: '4px',
        font: '13px/1.5 -apple-system, "Hiragino Sans", "Microsoft YaHei", sans-serif',
        background: '#fff',
        color: '#333',
        border: '1px solid #e0e0e0',
        borderLeft: '3px solid #F09199',
        boxShadow: '0 2px 10px rgba(0,0,0,.12)',
        opacity: '0',
        transition: 'opacity .2s',
        pointerEvents: 'none',
        whiteSpace: 'pre-line',
      });
      document.body.appendChild(toastEl);
    }
    toastEl.style.borderLeftColor =
      tone === 'error' ? '#d64545' : tone === 'done' ? '#4a9d5f' : '#F09199';
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () {
      toastEl.style.opacity = '0';
    }, tone === 'error' ? 8000 : msg.indexOf('\n') !== -1 ? 6000 : 3500);
  }

  function addButton() {
    const btn = document.createElement('button');
    btn.textContent = '同步到 Notion';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: 99999,
      padding: '7px 14px',
      borderRadius: '999px',
      border: '1px solid #F09199',
      background: '#fff',
      color: '#c96a71',
      font: '12px/1 -apple-system, "Hiragino Sans", "Microsoft YaHei", sans-serif',
      cursor: 'pointer',
      boxShadow: '0 1px 6px rgba(0,0,0,.1)',
    });
    btn.addEventListener('click', function () {
      sync({ force: true });
    });
    document.body.appendChild(btn);
  }

  // ── 查重:先按链接,再按标题 ──
  async function findExisting(subject) {
    const P = CFG.PROP;
    const byUrl = await notion('POST', '/databases/' + CFG.NOTION_DB_ID + '/query', {
      filter: { property: P.bangumi, url: { equals: subjectUrl(subject.id) } },
      page_size: 1,
    });
    if (byUrl.status !== 200) return { error: byUrl };
    if ((byUrl.data.results || []).length) {
      return { page: byUrl.data.results[0], matchedBy: 'url' };
    }

    if (!CFG.TITLE_GUARD) return { page: null };

    // Title 是原名,Alternative Title 是中文名
    const or = [];
    if (subject.name) or.push({ property: P.title, title: { equals: subject.name } });
    if (subject.name_cn) {
      or.push({ property: P.altTitle, rich_text: { equals: subject.name_cn } });
    }
    if (!or.length) return { page: null };

    // 只认还没填链接的页面:已绑定其他条目的同名页面(如重制版)不会被抢走
    const byTitle = await notion('POST', '/databases/' + CFG.NOTION_DB_ID + '/query', {
      filter: { and: [{ or: or }, { property: P.bangumi, url: { is_empty: true } }] },
      page_size: 2,
    });
    if (byTitle.status !== 200) return { error: byTitle };
    const hits = byTitle.data.results || [];
    // 多条同名时无法判断是哪一条,不写入,交给用户手动填链接
    if (hits.length > 1) return { page: null, ambiguous: true };
    if (hits.length === 1) return { page: hits[0], matchedBy: 'title' };
    return { page: null };
  }

  // ── 属性构建 ──
  // 开始日期 = 最早标「看过」的那一集。收藏本身的 updated_at 每次改动都会被覆盖,
  // 只有分集记录保留了历史时间。
  async function firstWatchedDate() {
    try {
      const res = await bgm('/v0/users/-/collections/' + subjectId + '/episodes?limit=100');
      if (res.status !== 200 || !res.data || !Array.isArray(res.data.data)) return null;

      let earliest = null;
      for (const it of res.data.data) {
        if (it.type !== 2 || !it.updated_at) continue; // 2 = 看过
        const t = toMillis(it.updated_at);
        if (t !== null && (earliest === null || t < earliest)) earliest = t;
      }
      if (earliest === null) return null;
      return bgmDay(earliest);
    } catch (e) {
      return null;
    }
  }

  // 推不出时:单集条目用当天,多集条目看配置
  function resolveStart(totalEps, derived) {
    if (derived) return derived;
    if (totalEps === 1) return today();
    return CFG.START_DATE_FALLBACK_TODAY ? today() : null;
  }

  // 优先用已公布的话数;未知时暂用已建立的正片数量,不含 SP/OP/ED。
  async function totalEpsOf(subject) {
    if (Number.isInteger(subject.eps) && subject.eps > 0) return subject.eps;
    try {
      // total 是筛选后的总数,不受分页 limit 影响,无需下载全部章节。
      const res = await bgm('/v0/episodes?subject_id=' + subject.id + '&type=0&limit=1', false);
      if (
        res.status === 200 &&
        res.data &&
        Number.isInteger(res.data.total) &&
        res.data.total > 0
      ) {
        return res.data.total;
      }
    } catch (e) {}
    // 无正片章节或查询失败时跳过总集数,不阻断其他字段同步。
    return null;
  }

  // 封顶到总集数:Bangumi 进度含 SP,可能出现 26/24
  function watchedOf(total, col) {
    // 无法获取总集数时使用实际进度,不推算看完集数或按旧总数截断。
    if (total === null) return col.ep_status || 0;
    const status = STATUS_MAP[col.type];
    const raw = status === 'Completed' ? total : col.ep_status || 0;
    return Math.min(raw, total);
  }

  function buildNewProps(subject, col, derivedStart, totalEps) {
    const P = CFG.PROP;
    const status = STATUS_MAP[col.type];

    const props = {};
    if (subject.name) props[P.title] = { title: [{ text: { content: subject.name } }] };
    props[P.status] = { select: { name: status } };
    if (totalEps !== null) props[P.eps] = { number: totalEps };
    props[P.epsWatched] = { number: watchedOf(totalEps, col) };
    props[P.bangumi] = { url: subjectUrl(subject.id) };

    if (subject.name_cn) {
      props[P.altTitle] = { rich_text: [{ text: { content: subject.name_cn } }] };
    }

    if (col.rate) {
      props[P.rating] = { rich_text: [{ text: { content: String(col.rate) } }] };
    }

    if (subject.date) props[P.aired] = { date: { start: subject.date } };

    if (col.comment) {
      props[P.comment] = { rich_text: [{ text: { content: col.comment.slice(0, 2000) } }] };
    }

    const coverUrl = (subject.images || {}).large;
    if (coverUrl) {
      props[P.cover] = {
        files: [{ type: 'external', name: subject.name || 'cover', external: { url: coverUrl } }],
      };
    }

    const now = today();
    const start = resolveStart(totalEps, derivedStart);

    if (status === 'Watching') {
      props[P.startDate] = { date: { start: start || now } };
    } else if (FINISHED.indexOf(status) !== -1) {
      props[P.finishDate] = { date: { start: now } };
      if (start) props[P.startDate] = { date: { start: start } };
    }

    return { props: props, coverUrl: coverUrl, status: status };
  }

  // 改 Status / Episodes / Episodes Watched;其余字段只在 Notion 里为空时补,已有的值不覆盖。
  // 返回要写的属性、页面封面,以及给提示用的改动说明。
  function buildAdvanceProps(subject, col, page, derivedStart, totalEps) {
    const P = CFG.PROP;
    const old = page.properties;
    const status = STATUS_MAP[col.type];
    const props = {};
    const changes = [];
    const show = (v) => (v === null || v === undefined ? '空' : v);

    const prevStatus = selectOf(old[P.status]);
    if (prevStatus !== status) {
      props[P.status] = { select: { name: status } };
      changes.push('状态:' + show(prevStatus) + ' → ' + status);
    }

    // 连载中总集数可能变;话数未知时也按当前正片数量更新。
    const prevTotal = numberOf(old[P.eps]);
    if (totalEps !== null && prevTotal !== totalEps) {
      props[P.eps] = { number: totalEps };
      changes.push('总集数:' + show(prevTotal) + ' → ' + totalEps);
    }

    const watched = watchedOf(totalEps, col);
    const prevWatched = numberOf(old[P.epsWatched]);
    if (prevWatched !== watched) {
      props[P.epsWatched] = { number: watched };
      changes.push(
        '进度:' + show(prevWatched) + ' → ' + watched + (totalEps === null ? '' : '/' + totalEps)
      );
    }

    const finished = FINISHED.indexOf(status) !== -1;
    const now = today();
    const start = resolveStart(totalEps, derivedStart);

    if (!dateOf(old[P.startDate])) {
      const fill = status === 'Watching' ? start || now : finished ? start : null;
      if (fill) {
        props[P.startDate] = { date: { start: fill } };
        changes.push('补开始日期:' + fill);
      }
    }
    if (finished && !dateOf(old[P.finishDate])) {
      props[P.finishDate] = { date: { start: now } };
      changes.push('补完成日期:' + now);
    }

    // 补上链接,下次就能按链接精确匹配
    const prevUrl = old[P.bangumi];
    if (!prevUrl || prevUrl.type !== 'url' || !prevUrl.url) {
      props[P.bangumi] = { url: subjectUrl(subject.id) };
      changes.push('补 Bangumi 链接');
    }

    // 其余字段:取新建时会写的值,Notion 里为空才补
    const fresh = buildNewProps(subject, col, derivedStart, totalEps);
    const fill = [
      [P.title, '补标题'],
      [P.altTitle, '补中文标题'],
      [P.rating, '补评分:' + col.rate],
      [P.comment, '补吐槽'],
      [P.aired, '补放送日期:' + subject.date],
      [P.cover, '补封面'],
    ];
    for (const [key, label] of fill) {
      if (fresh.props[key] && isBlank(old[key])) {
        props[key] = fresh.props[key];
        changes.push(label);
      }
    }

    let cover = null;
    if (CFG.SET_PAGE_COVER && fresh.coverUrl && !page.cover) {
      cover = { type: 'external', external: { url: fresh.coverUrl } };
      changes.push('补页面封面');
    }

    // Notion 里已有的评分/吐槽与 Bangumi 不同(不会覆盖,只用来提示)
    const rateNow = col.rate ? String(col.rate) : '';
    const commentNow = (col.comment || '').slice(0, 2000);
    const notesStale =
      (!isBlank(old[P.rating]) && textOf(old[P.rating]) !== rateNow) ||
      (!isBlank(old[P.comment]) && textOf(old[P.comment]) !== commentNow);

    return { props: props, cover: cover, changes: changes, notesStale: notesStale };
  }

  // ── 主流程 ──
  let running = false;
  let lastCheck = 0;
  let secretHintShown = false;

  async function sync(opts) {
    opts = opts || {};
    const force = !!opts.force;
    const silent = !!opts.silent;

    if (!subjectId || running) return;
    if (!force && Date.now() - lastCheck < 4000) return;
    lastCheck = Date.now();
    running = true;

    try {
      if (!loadSecrets()) {
        // 只有手动点按钮才打开设置面板,保存后会再触发同步
        if (force) openSettings();
        else if (!secretHintShown) {
          secretHintShown = true;
          toast('尚未配置 Token。点右下角「同步到 Notion」进行设置。', 'error');
        }
        return;
      }

      const colRes = await bgm('/v0/users/' + CFG.BGM_USER + '/collections/' + subjectId);
      if (colRes.status === 404) {
        // 未收藏或刚取消收藏
        const k = 'fp:' + subjectId;
        const prev = GM_getValue(k, null);
        const wasCollected = prev !== null && prev !== 'none';

        if (wasCollected && CFG.DELETE_BEHAVIOR === 'archive') {
          const s = await bgm('/v0/subjects/' + subjectId, false);
          if (s.status === 200 && s.data) {
            const f = await findExisting(s.data);
            if (!f.error && f.page) {
              const del = await notion('PATCH', '/pages/' + f.page.id, { archived: true });
              toast(
                del.status === 200
                  ? '已取消收藏,Notion 页面移入废纸篓。'
                  : '取消收藏了,但归档失败(' + del.status + ')。',
                del.status === 200 ? 'done' : 'error'
              );
            }
          }
        } else if (wasCollected) {
          toast('已在 Bangumi 取消收藏。Notion 那条保持原样。', 'done');
        } else if (force) {
          toast('这个条目还没有收藏。', 'error');
        }

        GM_setValue(k, 'none');
        return;
      }
      if (colRes.status === 401) {
        toast('Bangumi token 无效或已过期。去 next.bgm.tv 重新生成,再从脚本菜单「设置 Token / 数据库」更新。', 'error');
        return;
      }
      if (colRes.status !== 200 || !colRes.data) {
        toast('读取 Bangumi 收藏失败(' + colRes.status + ')。', 'error');
        return;
      }
      const col = colRes.data;

      // 指纹:状态、评分、进度、吐槽。首次见到只记基线,不同步历史
      const fp = JSON.stringify([col.type, col.rate, col.ep_status, col.comment || '']);
      const key = 'fp:' + subjectId;
      const stored = GM_getValue(key, null);

      if (stored === null && !force) {
        GM_setValue(key, fp);
        return;
      }
      if (stored === fp && !force) return;

      const subRes = await bgm('/v0/subjects/' + subjectId, false);
      if (subRes.status !== 200 || !subRes.data) {
        toast('读取条目信息失败(' + subRes.status + ')。', 'error');
        return;
      }
      const subject = subRes.data;

      if (CFG.ONLY_ANIME && subject.type !== 2) {
        GM_setValue(key, fp);
        if (force) toast('这不是动画条目,已跳过。');
        return;
      }

      if (!silent) toast('正在检查…');

      const found = await findExisting(subject);
      if (found.error) {
        const e = found.error;
        if (e.status === 404) {
          toast('Notion 找不到这个数据库。检查 DB ID,以及是否把 integration 加进了数据库的 Connections。', 'error');
        } else if (e.status === 401) {
          toast('Notion token 无效。从脚本菜单「设置 Token / 数据库」更新。', 'error');
        } else {
          toast('Notion 查询失败(' + e.status + '):' + ((e.data || {}).message || ''), 'error');
        }
        return;
      }

      if (found.ambiguous) {
        // 记下指纹,避免自动检查反复提示;填好链接后手动点一次同步即可
        GM_setValue(key, fp);
        toast(
          'Notion 里有多条同名且没填链接的页面,无法确定是哪一条,未做改动。\n' +
            '请给对应页面填上 Bangumi 链接:' + subjectUrl(subject.id) + ',再点「同步到 Notion」。',
          'error'
        );
        return;
      }

      // ── 已存在 ──
      if (found.page) {
        if (CFG.ON_EXISTING === 'skip') {
          GM_setValue(key, fp);
          toast(
            'Notion 里已有这条' +
              (found.matchedBy === 'title' ? '(按标题匹配到)' : '') +
              ',未做改动。',
            'done'
          );
          return;
        }
        const totalEps = await totalEpsOf(subject);
        const derivedStart = await firstWatchedDate();
        const adv = buildAdvanceProps(subject, col, found.page, derivedStart, totalEps);
        // 刚在 Bangumi 改了评分/吐槽,而 Notion 里已有不同的值
        const notesHint =
          adv.notesStale && notesChanged(stored, col)
            ? 'Notion 里已有的评分和吐槽不会被覆盖,需要的话请在 Notion 里手改。'
            : '';
        if (!adv.changes.length) {
          GM_setValue(key, totalEps === null ? 'retry' : fp);
          toast(notesHint || 'Notion 里已是最新。', 'done');
          return;
        }
        const patch = { properties: adv.props };
        if (adv.cover) patch.cover = adv.cover;
        const upd = await notion('PATCH', '/pages/' + found.page.id, patch);
        if (upd.status === 200) {
          // 总集数暂不可用时保留重试标记,首次手动同步也能在下次自动检查时重试。
          GM_setValue(key, totalEps === null ? 'retry' : fp);
          toast(
            '已更新:' +
              (subject.name_cn || subject.name) +
              (found.matchedBy === 'title' ? '(按标题匹配到)' : '') +
              '\n' +
              adv.changes.join('\n') +
              (notesHint ? '\n' + notesHint : ''),
            'done'
          );
        } else {
          toast(
            '更新失败(' + upd.status + '):' + (((upd.data || {}).message) || '').slice(0, 160),
            'error'
          );
        }
        return;
      }

      // ── 新建 ──
      const totalEps = await totalEpsOf(subject);
      const derivedStart = await firstWatchedDate();
      const built = buildNewProps(subject, col, derivedStart, totalEps);
      const body = { parent: { database_id: CFG.NOTION_DB_ID }, properties: built.props };
      if (CFG.SET_PAGE_COVER && built.coverUrl) {
        body.cover = { type: 'external', external: { url: built.coverUrl } };
      }
      const res = await notion('POST', '/pages', body);
      if (res.status === 200) {
        GM_setValue(key, totalEps === null ? 'retry' : fp);
        toast('已新建:' + (subject.name_cn || subject.name) + ' → ' + built.status, 'done');
      } else {
        const msg = ((res.data || {}).message) || res.raw || '';
        toast('写入 Notion 失败(' + res.status + '):' + msg.slice(0, 160), 'error');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      running = false;
    }
  }

  // ── 触发 ──
  if (!subjectId) return;

  addButton();
  sync({ silent: true });

  let timer;
  document.addEventListener(
    'click',
    function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        sync();
      }, 2000);
    },
    true
  );

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sync();
  });
})();
