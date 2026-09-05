
const ALBUMS = window.ALBUM_CATALOG || [];
const HEADPHONES = window.HEADPHONES || [];
const CONFIG = window.APP_CONFIG || {};

const state = {
  view: "discover",
  currentAlbum: null,
  mode: null,
  sessionSkips: new Set(),
  listens: {},
  covers: JSON.parse(localStorage.getItem("ao_covers") || "{}"),
  spoilers: JSON.parse(localStorage.getItem("ao_spoilers") || "false"),
  libraryFilter: "all",
  supabase: null,
  user: null,
  syncMode: "local"
};

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const hpById = id => HEADPHONES.find(h=>h.id===id);
const albumById = id => ALBUMS.find(a=>a.id===id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const random = arr => arr[Math.floor(Math.random()*arr.length)];

function loadLocal(){
  try { state.listens = JSON.parse(localStorage.getItem("ao_listens") || "{}"); }
  catch { state.listens = {}; }
}
function saveLocal(){
  localStorage.setItem("ao_listens", JSON.stringify(state.listens));
  updateProgress();
}
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),2200);
}
function updateProgress(){
  const n=Object.keys(state.listens).length;
  const el=$("#progressMini"); if(el) el.textContent=`${n} / ${ALBUMS.length} ouvidos`;
}
function isListened(id){ return !!state.listens[id]; }
function remainingAlbums(){
  return ALBUMS.filter(a=>!isListened(a.id) && !state.sessionSkips.has(a.id));
}

function weightedPick(items, weightFn){
  if(!items.length) return null;
  const weights=items.map(x=>Math.max(0.01,weightFn(x)));
  const sum=weights.reduce((a,b)=>a+b,0);
  let r=Math.random()*sum;
  for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i]; }
  return items.at(-1);
}

function pickAlbum(mode, opt={}){
  let pool=remainingAlbums();
  if(!pool.length && state.sessionSkips.size){
    state.sessionSkips.clear(); pool=remainingAlbums();
  }
  if(!pool.length) return null;

  switch(mode){
    case "heavy":
      pool=pool.filter(a=>a.intensity>=8 || a.tags.includes("heavy") || a.tags.includes("aggressive"));
      return weightedPick(pool,a=>1+a.intensity/3);
    case "feel":
      pool=pool.filter(a=>a.tags.some(t=>["emotional","melodic","dark","dramatic","bittersweet"].includes(t)));
      return weightedPick(pool,a=>1+(10-a.distance)/5+(a.tags.includes("emotional")?2:0));
    case "guitar":
      pool=pool.filter(a=>a.tags.some(t=>["guitar","technical","virtuosic"].includes(t)) || a.genres.some(g=>["thrash metal","heavy metal","hard rock"].includes(g)));
      return weightedPick(pool,a=>1+(a.tags.includes("guitar")?3:0)+(a.tags.includes("technical")?1:0));
    case "atmosphere":
      pool=pool.filter(a=>a.tags.some(t=>["atmospheric","cinematic","dark","shoegaze"].includes(t)));
      return weightedPick(pool,a=>1+(a.tags.includes("atmospheric")?3:0));
    case "classic":
      pool=pool.filter(a=>a.classic);
      return weightedPick(pool,a=>1+(a.year<2000?1.5:0)+(a.tags.includes("classic")?2:0));
    case "scene":
      pool=pool.filter(a=>a.year>=2000 && a.year<=2014 && (a.tags.includes("scene") || a.genres.some(g=>["post-hardcore","emo","metalcore","pop punk"].includes(g))));
      return weightedPick(pool,a=>1+(a.tags.includes("scene")?3:0));
    case "outside":
      pool=pool.filter(a=>a.distance>=5);
      return weightedPick(pool,a=>1+a.distance/2);
    case "headphone":
      pool=pool.filter(a=>a.bestHeadphone===opt.headphone);
      return weightedPick(pool,a=>1+(10-a.distance)/4+a.accessibility/8);
    case "surprise":
    default:
      // Slightly favors plausible discoveries while preserving real wildcards.
      return weightedPick(pool,a=>1.2 + (10-a.distance)*0.08 + (a.classic?.25:0) + Math.random()*1.4);
  }
}

