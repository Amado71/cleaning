/* ============================================================
   app.js — вся логика: рендер, маршрут, сохранение, PWA
   ============================================================ */

var LANG = "ru", cur = 0;
var KEY = "clean_v3";
var WALK = 1, LIM = 150, KT = 780, LS = 720, RE = 765;

var st = {
  v:3, c:{}, r:{}, t:"12:00", sp:1, dr:{}, h:{},
  all:"", dl:{}, fr:{}, pd:{}, fs:"", lang:"ru"
};

function L(k, vars){
  var s = (T[LANG] && T[LANG][k]);
  if (s == null) s = (T.ru[k] != null ? T.ru[k] : k);
  if (vars) Object.keys(vars).forEach(function(v){
    s = s.split("{"+v+"}").join(vars[v]);
  });
  return s;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} }
function load(){
  try{
    var raw = localStorage.getItem(KEY) || localStorage.getItem("plan_v2");
    if(!raw) return;
    var x = JSON.parse(raw);
    if(!x) return;
    ["c","r","dr","h","dl","fr","pd"].forEach(function(k){ if(x[k]) st[k] = x[k]; });
    if(x.t) st.t = x.t;
    if(x.sp) st.sp = x.sp;
    if(x.all) st.all = x.all;
    if(x.fs) st.fs = x.fs;
    if(x.lang && T[x.lang]) { LANG = x.lang; st.lang = x.lang; }
  }catch(e){}
}

function today(){ var d = new Date().getDay(); return d>=1&&d<=5 ? d-1 : 0; }
function dk(d){
  var n = new Date(), w = (n.getDay()+6)%7;
  var x = new Date(n.getFullYear(), n.getMonth(), n.getDate()-w+d);
  return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2)+"-"+("0"+x.getDate()).slice(-2);
}
function roomsForDay(d){ return (st.r[d]||"").split(/[,;\s]+/).filter(Boolean); }
function tm(m){
  m = Math.round(m);
  var h = Math.floor(m/60)%24, x = m%60;
  return (h<10?"0":"")+h+":"+(x<10?"0":"")+x;
}
function dur(m){
  m = Math.round(m);
  return m>=60 ? Math.floor(m/60)+" "+L("h")+" "+(m%60)+" "+L("m") : m+" "+L("m");
}
function t0(){ var p = (st.t||"12:00").split(":"); return (+p[0]||0)*60+(+p[1]||0); }

function orderOf(k){
  if(/trash/.test(k)) return 0;
  if(/walls|rails/.test(k)) return 1;
  if(/doors|switches/.test(k)) return 2;
  if(/windowsills|surfaces/.test(k)) return 3;
  if(/shelves|benches|furniture|seats|chairs_s/.test(k)) return 4;
  if(/sanitary|supplies|computers|tv|equipment/.test(k)) return 5;
  if(/vac|mats|skirting|drain|shower_heads/.test(k)) return 7;
  if(/floor_m|floor_brush/.test(k)) return 8;
  if(/floor/.test(k)) return 9;
  return 5;
}
function ragOf(k){
  if(/trash|doors|windowsills|surfaces|cabinets|tables|tabletops|chairs|walls|glass|tv|computers|seats|furniture|equipment|shelves|benches|machines|cabinet_doors|skirting/.test(k)) return "b";
  if(/floor|vac|mats|floor_under|beds/.test(k) && !/sanitary|supplies|shower_heads|bath|drain/.test(k)) return "b";
  if(/sanitary|supplies|shower_heads|bath|drain|glass/.test(k)) return "r";
  if(/kitchen|tabletops/.test(k)) return "g";
  return "b";
}

