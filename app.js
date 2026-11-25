(() => {
  const DB = (window.DB_URL || "").replace(/\/+$/, "");
  const IDS = ["g1", "g2", "g3"];
  const LS = "bagalau_groups_v1";
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  let groups = {};
  let route = "teacher";
  let pollTimer = null;
  const saveTimers = {};

  // ---------- scoring ----------
  const total = (st) => BASE + CRITERIA.reduce((a, c, i) => a + (Number(st.k?.[i]) || 0), 0);
  const scale = (t) => SCALE.find((x) => t >= x.min) || SCALE[SCALE.length - 1];
  const level = (t) => (t >= 90 ? ["Өте жақсы", "p-ok"] : t >= 75 ? ["Жақсы", "p-mid"] : ["Қанағаттанарлық", "p-low"]);
  function summary(g) {
    const list = (g.students || []).map((s) => ({ ...s, t: total(s) }));
    const n = list.length;
    const avg = n ? list.reduce((a, s) => a + s.t, 0) / n : 0;
    const best = list.reduce((b, s) => (!b || s.t > b.t ? s : b), null);
    const gpa = n ? list.reduce((a, s) => a + scale(s.t).gpa, 0) / n : 0;
    const cnt = { ok: 0, mid: 0, low: 0 };
    list.forEach((s) => (s.t >= 90 ? cnt.ok++ : s.t >= 75 ? cnt.mid++ : cnt.low++));
    return { list, n, avg, best, gpa, cnt };
  }

  // ---------- storage ----------
  function normalize(src) {
    const out = {};
    IDS.forEach((id) => {
      const d = DEFAULT_GROUPS[id];
      const g = src && src[id];
      out[id] = g && Array.isArray(g.students)
        ? { ...d, ...g, students: g.students.map((s) => ({ name: s.name || "", note: s.note || "", k: CRITERIA.map((c, i) => Math.min(c.max, Math.max(0, Number(s.k?.[i]) || 0))) })) }
        : clone(d);
    });
    return out;
  }
  function readLocal() { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } }
  function writeLocal() { try { localStorage.setItem(LS, JSON.stringify(groups)); } catch {} }
  function setStatus(kind, text) { $("#dot").className = "dot " + kind; $("#stxt").textContent = text; }

  async function load() {
    if (!DB) { groups = normalize(readLocal()); setStatus("", "Жергілікті режим"); return; }
    try {
      const r = await fetch(DB + "/groups.json", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      groups = normalize(data);
      writeLocal();
      setStatus("on", "Онлайн · " + new Date().toLocaleTimeString("kk-KZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (e) {
      groups = normalize(readLocal());
      setStatus("err", "Байланыс жоқ");
    }
  }
  function save(id) {
    writeLocal();
    if (!DB) return;
    clearTimeout(saveTimers[id]);
    setStatus("", "Сақталуда…");
    saveTimers[id] = setTimeout(async () => {
      try {
        const g = groups[id];
        const r = await fetch(`${DB}/groups/${id}.json`, { method: "PUT", body: JSON.stringify({ title: g.title, color: g.color, students: g.students, updated: Date.now() }) });
        if (!r.ok) throw new Error(r.status);
        setStatus("on", "Сақталды ✓");
      } catch { setStatus("err", "Сақталмады — интернетті тексеріңіз"); toast("Сақталмады!"); }
    }, 500);
  }

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 1800); }

  // ---------- login ----------
  const SK = "bagalau_role_v1";
  const getRole = () => { try { return localStorage.getItem(SK); } catch { return null; } };
  const setRole = (r) => { try { r ? localStorage.setItem(SK, r) : localStorage.removeItem(SK); } catch {} };
  const roleName = (r) => (r === "teacher" ? "Мұғалім" : r ? `${IDS.indexOf(r) + 1}-топ` : "");
  async function sha(t) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  function renderLogin(pre) {
    $("#nav").innerHTML = "";
    const roles = [...IDS.map((id, i) => [id, `${i + 1}-топ`, DEFAULT_GROUPS[id].title.split(": ")[1] || "", DEFAULT_GROUPS[id].color]), ["teacher", "Мұғалім", "Барлық топтар", "#64748b"]];
    setStatus("", "Кіру қажет");
    let sel = roles.some((r) => r[0] === pre) ? pre : null;
    $("#app").innerHTML = `
    <div class="card pad" style="max-width:560px;margin:30px auto">
      <h1 style="margin-bottom:4px">Кіру</h1><div class="sub" style="margin-bottom:16px">Тобыңызды таңдап, мұғалім берген кодты енгізіңіз.</div>
      <div class="roles">${roles.map(([id, t, d, c]) => `<button class="role${sel === id ? " on" : ""}" data-role="${id}" style="--c:${c}"><b>${t}</b><span>${esc(d)}</span></button>`).join("")}</div>
      <form id="lf" style="display:flex;gap:8px;margin-top:14px">
        <input id="code" type="password" inputmode="numeric" autocomplete="off" placeholder="Код" class="codein">
        <button class="btn primary" type="submit">Кіру</button>
      </form>
      <div id="lerr" class="sub" style="color:var(--bad);margin-top:8px;min-height:18px"></div>
    </div>`;
    $("#app").onclick = (e) => {
      const b = e.target.closest("[data-role]"); if (!b) return;
      sel = b.dataset.role;
      document.querySelectorAll(".role").forEach((x) => x.classList.toggle("on", x === b));
      $("#code").focus();
    };
    $("#app").onchange = $("#app").oninput = null;
    $("#lf").onsubmit = async (e) => {
      e.preventDefault();
      if (!sel) { $("#lerr").textContent = "Алдымен топты таңдаңыз."; return; }
      const h = await sha("bagalau:" + $("#code").value.trim());
      if (h !== ACCESS[sel]) { $("#lerr").textContent = "Код қате. Қайта көріңіз."; return; }
      setRole(sel);
      location.hash = "#" + sel;
      onRoute();
    };
  }

  // ---------- nav ----------
  function renderNav() {
    const role = getRole();
    const items = role === "teacher" ? [["teacher", "Мұғалім (жалпы)"], ...IDS.map((id, i) => [id, `${i + 1}-топ`])] : [[role, roleName(role)]];
    $("#nav").innerHTML = items.map(([id, t]) => `<a href="#${id}" class="${route === id ? "on" : ""}">${t}</a>`).join("") +
      `<a href="#" id="logout" title="Шығу">Шығу ⎋</a>`;
    $("#logout").onclick = (e) => { e.preventDefault(); setRole(null); clearInterval(pollTimer); renderLogin(); };
  }
  const banner = () => DB ? "" : `<div class="banner">⚠ Онлайн база қосылмаған: бағалар тек осы құрылғыда сақталады. Мұғалім көруі үшін <b>config.js</b> ішіне Firebase сілтемесін қойыңыз.</div>`;

  // ---------- group page ----------
  function renderGroup(id) {
    const g = groups[id], sm = summary(g), num = IDS.indexOf(id) + 1;
    const opts = (max, v) => Array.from({ length: max + 1 }, (_, i) => `<option${i === v ? " selected" : ""}>${i}</option>`).join("");
    $("#app").innerHTML = `${banner()}
    <div class="head">
      <div class="badge" style="background:${g.color}">${num}</div>
      <div><h1>${esc(g.title)}</h1><div class="sub">Тақырыбы: <b>${esc(TOPIC)}</b> · Базалық 70 + 30 балл</div></div>
    </div>
    <div class="stats">
      <div class="card pad stat"><div class="lbl">Орташа балл</div><div class="val">${sm.avg.toFixed(1)} / 100</div><div class="hint">Орташа GPA: ${sm.gpa.toFixed(2)}</div></div>
      <div class="card pad stat"><div class="lbl">Ең жоғары балл</div><div class="val" style="color:var(--ok)">${sm.best ? sm.best.t : "—"} б.</div><div class="hint">${esc(sm.best?.name || "")}</div></div>
      <div class="card pad stat"><div class="lbl">Студент саны</div><div class="val">${sm.n}</div><div class="hint">Үлгерім: ${sm.n ? 100 : 0}%</div></div>
      <div class="card pad stat"><div class="lbl">Деңгейлер</div><div class="val" style="font-size:15px;display:flex;gap:6px;flex-wrap:wrap">
        <span class="pill p-ok">90–100: ${sm.cnt.ok}</span><span class="pill p-mid">75–89: ${sm.cnt.mid}</span><span class="pill p-low">70–74: ${sm.cnt.low}</span></div></div>
    </div>
    <div class="card">
      <div class="pad" style="padding-bottom:0"><h2>Студенттердің бағалау матрицасы</h2><div class="sub">Әр критерий бойынша балл таңдаңыз (базалық 70 балл автоматты түрде қосылады). Өзгерістер автоматты сақталады.</div>
      <div class="bar">
        <button class="btn primary" data-act="add">＋ Студент қосу</button>
        <button class="btn" data-act="csv">Excel CSV</button>
        <button class="btn" data-act="print">PDF / Баспа</button>
        <button class="btn danger" data-act="reset">Бастапқы күйге қайтару</button>
      </div></div>
      <div class="tbl"><table>
        <thead><tr><th>№</th><th class="name">Студенттің аты-жөні</th>
          ${CRITERIA.map((c, i) => `<th title="${esc(c.name)}">К${i + 1}<small>0–${c.max} б.</small></th>`).join("")}
          <th>Жалпы</th><th>Әріптік / GPA</th><th>Деңгейі</th><th></th></tr></thead>
        <tbody>${g.students.map((s, r) => {
          const t = total(s), sc = scale(t), lv = level(t);
          return `<tr data-row="${r}"><td>${r + 1}</td>
            <td class="name"><input data-f="name" value="${esc(s.name)}" placeholder="Аты-жөні"><input class="note" data-f="note" value="${esc(s.note)}" placeholder="Түсініктеме"></td>
            ${CRITERIA.map((c, i) => `<td><select data-k="${i}">${opts(c.max, s.k[i])}</select></td>`).join("")}
            <td class="total">${t}<div class="sub">/100</div></td><td><b>${sc.letter}</b><div class="sub">GPA ${sc.gpa.toFixed(2)}</div></td>
            <td><span class="pill ${lv[1]}">${lv[0]}</span></td>
            <td><button class="btn x" data-act="del" title="Өшіру">✕</button></td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>
    <h2 style="margin:22px 0 10px">7 бағалау критерийі</h2>
    <div class="crit">${CRITERIA.map((c, i) => `<div class="card"><b>${i + 1}. ${esc(c.name)} <span class="pill p-mid">0–${c.max} балл</span></b><span class="sub">${esc(c.desc)}</span></div>`).join("")}</div>
    <h2 style="margin:22px 0 10px">Әріптік баға және GPA шкаласы</h2>
    <div class="card pad sub">${SCALE.map((x, i) => `<b>${x.letter}</b>: ${x.min}–${i ? SCALE[i - 1].min - 1 : 100} балл (GPA ${x.gpa.toFixed(2)})`).join(" · ")}</div>`;

    const app = $("#app");
    app.onchange = (e) => {
      const tr = e.target.closest("tr[data-row]"); if (!tr) return;
      const st = g.students[+tr.dataset.row];
      if (e.target.dataset.k != null) { st.k[+e.target.dataset.k] = +e.target.value; save(id); renderGroup(id); }
    };
    app.oninput = (e) => {
      const tr = e.target.closest("tr[data-row]"); if (!tr || !e.target.dataset.f) return;
      g.students[+tr.dataset.row][e.target.dataset.f] = e.target.value; save(id);
    };
    app.onclick = (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
      if (act === "add") { g.students.push({ name: "Жаңа студент", note: "", k: CRITERIA.map(() => 0) }); save(id); renderGroup(id); }
      if (act === "del") { const r = +e.target.closest("tr").dataset.row; if (confirm(`«${g.students[r].name}» өшірілсін бе?`)) { g.students.splice(r, 1); save(id); renderGroup(id); } }
      if (act === "reset") { if (confirm("Барлық бағаларды бастапқы күйге қайтару керек пе?")) { groups[id] = clone(DEFAULT_GROUPS[id]); save(id); renderGroup(id); } }
      if (act === "csv") csv([id]);
      if (act === "print") print();
    };
  }

  // ---------- teacher page ----------
  function renderTeacher() {
    const sums = IDS.map((id, i) => ({ id, num: i + 1, g: groups[id], sm: summary(groups[id]) }));
    const ranked = [...sums].sort((a, b) => b.sm.avg - a.sm.avg);
    const all = sums.flatMap((x) => x.sm.list.map((s) => ({ ...s, num: x.num, color: x.g.color })));
    const allAvg = all.length ? all.reduce((a, s) => a + s.t, 0) / all.length : 0;
    const medals = ["🥇", "🥈", "🥉"];
    const base = location.href.split("#")[0];
    $("#app").innerHTML = `${banner()}
    <div class="head"><div><h1>Барлық топтардың бағалары</h1><div class="sub">Тақырыбы: <b>${esc(TOPIC)}</b> · ${DB ? "мәліметтер әр 10 секунд сайын жаңарады" : "жергілікті режим"}</div></div>
      <div class="bar" style="margin-left:auto"><button class="btn" data-act="refresh">⟳ Жаңарту</button><button class="btn" data-act="csv">Excel CSV (барлығы)</button><button class="btn" data-act="print">PDF / Баспа</button></div></div>
    <div class="stats">
      <div class="card pad stat"><div class="lbl">Барлық студент</div><div class="val">${all.length}</div><div class="hint">3 топ</div></div>
      <div class="card pad stat"><div class="lbl">Жалпы орташа</div><div class="val">${allAvg.toFixed(1)}</div><div class="hint">100 баллдан</div></div>
      <div class="card pad stat"><div class="lbl">Үздік топ</div><div class="val" style="font-size:18px">${esc(ranked[0].g.title)}</div><div class="hint">орташа ${ranked[0].sm.avg.toFixed(1)}</div></div>
      <div class="card pad stat"><div class="lbl">100 балл алғандар</div><div class="val" style="color:var(--ok)">${all.filter((s) => s.t === 100).length}</div><div class="hint">${esc(all.filter((s) => s.t === 100).map((s) => s.name).join(", "))}</div></div>
    </div>
    <h2 style="margin-bottom:10px">Топтар рейтингі</h2>
    <div class="rank">${ranked.map((x, i) => `<div class="card"><span class="medal">${medals[i]}</span><div><b>${esc(x.g.title)}</b><div class="sub">${x.sm.n} студент · GPA ${x.sm.gpa.toFixed(2)}</div></div><div class="big" style="margin-left:auto;color:${x.g.color}">${x.sm.avg.toFixed(1)}</div></div>`).join("")}</div>
    <div class="groups">${sums.map((x) => `<div class="card pad gcard" style="--c:${x.g.color}">
        <div style="display:flex;gap:10px;align-items:center"><div class="badge" style="background:${x.g.color};width:38px;height:38px;font-size:18px">${x.num}</div>
          <div><b>${esc(x.g.title)}</b><div class="sub">Орташа ${x.sm.avg.toFixed(1)} · Ең жоғары ${x.sm.best ? x.sm.best.t : "—"}</div></div>
          <a class="btn x" style="margin-left:auto;text-decoration:none" href="#${x.id}">Ашу →</a></div>
        <ol>${[...x.sm.list].sort((a, b) => b.t - a.t).map((s) => `<li><span class="n">${esc(s.name)}</span><b>${scale(s.t).letter}</b><span class="sc">${s.t}</span></li>`).join("")}</ol>
      </div>`).join("")}</div>
    <h2 style="margin:22px 0 10px">Толық кесте (барлық топ)</h2>
    <div class="card tbl"><table>
      <thead><tr><th>№</th><th>Топ</th><th class="name">Студент</th>${CRITERIA.map((c, i) => `<th title="${esc(c.name)}">К${i + 1}<small>0–${c.max}</small></th>`).join("")}<th>Жалпы</th><th>Баға</th><th>Деңгейі</th></tr></thead>
      <tbody>${[...all].sort((a, b) => b.t - a.t).map((s, i) => { const lv = level(s.t); return `<tr><td>${i + 1}</td><td><span class="pill" style="background:${s.color};color:#fff">${s.num}-топ</span></td><td class="name"><b>${esc(s.name)}</b><div class="sub">${esc(s.note)}</div></td>${s.k.map((v) => `<td>${v}</td>`).join("")}<td class="total">${s.t}</td><td><b>${scale(s.t).letter}</b></td><td><span class="pill ${lv[1]}">${lv[0]}</span></td></tr>`; }).join("")}</tbody>
    </table></div>
    <h2 style="margin:22px 0 10px">Топтарға арналған сілтемелер</h2>
    <div class="links">${IDS.map((id, i) => `<div class="card"><b>${i + 1}-топ</b><br><a href="#${id}">${esc(base)}#${id}</a></div>`).join("")}</div>`;
    $("#app").onchange = $("#app").oninput = null;
    $("#app").onclick = async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "refresh") { await load(); render(); toast("Жаңартылды"); }
      if (act === "csv") csv(IDS);
      if (act === "print") print();
    };
  }

  // ---------- CSV ----------
  function csv(ids) {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Топ", "Студент", ...CRITERIA.map((_, i) => "К" + (i + 1)), "Жалпы", "Баға", "GPA", "Түсініктеме"]];
    ids.forEach((id) => groups[id].students.forEach((s) => { const t = total(s), sc = scale(t); rows.push([groups[id].title, s.name, ...s.k, t, sc.letter, sc.gpa.toFixed(2), s.note]); }));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bagalau_${ids.length > 1 ? "barlygy" : ids[0]}.csv`; a.click();
  }

  // ---------- router ----------
  function render() {
    renderNav();
    if (IDS.includes(route)) renderGroup(route); else renderTeacher();
    document.title = IDS.includes(route) ? groups[route].title + " · Бағалау" : "Бағалау · Мұғалім";
  }
  async function onRoute() {
    const want = (location.hash || "").slice(1);
    const role = getRole();
    if (!role || !ACCESS[role]) { clearInterval(pollTimer); renderLogin(want); return; }
    // топ мүшесі тек өз тобын көреді
    route = role === "teacher" ? (IDS.includes(want) ? want : "teacher") : role;
    if (want !== route) history.replaceState(null, "", "#" + route);
    await load(); render(); window.scrollTo(0, 0);
    clearInterval(pollTimer);
    if (DB && route === "teacher") pollTimer = setInterval(async () => { await load(); render(); }, 10000);
  }
  window.addEventListener("hashchange", onRoute);
  onRoute();
})();