function spotifyUrl(album){
  return `https://open.spotify.com/search/${encodeURIComponent(album.spotifyQuery)}`;
}
function sharePrompt(album, listen=null){
  const hp=hpById(album.bestHeadphone)?.name || "";
  const base=`Ouvi ${album.title} — ${album.artist} (${album.year}) pela nossa Album Odyssey.`;
  if(!listen) return `${base}\nQuero conversar sobre o álbum. O site recomendou ${hp} como o melhor fone da minha coleção para ele.`;
  return `${base}\nNota: ${listen.rating ?? "—"}/10\nFaixa favorita: ${listen.favorite_track || "—"}\nFone usado: ${hpById(listen.headphone_used)?.name || "—"}\nComentário: ${listen.comment || "—"}\nQuero discutir o álbum e decidir para onde seguir.`;
}
async function copyText(s){
  try { await navigator.clipboard.writeText(s); toast("Texto copiado para comentar aqui."); }
  catch { toast("Não consegui copiar automaticamente."); }
}

function coverKey(a){ return a.id; }
async function fetchCover(album){
  const k=coverKey(album);
  if(state.covers[k]) return state.covers[k];
  if(location.protocol==="file:") return "";
  try{
    const u=`/api/cover?artist=${encodeURIComponent(album.artist)}&album=${encodeURIComponent(album.title)}`;
    const r=await fetch(u);
    if(!r.ok) return "";
    const data=await r.json();
    if(data.cover){
      state.covers[k]=data.cover;
      const keys=Object.keys(state.covers);
      if(keys.length>650) delete state.covers[keys[0]];
      localStorage.setItem("ao_covers",JSON.stringify(state.covers));
      return data.cover;
    }
  }catch{}
  return "";
}
function setCover(img, album){
  if(!img || img.dataset.loading) return;
  img.dataset.loading="1";
  const cached=state.covers[coverKey(album)];
  if(cached){ img.src=cached; return; }
  fetchCover(album).then(src=>{ if(src) img.src=src; });
}
function hydrateCovers(root=document){
  const imgs=$$("img[data-album-cover]",root);
  if(!("IntersectionObserver" in window)){
    imgs.forEach(img=>setCover(img,albumById(img.dataset.albumCover))); return;
  }
  const io=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const img=e.target, a=albumById(img.dataset.albumCover);
        if(a) setCover(img,a);
        io.unobserve(img);
      }
    })
  },{rootMargin:"180px"});
  imgs.forEach(i=>io.observe(i));
}
function coverHTML(album, cls="cover"){
  const src=state.covers[coverKey(album)] || "";
  return `<img class="${cls}" data-album-cover="${album.id}" src="${esc(src)}" alt="Capa de ${esc(album.title)}" loading="lazy">`;
}