function stops(d){
  var out = [], key = dk(d);
  ROUTE.forEach(function(rid){
    if(rid === "rooms"){ addRooms(out, d, key); return; }
    var room = ROOMS.filter(function(r){ return r.id === rid; })[0];
    if(!room) return;
    if(rid === "balcony"){
      var mo = new Date(key).getMonth();
      if(mo < 4 || mo > 8) return;
    }
    var tasks = [];
    room.t.forEach(function(t){
      if(t[1][d] !== "1") return;
      tasks.push({ k: t[0], m: t[2], rag: ragOf(t[0]) });
    });
    PERIODS.forEach(function(p, pi){
      if(p.rid === rid && perDue(p, d)){
        tasks.push({ k: p.k, m: p.m, per: pi, rag: ragOf(p.k) });
      }
    });
    if(!tasks.length) return;
    if(rid === "recreation" && st.h[key]){
      tasks.unshift({ k:"t_flooded", m:10, first:1, rag:"b" });
    }
    if(rid === "dining"){
      var re = /floor|vac|skirting|floor_m/;
      var a1 = tasks.filter(function(t){ return !re.test(t.k); });
      var a2 = tasks.filter(function(t){ return re.test(t.k); });
      if(a1.length) out.push(sum({ name:L("r_dining_main"), id:"dining_main", c:room.c, tasks:a1 }));
      if(a2.length) out.push(sum({ name:L("r_dining_floor"), id:"dining_floor", c:room.c, tasks:a2 }));
      return;
    }
    out.push(sum({ name:L(room.n), id:rid, c:room.c, tasks:tasks }));
  });
  return out;
}

function addRooms(out, d, key){
  var rs = roomsForDay(d);
  if(!rs.length){
    out.push({ name:L("r_rooms_all"), id:"rooms", c:"#3949ab", emp:1, tasks:[], min:0 });
    return;
  }
  rs.forEach(function(n){
    var tasks = [];
    ROOM_BASIC.forEach(function(t){ tasks.push({ k:t[0], m:t[1], rag:"b" }); });
    ROOM_BATH.forEach(function(t){ tasks.push({ k:t[0], m:t[1], rag:t[2].rag }); });
    var drLast = st.dr[n];
    var drDue = !drLast || drLast === key || (new Date(key) - new Date(drLast))/864e5 >= 28;
    if(drDue){
      tasks.push({ k:"t_drain", m:8, rag:"r", type:"dr", room:n });
      tasks.push({ k:"t_bath_skirt", m:2, rag:"r" });
      tasks.push({ k:"t_bath_brush", m:5, rag:"r" });
      tasks.push({ k:"t_bath_finish", m:2, rag:"r" });
    }
    var dlLast = st.dl[n];
    if(!dlLast || dlLast === key || (new Date(key) - new Date(dlLast))/864e5 >= 88){
      tasks.push({ k:"t_shower_heads", m:3, rag:"r", type:"dl", room:n });
    }
    var frLast = st.fr[n];
    if(!frLast || frLast === key || (new Date(key) - new Date(frLast))/864e5 >= 88){
      tasks.push({ k:"t_beds", m:6, rag:"b", type:"fr", room:n });
    }
    out.push(sum({ name:L("r_room")+" "+n, id:"room_"+n, c:"#3949ab", tasks:tasks, room:n }));
  });
}

function perDue(p, d){
  if(!st.fs) st.fs = dk(0);
  if(p.wd !== d) return false;
  var last = st.pd[p.id], key = dk(d);
  if(!last) return (new Date(key) - new Date(st.fs))/864e5 >= (PERIODS.indexOf(p)%4)*7;
  return last === key || (new Date(key) - new Date(last))/864e5 >= p.days-2;
}

function sum(s){
  s.min = s.tasks.reduce(function(m, t){ return m + t.m; }, 0);
  return s;
}

