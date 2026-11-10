// Guarda o app no celular para abrir sem internet e avisa contas vencendo.
// Troque a versão a cada atualização do app.
const VERSAO = "din-v3";
const AGENDA = "caderneta-agenda";
const ARQUIVOS = ["./", "index.html", "manifest.json", "privacidade.html", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== AGENDA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  if (req.mode === "navigate") { e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSAO).then(c => c.put("index.html", cp)); return r; }).catch(() => caches.match("index.html"))); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok && (new URL(req.url).origin === location.origin || req.url.includes("fonts.g"))) { const cp = r.clone(); caches.open(VERSAO).then(c => c.put(req, cp)); } return r; }).catch(() => hit)));
});

// Lembretes: o app guarda a lista de contas em "agenda.json"; o Android acorda este serviço ~2x por dia.
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function verificarContas() {
  const c = await caches.open(AGENDA);
  const r = await c.match("agenda.json"); if (!r) return;
  const itens = await r.json().catch(() => []);
  const avisadosR = await c.match("avisados.json"); const avisados = avisadosR ? await avisadosR.json().catch(() => ({})) : {};
  const hoje = new Date(); const h = iso(hoje);
  for (const a of itens) {
    const dias = Math.round((new Date(a.vence + "T12:00:00") - new Date(h + "T12:00:00")) / 864e5);
    if (dias < 0 || dias > 2) continue;
    const chave = a.id + "@" + h; if (avisados[chave]) continue;
    const quando = dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : "vence em 2 dias";
    await self.registration.showNotification(a.titulo + " " + quando, { body: "R$ " + brl(a.valor) + " · toque para abrir o Din", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: a.id });
    avisados[chave] = 1;
  }
  for (const k of Object.keys(avisados)) if (k.split("@")[1] < iso(new Date(Date.now() - 7 * 864e5))) delete avisados[k];
  await c.put("avisados.json", new Response(JSON.stringify(avisados), { headers: { "content-type": "application/json" } }));
}
self.addEventListener("periodicsync", e => { if (e.tag === "contas") e.waitUntil(verificarContas()); });
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => { for (const w of ws) { if ("focus" in w) return w.focus(); } return self.clients.openWindow("./"); }));
});