function nav(view){
  state.view=view;
  $$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.nav===view));
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}
function render(){
  if(state.view==="discover") renderDiscover();
  if(state.view==="library") renderLibrary();
  if(state.view==="history") renderHistory();
  if(state.view==="stats") renderStats();
  updateProgress();
}
function bindNav(){
  $$("[data-nav]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.nav)));
}

function modeCard(mode,emoji,title,desc,featured=false){
  return `<button class="mode-card ${featured?"featured":""}" data-mode="${mode}">
    <span class="emoji">${emoji}</span><b>${title}</b><small>${desc}</small>
  </button>`;
}

function renderDiscover(){
  const main=$("#main");
  if(state.currentAlbum){
    main.innerHTML=renderAlbumResult(state.currentAlbum);
    bindResultActions();
    hydrateCovers(main);
    return;
  }
  main.innerHTML=`
    <section class="hero">
      <p class="eyebrow">Season 1 · ${ALBUMS.length} discos</p>
      <h1>O que vamos ouvir hoje?</h1>
      <p>Escolha uma direção ou entregue a decisão ao caos. Discos já ouvidos saem do sorteio.</p>
    </section>
    <section class="mode-grid">
      ${modeCard("surprise","🎲","Me surpreenda","Qualquer direção. Só precisa valer a audição.",true)}
      ${modeCard("heavy","🔥","Quero peso","Metalcore, thrash, hardcore, groove e porrada.")}
      ${modeCard("feel","💔","Quero sentir","Melodia, emoção, refrões e clímax.")}
      ${modeCard("guitar","🎸","Quero guitarra","Riffs, solos, técnica e timbres memoráveis.")}
      ${modeCard("atmosphere","🌌","Quero viajar","Atmosfera, camadas e discos para entrar dentro.")}
      ${modeCard("classic","🏛️","Um clássico","Repertório obrigatório sem virar lista escolar.")}
      ${modeCard("scene","🖤","Me leva para 2007","Scene, emo, post-hardcore e metalcore dos 2000s.")}
      ${modeCard("outside","🧪","Fora da minha bolha","Algo mais distante, mas com uma ponte plausível.")}
    </section>
    <div class="section-head"><h2>Recomende para meu fone</h2><small>modo dedicado</small></div>
    <select id="headphonePick" class="select-fone">
      ${HEADPHONES.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join("")}
    </select>
    <button id="headphoneDraw" class="btn primary" style="width:100%;margin-top:9px">🎧 Sortear para este fone</button>
    <p class="note">Neste modo o álbum é escolhido entre os discos cuja combinação definitiva foi atribuída ao fone selecionado.</p>
  `;
  $$("[data-mode]",main).forEach(b=>b.addEventListener("click",()=>draw(b.dataset.mode)));
  $("#headphoneDraw").addEventListener("click",()=>{
    draw("headphone",{headphone:$("#headphonePick").value});
  });
}

function draw(mode,opt={}){
  const a=pickAlbum(mode,opt);
  if(!a){ toast("Você zerou esse pool. Tente outro modo."); return; }
  state.mode={mode,opt};
  state.currentAlbum=a;
  renderDiscover();
}

function renderAlbumResult(a){
  const hp=hpById(a.bestHeadphone);
  return `<article class="album-result">
    <button class="btn ghost" id="backDiscover" style="margin-bottom:12px">← voltar aos modos</button>
    <div class="cover-wrap">
      <div class="cover-placeholder">ALBUM<br>ODYSSEY</div>
      ${coverHTML(a)}
    </div>
    <div class="result-meta">
      <div class="artist">${esc(a.artist)}</div>
      <h2>${esc(a.title)}</h2>
      <div class="chips">
        <span class="chip">${a.year}</span>
        ${a.genres.slice(0,2).map(x=>`<span class="chip">${esc(x)}</span>`).join("")}
        ${a.tags.slice(0,2).map(x=>`<span class="chip">${esc(x)}</span>`).join("")}
      </div>
      <div class="headphone-box">
        <span>🎧 melhor fone da sua coleção</span>
        <b>${esc(hp?.name || "—")}</b>
        <p>${esc(a.headphoneReason)}</p>
      </div>
      <div class="actions">
        <a class="btn primary" href="${spotifyUrl(a)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">▶ Abrir no Spotify</a>
        <button class="btn" id="skipAlbum">↻ Outro agora</button>
        <button class="btn primary full" id="markListened">✓ Terminei o álbum</button>
        <button class="btn ghost full" id="copyDiscuss">💬 Copiar para comentar no ChatGPT</button>
      </div>
    </div>
  </article>`;
}
function bindResultActions(){
  $("#backDiscover").addEventListener("click",()=>{state.currentAlbum=null;renderDiscover();});
  $("#skipAlbum").addEventListener("click",()=>{
    if(state.currentAlbum) state.sessionSkips.add(state.currentAlbum.id);
    const {mode,opt}=state.mode||{mode:"surprise",opt:{}};
    const next=pickAlbum(mode,opt||{});
    if(!next){state.currentAlbum=null;toast("Esse pool acabou por enquanto.");}
    else state.currentAlbum=next;
    renderDiscover();
  });
  $("#markListened").addEventListener("click",()=>openRating(state.currentAlbum));
  $("#copyDiscuss").addEventListener("click",()=>copyText(sharePrompt(state.currentAlbum)));
}

function openRating(album, existing=null){
  const d=$("#ratingDialog");
  const x=existing || state.listens[album.id] || {};
  d.innerHTML=`<form method="dialog" class="modal-inner" id="ratingForm">
    <h3>${esc(album.title)}</h3>
    <p>${esc(album.artist)} · ${album.year}</p>
    <div class="inline">
      <div class="field"><label>Nota /10</label>
        <select id="rating" required>
          ${Array.from({length:21},(_,i)=>10-i*.5).map(v=>`<option value="${v}" ${Number(x.rating)===v?"selected":""}>${v.toFixed(1)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Fone usado</label>
        <select id="usedHp">
          <option value="">Não registrar</option>
          ${HEADPHONES.map(h=>`<option value="${h.id}" ${x.headphone_used===h.id?"selected":""}>${esc(h.name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Faixa favorita</label><input id="favTrack" value="${esc(x.favorite_track||"")}" placeholder="ex.: The Thespian"></div>
    <div class="field"><label>Comentário</label><textarea id="comment" placeholder="O que te pegou?">${esc(x.comment||"")}</textarea></div>
    <label style="display:flex;gap:9px;align-items:center;margin-top:12px"><input type="checkbox" id="favorite" ${x.favorite?"checked":""}> ❤️ Colocar nos favoritos</label>
    <div class="modal-actions">
      <button class="btn ghost" value="cancel">Cancelar</button>
      <button class="btn primary" id="saveListen" value="default">Salvar audição</button>
    </div>
  </form>`;
  d.showModal();
  $("#saveListen",d).addEventListener("click",async e=>{
    e.preventDefault();
    const listen={
      album_id:album.id,
      rating:Number($("#rating",d).value),
      favorite_track:$("#favTrack",d).value.trim(),
      comment:$("#comment",d).value.trim(),
      headphone_used:$("#usedHp",d).value || null,
      favorite:$("#favorite",d).checked,
      listened_at:x.listened_at || new Date().toISOString()
    };
    await saveListen(album,listen);
    d.close();
    state.currentAlbum=null;
    toast("Álbum registrado. Saiu do pool.");
    render();
  });
}

async function saveListen(album,listen){
  state.listens[album.id]=listen;
  saveLocal();
  if(state.supabase && state.user){
    const payload={...listen,user_id:state.user.id,updated_at:new Date().toISOString()};
    const {error}=await state.supabase.from("listens").upsert(payload,{onConflict:"user_id,album_id"});
    if(error) toast("Salvo localmente; sincronização falhou.");
  }
}
async function deleteListen(albumId){
  delete state.listens[albumId]; saveLocal();
  if(state.supabase && state.user){
    await state.supabase.from("listens").delete().eq("user_id",state.user.id).eq("album_id",albumId);
  }
}

function renderLibrary(){
  const main=$("#main");
  const heard=Object.keys(state.listens).length;
  const filters=["all","heard","unheard","favorites"];
  const labels={all:"Todos",heard:"Ouvidos",unheard:"Não ouvidos",favorites:"Favoritos"};
  let list=ALBUMS;
  if(state.libraryFilter==="heard") list=list.filter(a=>isListened(a.id));
  if(state.libraryFilter==="unheard") list=list.filter(a=>!isListened(a.id));
  if(state.libraryFilter==="favorites") list=list.filter(a=>state.listens[a.id]?.favorite);
  main.innerHTML=`
    <section class="hero"><p class="eyebrow">Minha biblioteca</p><h1>${heard} de ${ALBUMS.length}</h1><p>As capas são reveladas conforme você conclui os discos.</p></section>
    <div class="filters">${filters.map(f=>`<button class="filter-btn ${state.libraryFilter===f?"active":""}" data-libfilter="${f}">${labels[f]}</button>`).join("")}</div>
    <label class="spoiler-toggle"><input id="spoiler" type="checkbox" ${state.spoilers?"checked":""}> mostrar capas e nomes dos não ouvidos</label>
    <div class="library-grid" style="margin-top:14px">
      ${list.map(a=>{
        const heard=isListened(a.id), reveal=heard||state.spoilers;
        return `<div class="album-card">
          <button data-open-album="${a.id}">
            <div class="mini-cover ${reveal?"":"locked"}">
              ${coverHTML(a)}
              ${reveal?"":`<span class="lock">◉</span>`}
            </div>
            <b>${reveal?esc(a.title):"Não revelado"}</b>
            <small>${reveal?esc(a.artist):`${a.year} · surpresa`}</small>
          </button>
        </div>`;
      }).join("")}
    </div>`;
  $$("[data-libfilter]",main).forEach(b=>b.addEventListener("click",()=>{state.libraryFilter=b.dataset.libfilter;renderLibrary()}));
  $("#spoiler").addEventListener("change",e=>{state.spoilers=e.target.checked;localStorage.setItem("ao_spoilers",JSON.stringify(state.spoilers));renderLibrary()});
  $$("[data-open-album]",main).forEach(b=>b.addEventListener("click",()=>{
    const a=albumById(b.dataset.openAlbum);
    if(!isListened(a.id) && !state.spoilers) return;
    state.currentAlbum=a; state.view="discover"; render(); bindNav();
  }));
  hydrateCovers(main);
}

function renderHistory(){
  const main=$("#main");
  const entries=Object.entries(state.listens)
    .map(([id,l])=>({album:albumById(id),listen:l}))
    .filter(x=>x.album)
    .sort((a,b)=>new Date(b.listen.listened_at)-new Date(a.listen.listened_at));
  main.innerHTML=`
    <section class="hero"><p class="eyebrow">Diário de audição</p><h1>Histórico</h1><p>Notas, faixas favoritas e comentários das suas descobertas.</p></section>
    ${entries.length?`<div class="history-list">${entries.map(({album:a,listen:l})=>`
      <div class="history-item">
        ${coverHTML(a,"thumb")}
        <button data-edit="${a.id}" style="border:0;background:none;color:inherit;text-align:left;padding:0">
          <b>${esc(a.title)}</b><small>${esc(a.artist)} · ${new Date(l.listened_at).toLocaleDateString("pt-BR")}${l.favorite?" · ❤️":""}</small>
          ${l.favorite_track?`<small>♪ ${esc(l.favorite_track)}</small>`:""}
        </button>
        <span class="rating-pill">${Number(l.rating).toFixed(1)}</span>
      </div>`).join("")}</div>`:
      `<div class="empty"><strong>Ainda está vazio.</strong>Termine seu primeiro álbum e ele aparece aqui.</div>`}`;
  $$("[data-edit]",main).forEach(b=>b.addEventListener("click",()=>{
    const a=albumById(b.dataset.edit); openRating(a,state.listens[a.id]);
  }));
  hydrateCovers(main);
}

function statFavoriteGenre(){
  const tally={};
  Object.entries(state.listens).forEach(([id,l])=>{
    const a=albumById(id); if(!a || l.rating==null)return;
    a.genres.forEach(g=>{
      tally[g] ||= {sum:0,n:0}; tally[g].sum+=Number(l.rating); tally[g].n++;
    });
  });
  const arr=Object.entries(tally).filter(([,x])=>x.n>=2).map(([g,x])=>({g,avg:x.sum/x.n,n:x.n}));
  return arr.sort((a,b)=>b.avg-a.avg||b.n-a.n)[0] || null;
}
function statFavoriteDecade(){
  const tally={};
  Object.entries(state.listens).forEach(([id,l])=>{
    const a=albumById(id); if(!a)return;
    tally[a.decade] ||= {sum:0,n:0}; tally[a.decade].sum+=Number(l.rating||0); tally[a.decade].n++;
  });
  return Object.entries(tally).map(([d,x])=>({d,avg:x.sum/x.n,n:x.n})).sort((a,b)=>b.avg-a.avg||b.n-a.n)[0]||null;
}
function renderStats(){
  const main=$("#main");
  const vals=Object.values(state.listens);
  const rated=vals.filter(x=>x.rating!=null);
  const avg=rated.length?rated.reduce((s,x)=>s+Number(x.rating),0)/rated.length:0;
  const favs=vals.filter(x=>x.favorite).length;
  const tens=vals.filter(x=>Number(x.rating)===10).length;
  const fg=statFavoriteGenre(), fd=statFavoriteDecade();
  const ranking=Object.entries(state.listens).map(([id,l])=>({a:albumById(id),l})).filter(x=>x.a).sort((x,y)=>Number(y.l.rating)-Number(x.l.rating)||new Date(y.l.listened_at)-new Date(x.l.listened_at)).slice(0,20);
  const pct=Math.round(vals.length/ALBUMS.length*100);
  main.innerHTML=`
    <section class="hero"><p class="eyebrow">Seu mapa musical</p><h1>${pct}% da Season 1</h1><p>O perfil fica mais interessante conforme a biblioteca cresce.</p><div class="bar"><i style="width:${pct}%"></i></div></section>
    <div class="stats-grid">
      <div class="stat"><strong>${vals.length}</strong><span>álbuns ouvidos</span></div>
      <div class="stat"><strong>${avg?avg.toFixed(2):"—"}</strong><span>nota média</span></div>
      <div class="stat"><strong>${favs}</strong><span>favoritos</span></div>
      <div class="stat"><strong>${tens}</strong><span>10/10</span></div>
      <div class="stat"><strong style="font-size:18px">${esc(fg?.g||"—")}</strong><span>gênero mais bem avaliado*</span></div>
      <div class="stat"><strong style="font-size:18px">${esc(fd?.d||"—")}</strong><span>década mais bem avaliada</span></div>
    </div>
    <p class="note">* Considera gêneros com pelo menos 2 álbuns avaliados.</p>
    <div class="section-head"><h2>Seu ranking</h2><small>top 20</small></div>
    ${ranking.length?`<div class="rank-list">${ranking.map((x,i)=>`<div class="rank-row"><span class="pos">#${i+1}</span><div><b>${esc(x.a.title)}</b><small>${esc(x.a.artist)} · ${x.a.year}</small></div><strong>${Number(x.l.rating).toFixed(1)}</strong></div>`).join("")}</div>`:`<div class="empty">Seu ranking aparece depois da primeira nota.</div>`}
  `;
}

async function setupSupabase(){
  const configured=CONFIG.supabaseUrl && CONFIG.supabaseAnonKey;
  if(!configured){
    state.syncMode="local"; updateSyncBadge(); return;
  }
  try{
    const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    state.supabase=createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey);
    const {data:{session}}=await state.supabase.auth.getSession();
    state.user=session?.user || null;
    state.supabase.auth.onAuthStateChange((_event,session)=>{
      state.user=session?.user||null;
      if(state.user) loadCloudListens();
      updateSyncBadge();
    });
    if(state.user) await loadCloudListens();
    updateSyncBadge();
  }catch(e){
    state.syncMode="local"; updateSyncBadge();
  }
}
async function loadCloudListens(){
  if(!state.supabase || !state.user)return;
  const {data,error}=await state.supabase.from("listens").select("*").eq("user_id",state.user.id);
  if(error){toast("Não consegui puxar a nuvem."); return;}
  for(const l of data){
    const local=state.listens[l.album_id];
    const cloudDate=new Date(l.updated_at||l.listened_at||0);
    const localDate=new Date(local?.updated_at||local?.listened_at||0);
    if(!local || cloudDate>=localDate) state.listens[l.album_id]=l;
  }
  saveLocal(); state.syncMode="cloud"; updateSyncBadge(); render();
}
function updateSyncBadge(){
  const b=$("#syncBadge"); if(!b)return;
  if(state.user){b.textContent="☁ sincronizado";state.syncMode="cloud"}
  else if(CONFIG.supabaseUrl){b.textContent="☁ sem login";state.syncMode="local"}
  else b.textContent="modo local";
}
function openAccount(){
  const d=$("#accountDialog");
  const configured=CONFIG.supabaseUrl && CONFIG.supabaseAnonKey;
  if(!configured){
    d.innerHTML=`<div class="modal-inner"><h3>Sincronização</h3>
      <p>Esta cópia está em modo local. Quando configurarmos Supabase, o mesmo app sincroniza celular e PC por e-mail.</p>
      <div class="modal-actions"><button class="btn primary" onclick="this.closest('dialog').close()">Fechar</button></div></div>`;
    d.showModal(); return;
  }
  if(state.user){
    d.innerHTML=`<div class="modal-inner"><h3>Conta</h3><p>Conectado como <b>${esc(state.user.email||"usuário")}</b>.</p>
      <div class="modal-actions"><button class="btn ghost" id="signOut">Sair</button><button class="btn primary" onclick="this.closest('dialog').close()">Fechar</button></div></div>`;
    d.showModal(); $("#signOut",d).addEventListener("click",async()=>{await state.supabase.auth.signOut();d.close();toast("Sessão encerrada.")}); return;
  }
  d.innerHTML=`<div class="modal-inner"><h3>Entrar para sincronizar</h3><p>Digite seu e-mail. O Supabase envia um link mágico — sem precisar criar senha.</p>
    <div class="field"><label>E-mail</label><input id="loginEmail" type="email" placeholder="voce@email.com"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="this.closest('dialog').close()">Cancelar</button><button class="btn primary" id="sendMagic">Enviar link</button></div></div>`;
  d.showModal();
  $("#sendMagic",d).addEventListener("click",async()=>{
    const email=$("#loginEmail",d).value.trim(); if(!email)return;
    const {error}=await state.supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
    if(error) toast("Falha ao enviar link."); else {toast("Link enviado. Confira o e-mail.");d.close();}
  });
}

function installGlobalHandlers(){
  document.addEventListener("click",e=>{
    const navBtn=e.target.closest("[data-nav]");
    if(navBtn && navBtn.closest(".bottom-nav, .topbar")) nav(navBtn.dataset.nav);
  });
  $("#accountBtn").addEventListener("click",openAccount);
  if("serviceWorker" in navigator && location.protocol!=="file:") navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

async function init(){
  loadLocal();
  installGlobalHandlers();
  render();
  await setupSupabase();
}
init();