function tools(all){
  var joined = all.map(function(s){ return s.tasks.map(function(t){ return t.k; }).join("|"); }).join("|");
  var a = [L("tool_mop")];
  if(/vac|floor_under/.test(joined)) a.push(L("tool_vac"));
  if(/floor_m/.test(joined)) a.push(L("tool_mach"));
  if(/floor_brush/.test(joined)) a.push(L("tool_brush"));
  if(/bath_finish/.test(joined)) a.push(L("tool_lasta"));
  return a.join(", ");
}
function prepStop(all){
  var joined = all.map(function(s){ return s.tasks.map(function(t){ return t.k; }).join("|"); }).join("|");
  var ts = [
    [L("prep1"), 2], [L("prep2"), 1], [L("prep3"), 1],
    [L("prep4"), 2], [L("prep5"), 3],
    [L("prep6", {list: tools(all)}), 1]
  ];
  if(/supplies/.test(joined)) ts.push([L("prep7"), 1]);
  return sum({ name:L("prepCart"), id:"prep", c:"#6b7a70", noRag:1, tasks: ts.map(function(t, i){ return { k:t[0], m:t[1], i:i, rag:"b" }; }) });
}
function endStop(){
  var ts = [
    [L("end1"), 3], [L("end2"), 3],
    [L("end3"), 3], [L("end4"), 2], [L("end5"), 1]
  ];
  return sum({ name:L("endStop"), id:"end", c:"#6b7a70", noRag:1, tasks: ts.map(function(t, i){ return { k:t[0], m:t[1], i:i, rag:"b" }; }) });
}

function build(all, start){
  var seq = [], t = start;
  var rooms = all.filter(function(s){ return s.room; });
  var emp = all.filter(function(s){ return s.emp; })[0];
  var kit = all.filter(function(s){ return s.id === "kitchen"; })[0];
  var wc = all.filter(function(s){ return s.id === "wc_staff"; })[0];
  var dMain = all.filter(function(s){ return s.id === "dining_main"; })[0];
  var dFloor = all.filter(function(s){ return s.id === "dining_floor"; })[0];
  var rec = all.filter(function(s){ return s.id === "recreation"; })[0];
  var others = all.filter(function(s){
    return s !== kit && s !== wc && s !== dMain && s !== dFloor && s !== rec && !s.emp && !s.room;
  });
  others.forEach(function(s){ s.ms = 0; });

  var prep = prepStop(all); prep.start = t; seq.push(prep); t += prep.min + WALK;
  if(emp) emp.start = t, seq.push(emp);

  function gapAt(to){ if(to > t){ seq.push({ gap:1, msg:L("gapUntil"), min:to-t, start:t, tasks:[] }); t = to; } }

  var guard = 0;
  while(guard++ < 200){
    var pick = null, i, nm = 1e9;
    if(t >= LS){
      for(i = 0; i < rooms.length; i++) if(t + rooms[i].min + WALK <= RE){ pick = rooms.splice(i, 1)[0]; break; }
    }
    if(!pick){
      for(i = 0; i < others.length; i++) if(others[i].ms <= t && t + others[i].min + WALK <= KT){ pick = others.splice(i, 1)[0]; break; }
    }
    if(!pick){
      if(t < LS && rooms.length) nm = LS;
      others.forEach(function(s){ if(s.ms > t && s.ms < KT && s.ms < nm) nm = s.ms; });
      if(t < RE && rooms.length && nm > RE) nm = RE;
      if(nm < 1e9){ gapAt(nm); continue; }
    }
    if(!pick) break;
    pick.start = t; seq.push(pick); t += pick.min + WALK;
  }

  if(rec){ rec.start = t; seq.push(rec); t += rec.min + WALK; }
  if(kit){
    if(t < KT) gapAt(KT);
    if(t > KT) kit.late = t - KT;
    kit.start = t; seq.push(kit); t += kit.min + WALK;
  }
  if(dMain){ dMain.start = t; seq.push(dMain); t += dMain.min + WALK; }
  if(dFloor){ dFloor.start = t; seq.push(dFloor); t += dFloor.min + WALK; }
  others.forEach(function(s){ s.start = t; seq.push(s); t += s.min + WALK; });
  rooms.forEach(function(s){ s.after = 1; s.start = t; seq.push(s); t += s.min + WALK; });
  if(wc){ wc.start = t; seq.push(wc); t += wc.min + WALK; }
  var end = endStop(); end.start = t; seq.push(end); t += end.min;

  return { seq: seq, end: t };
}

function plan(d){
  var b = build(stops(d), t0());
  b.over = Math.max(0, b.end - (t0() + LIM));
  return b;
}

function dayHTML(d, pr){
  var P = plan(d), S = P.seq;
  var tot = 0, dn = 0, rem = 0, isCur = -1, h = "", num = 0;
  var key = dk(d);

  S.forEach(function(s, si){
    if(s.gap || !s.tasks) return;
    s.k = s.tasks.map(function(t){
      return pr ? 0 : (st.c[key + "_" + s.id + "_" + (t.i != null ? t.i : t.k)] ? 1 : 0);
    });
    s.left = s.k.filter(function(x){ return !x; }).length;
    if(isCur < 0 && s.left && !s.emp && !pr) isCur = si;
  });

  S.forEach(function(s, si){
    if(s.gap){
      h += '<div class="emp">' + tm(s.start) + ' · ' + s.min + ' ' + L("m") + ' ' + s.msg + '.</div>';
      return;
    }
    num++;
    var rows;
    if(s.emp){
      rows = '<div class="emp">' + L("roomsEmpty") + '</div>';
    } else {
      rows = s.tasks.map(function(t, i){
        var k = t.i != null ? t.i : t.k;
        var checked = s.k && s.k[i];
        var extra = "";
        if(t.type) extra += ' data-type="' + t.type + '"';
        if(t.room) extra += ' data-room="' + t.room + '"';
        if(t.per != null) extra += ' data-per="' + PERIODS[t.per].id + '" data-type="per"';
        return '<label class="t' + (checked ? ' done' : '') + '">' +
          '<input type="checkbox" data-day="' + key + '" data-stop="' + s.id + '" data-i="' + k + '"' + extra + (checked ? ' checked' : '') + '>' +
          '<span>' + (t.rag === "r" ? '<i class="dot" style="background:var(--red);display:inline-block;width:10px;height:10px;margin-right:6px"></i>' : '') +
          L(t.k) + '<em>≈' + t.m + ' ' + L("m") + '</em></span></label>';
      }).join("");
    }
    var fin = !pr && s.tasks && s.tasks.length && !s.left;
    var tag = "";
    if(!s.noRag && !s.emp){
      if(s.room) tag = L("ragRoom");
      else if(s.tasks.some(function(t){ return t.rag === "r"; })) tag = L("ragLabel") + " " + L("ragBlue") + ", " + L("ragRed");
      else if(s.tasks.some(function(t){ return t.rag === "g"; })) tag = L("ragLabel") + " " + L("ragGreen");
      else tag = L("ragLabel") + " " + L("ragBlue");
    }
    if(s.after) tag += (tag ? " · " : "") + L("residentsKnock");
    h += '<section class="card' + (fin ? ' fin' : '') + (si === isCur ? ' cur' : '') + '" style="--sc:' + s.c + '">' +
      '<h2><b class="n">' + num + '</b><span class="nm">' + s.name + '</span><span class="tm">' + tm(s.start) + '</span></h2>' +
      '<div class="rg"><i class="dot"></i>' + (tag ? tag + ' · ' : '') + '≈' + s.min + ' ' + L("m") + '</div>' + rows + '</section>';
  });

  var pct = tot ? Math.round(dn / tot * 100) : 0;
  var done = 0, allCount = 0;
  S.forEach(function(s){
    if(!s.tasks) return;
    s.tasks.forEach(function(t){
      allCount++;
      var k = t.i != null ? t.i : t.k;
      if(st.c[key + "_" + s.id + "_" + k]) done++;
    });
  });
  var remMin = S.reduce(function(acc, s){
    if(!s.tasks) return acc;
    return acc + s.tasks.reduce(function(a, t){
      var k = t.i != null ? t.i : t.k;
      return a + (st.c[key + "_" + s.id + "_" + k] ? 0 : t.m);
    }, 0);
  }, 0);

  var lim = t0() + LIM;
  var ov = P.over ? '<div class="warn" style="margin:6px 0 0">' + L("overLimit", {t: dur(P.end - t0()), n: P.over}) + '</div>' : '';
  var dl = S.filter(function(s){ return s.room && s.tasks && s.tasks.some(function(t){ return t.type === "dr"; }); }).map(function(s){ return s.room; });
  var drb = dl.length ? '<div class="dr">' + L("drainsToday", {list: dl.join(", ")}) + '</div>' : '';

  var hd = '<div class="hd">' + drb + (
    pr
      ? '<b style="font-size:18px">' + L("dayL")[d] + '</b> · ' + L("start") + ' ' + tm(t0()) + ' · ' + L("endAt") + ' ' + tm(P.end) + (roomsForDay(d).length ? ' · ' + L("rooms") + ': ' + roomsForDay(d).join(", ") : '')
      : '<div class="row"><label>' + L("start") + '</label><select id="t0"><option value="11:00"' + (st.t === "11:00" ? ' selected' : '') + '>11:00</option><option value="12:00"' + (st.t === "12:00" ? ' selected' : '') + '>12:00</option></select>' +
        '<label>' + L("speed") + '</label><select id="sp"><option value="0.8"' + (st.sp == 0.8 ? ' selected' : '') + '>' + L("fast") + '</option><option value="1"' + (st.sp == 1 ? ' selected' : '') + '>' + L("normal") + '</option><option value="1.25"' + (st.sp == 1.25 ? ' selected' : '') + '>' + L("slow") + '</option></select></div>' +
        '<div class="row"><label><input type="checkbox" id="hv"' + (st.h[key] ? ' checked' : '') + '> ' + L("flooded") + '</label></div>' +
        '<div class="row"><label>' + L("rooms") + '</label><input class="rm" id="rm" value="' + (st.r[d] || "") + '" placeholder="' + L("roomsPH") + '" autocomplete="off"></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="st">' + L("dayL")[d] + ' · ' + L("done") + ' ' + done + ' ' + L("of") + ' ' + allCount + ' · ' + L("remain") + ' ≈ ' + dur(remMin) + ' · ' + L("endAt") + ' ' + tm(P.end) + ' (' + L("limit") + ' ' + tm(lim) + ')' + (d === today() ? ' · ' + L("today") : '') + '</div>' + ov
  ) + '</div>';
  return hd + h;
}

function render(scroll){
  document.getElementById("h1").textContent = L("title");
  document.getElementById("sAllRooms").textContent = L("allRooms");
  document.getElementById("allRoomsDesc").textContent = L("allRoomsDesc");
  document.getElementById("spl").textContent = L("distribute");
  document.getElementById("sBackup").textContent = L("backup");
  document.getElementById("backupDesc").textContent = L("backupDesc");
  document.getElementById("bcp").textContent = L("copy");
  document.getElementById("bld").textContent = L("load");
  document.getElementById("sRags").textContent = L("rags");
  document.getElementById("ragsBody").innerHTML =
    '<div class="rag"><span class="dot" style="background:var(--red)"></span><div>' + L("ragRedDesc") + '</div></div>' +
    '<div class="rag"><span class="dot" style="background:var(--blue)"></span><div>' + L("ragBlueDesc") + '</div></div>' +
    '<div class="rag"><span class="dot" style="background:var(--green)"></span><div>' + L("ragGreenDesc") + '</div></div>' +
    '<p style="margin:8px 0 0">' + L("ragsFooter") + '</p>';
  document.getElementById("note").innerHTML = L("note");
  document.getElementById("pd").textContent = L("printDay");
  document.getElementById("pw").textContent = L("printWeek");
  document.getElementById("reset").textContent = L("resetDay");
  document.title = L("title");

  var tb = document.getElementById("tabs"), t = today();
  tb.innerHTML = "";
  T[LANG].dayS.concat([L("monthTab")]).forEach(function(n, i){
    var b = document.createElement("button");
    b.textContent = n;
    var cls = "";
    if(i === cur) cls += " on";
    if(i === t && i !== cur) cls += " td";
    if(i === t && i === cur) cls = "on td";
    b.className = cls;
    b.onclick = function(){ cur = i; render(); };
    tb.appendChild(b);
  });

  var listEl = document.getElementById("list");
  if(cur < 5){
    var allStr = st.all || "";
    var missing = [];
    if(allStr){
      var allNums = [];
      allStr.split(/[,;\s]+/).filter(Boolean).forEach(function(x){
        var m = /^(\d+)-(\d+)$/.exec(x);
        if(m && +m[2] >= +m[1] && +m[2] - +m[1] < 200){
          for(var q = +m[1]; q <= +m[2]; q++) allNums.push(""+q);
        } else allNums.push(x);
      });
      var daySet = {};
      for(var dd = 0; dd < 5; dd++) roomsForDay(dd).forEach(function(n){ daySet[n] = 1; });
      allNums.forEach(function(n){ if(!daySet[n]) missing.push(n); });
    }
    var warnHtml = missing.length
      ? '<div class="warn">' + L("missingRooms", {list: missing.join(", ")}) +
        ' <button id="addMissing" style="margin-left:8px;padding:4px 8px;border:1px solid var(--bd);border-radius:6px;background:var(--card);color:var(--tx);font:inherit;cursor:pointer">' + L("addMissing") + '</button></div>'
      : '';
    listEl.innerHTML = warnHtml + dayHTML(cur, 0);

    var ti = document.getElementById("t0");
    if(ti) ti.onchange = function(){ st.t = ti.value; save(); render(); };
    var si = document.getElementById("sp");
    if(si) si.onchange = function(){ st.sp = +si.value; save(); render(); };
    var hv = document.getElementById("hv");
    if(hv) hv.onchange = function(){ if(hv.checked) st.h[dk(cur)] = 1; else delete st.h[dk(cur)]; save(); render(); };
    var ri = document.getElementById("rm");
    if(ri) ri.oninput = function(){ st.r[cur] = ri.value; save(); };
    var am = document.getElementById("addMissing");
    if(am) am.onclick = function(){
      var daySet = {};
      for(var dd = 0; dd < 5; dd++) roomsForDay(dd).forEach(function(n){ daySet[n] = 1; });
      var add = missing.filter(function(n){ return !daySet[n]; });
      var idx = 0;
      add.forEach(function(n){
        for(var tr = 0; tr < 5; tr++){
          var d2 = (idx + tr) % 5;
          var cur2 = roomsForDay(d2);
          cur2.push(n);
          st.r[d2] = cur2.join(", ");
          break;
        }
        idx++;
      });
      save(); render();
    };

    listEl.querySelectorAll(".t input").forEach(function(inp){
      inp.onchange = function(){
        var day = inp.dataset.day, stop = inp.dataset.stop, i = inp.dataset.i;
        var type = inp.dataset.type, room = inp.dataset.room, per = inp.dataset.per;
        var ck = day + "_" + stop + "_" + i;
        if(inp.checked){
          st.c[ck] = 1;
          if(type === "dr" && room) st.dr[room] = day;
          if(type === "dl" && room) st.dl[room] = day;
          if(type === "fr" && room) st.fr[room] = day;
          if(type === "per" && per) st.pd[per] = day;
        } else {
          delete st.c[ck];
          if(type === "dr" && room && st.dr[room] === day) delete st.dr[room];
          if(type === "dl" && room && st.dl[room] === day) delete st.dl[room];
          if(type === "fr" && room && st.fr[room] === day) delete st.fr[room];
          if(type === "per" && per && st.pd[per] === day) delete st.pd[per];
        }
        save(); render();
      };
    });
  } else {
    listEl.innerHTML = '<div class="card" style="--sc:#888"><h2><span class="nm">' + L("monthly") + '</span></h2>' +
      MONTHLY.map(function(m){
        return '<div class="t"><span>' + L(m[0]) + '<em>' + L(m[1]) + '</em></span></div>';
      }).join("") + '</div>';
  }
}

function init(){
  load();
  if(!st.fs){ st.fs = dk(0); save(); }
  cur = today();
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
  var cutKey = cutoff.getFullYear()+"-"+("0"+(cutoff.getMonth()+1)).slice(-2)+"-"+("0"+cutoff.getDate()).slice(-2);
  Object.keys(st.c).forEach(function(k){
    var p = k.split("_");
    if(p[0] < cutKey) delete st.c[k];
  });

  document.getElementById("lang").value = LANG;
  document.getElementById("lang").onchange = function(e){
    LANG = e.target.value; st.lang = LANG; save(); render();
  };
  document.getElementById("reset").onclick = function(){
    var key = dk(cur);
    Object.keys(st.c).forEach(function(k){ if(k.indexOf(key + "_") === 0) delete st.c[k]; });
    save(); render();
  };
  document.getElementById("pd").onclick = function(){
    if(cur > 4) cur = today();
    render();
    document.body.classList.add("pa");
    var pa = document.getElementById("pa");
    pa.innerHTML = '<div class="pd">' + dayHTML(cur, 1) + '</div>';
    setTimeout(function(){ window.print(); }, 50);
  };
  document.getElementById("pw").onclick = function(){
    var h = "";
    for(var d = 0; d < 5; d++) h += '<div class="pd">' + dayHTML(d, 1) + '</div>';
    document.getElementById("pa").innerHTML = h;
    document.body.classList.add("pa");
    setTimeout(function(){ window.print(); }, 50);
  };
  window.onafterprint = function(){
    document.body.classList.remove("pa");
    document.getElementById("pa").innerHTML = "";
  };

  var ar = document.getElementById("allr");
  ar.value = st.all || "";
  document.getElementById("spl").onclick = function(){
    st.all = ar.value;
    var L2 = [];
    ar.value.split(/[,;\s]+/).filter(Boolean).forEach(function(x){
      var m = /^(\d+)-(\d+)$/.exec(x);
      if(m && +m[2] >= +m[1] && +m[2] - +m[1] < 200){
        for(var q = +m[1]; q <= +m[2]; q++) L2.push(""+q);
      } else L2.push(x);
    });
    var n = L2.length, b = Math.floor(n/5), e = n%5, k = 0;
    for(var d = 0; d < 5; d++){
      var c = b + (d < e ? 1 : 0);
      st.r[d] = L2.slice(k, k+c).join(", ");
      k += c;
    }
    save(); render();
  };
  document.getElementById("bcp").onclick = function(){
    var bk = document.getElementById("bk");
    bk.value = JSON.stringify(st);
    bk.select();
    try{ navigator.clipboard.writeText(bk.value); }catch(e){}
  };
  document.getElementById("bld").onclick = function(){
    try{
      var x = JSON.parse(document.getElementById("bk").value);
      Object.keys(x).forEach(function(k){ st[k] = x[k]; });
      save(); render();
    }catch(e){ alert(L("loadFail")); }
  };

  render();
}

if("serviceWorker" in navigator && location.protocol.indexOf("http") === 0){
  navigator.serviceWorker.register("sw.js").catch(function(){});
}

document.addEventListener("DOMContentLoaded", init);
