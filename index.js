'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

// ─── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
const M3U_URL = "https://raw.githubusercontent.com/iprtl/m3u/refs/heads/live/Pluto.m3u";
const ATUALIZAR_INTERVALO_MS = 60 * 60 * 1000; // atualiza a cada 1h
// ──────────────────────────────────────────────────────────────────────────────

let canaisCache = [];

function parsearM3U(texto) {
    const linhas = texto.split('\n').map(l => l.trim());
    const canais = [];
    let atual = null;

    for (const linha of linhas) {
        // Ignora linhas vazias, comentários decorativos, separadores e cabeçalho
        if (!linha
            || linha.startsWith('#EXTM3U')
            || linha.startsWith('# ')
            || linha.startsWith('==')
            || linha.startsWith('--')
            || linha.startsWith('🌈')
            || (linha.startsWith('#') && !linha.startsWith('#EXTINF'))
        ) continue;

        if (linha.startsWith('#EXTINF')) {
            const tvgId    = (linha.match(/tvg-id="([^"]*)"/)      || [])[1] || '';
            const tvgName  = (linha.match(/tvg-name="([^"]*)"/)    || [])[1] || '';
            const logo     = (linha.match(/tvg-logo="([^"]*)"/)    || [])[1] || '';
            const grupo    = (linha.match(/group-title="([^"]*)"/) || [])[1] || 'Geral';
            // Nome: prefere o que está após a vírgula final; fallback para tvg-name
            const parteNome = linha.split(',').slice(-1)[0].trim();
            const nome = (parteNome && parteNome !== '-1') ? parteNome : tvgName || 'Sem nome';
            // ID único: tvg-id > tvg-name > índice aleatório
            const id = tvgId || tvgName || String(Date.now() + Math.random());
            atual = { id, nome, logo, categoria: grupo };

        } else if (atual && (linha.startsWith('http') || linha.startsWith('rtmp') || linha.startsWith('rtsp'))) {
            atual.urlBase = linha;
            canais.push(atual);
            atual = null;
        }
    }
    return canais;
}

async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando canais via M3U remota...");
        const response = await fetch(M3U_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const texto = await response.text();
        const parsed = parsearM3U(texto);
        if (parsed.length === 0) throw new Error("M3U veio vazia ou inválida");
        canaisCache = parsed;
        console.log(`✅ ${canaisCache.length} canais carregados.`);
    } catch (e) {
        console.error("❌ Erro ao carregar M3U:", e.message);
    }
}

atualizarListaDeCanais();
setInterval(atualizarListaDeCanais, ATUALIZAR_INTERVALO_MS);

// ─── KEEP-ALIVE (evita o spin-down do Render free tier) ───────────────────────
// Só ativa se a variável RENDER_EXTERNAL_URL estiver definida (ambiente Render)
if (process.env.RENDER_EXTERNAL_URL) {
    const PING_INTERVALO_MS = 14 * 60 * 1000; // a cada 14 minutos
    setInterval(async () => {
        try {
            await fetch(`${process.env.RENDER_EXTERNAL_URL}/health`);
            console.log("🏓 Keep-alive ping enviado");
        } catch (e) {
            console.warn("⚠️  Keep-alive falhou:", e.message);
        }
    }, PING_INTERVALO_MS);
    console.log(`🔁 Keep-alive ativo → ${process.env.RENDER_EXTERNAL_URL}`);
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', canais: canaisCache.length, uptime: process.uptime() });
});

// ─── PAINEL VISUAL ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    const baseUrl = `${protocolo}://${host}`;

    const categorias = [...new Set(canaisCache.map(c => c.categoria))].sort();

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pluto Manager</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #0a0a0a; color: #eee; font-family: sans-serif; }
            .topo { background: #000; padding: 15px; border-bottom: 3px solid #ffee00; margin-bottom: 20px; }
            .card { background: #161616; border: 1px solid #333; height: 100%; transition: 0.3s; }
            .card:hover { border-color: #ffee00; }
            .logo-img { height: 60px; object-fit: contain; width: 100%; padding: 8px; background:#111; border-radius:4px; }
            .btn-watch { background: #ffee00; color: #000; font-weight: bold; width: 100%; margin-bottom: 6px; border:none; }
            .btn-copy  { background: #222; color: #fff; width: 100%; border: 1px solid #444; font-size: 11px; }
            .filtros { gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
            .filtros .btn { font-size: 11px; padding: 3px 10px; }
            .canal-card { display: block; }
        </style>
    </head>
    <body>
    <div class="topo text-center">
        <h4 class="m-0"><span style="color:#ffee00">PLUTO</span> MANAGER</h4>
        <small class="text-secondary">${canaisCache.length} canais ativos</small><br>
        <a href="/lista.m3u" class="btn btn-warning btn-sm mt-2 fw-bold">📥 BAIXAR M3U</a>
    </div>
    <div class="container pb-5">
        <div class="d-flex filtros">
            <button class="btn btn-warning btn-sm" onclick="filtrar('')">Todos</button>
            ${categorias.map(cat => `<button class="btn btn-outline-secondary btn-sm" onclick="filtrar('${cat.replace(/'/g,"\\'")}')">
                ${cat}
            </button>`).join('')}
        </div>
        <div class="row g-3" id="grade">
        ${canaisCache.map(ch => `
            <div class="col-6 col-md-4 col-lg-2 canal-card" data-cat="${ch.categoria}">
                <div class="card p-3 text-center">
                    ${ch.logo
                        ? `<img src="${ch.logo}" class="logo-img mb-2" onerror="this.style.display='none'">`
                        : `<div class="logo-img mb-2 d-flex align-items-center justify-content-center text-secondary" style="font-size:10px;">SEM LOGO</div>`
                    }
                    <p class="text-truncate text-white fw-bold mb-1" style="font-size:12px;" title="${ch.nome}">${ch.nome}</p>
                    <small class="text-secondary d-block mb-2" style="font-size:10px;">${ch.categoria}</small>
                    <a href="${baseUrl}/play/${encodeURIComponent(ch.id)}" target="_blank" class="btn btn-sm btn-watch">ASSISTIR</a>
                    <button onclick="copiar('${baseUrl}/play/${encodeURIComponent(ch.id)}')" class="btn btn-sm btn-copy">COPIAR LINK</button>
                </div>
            </div>`).join('')}
        </div>
    </div>
    <script>
        function copiar(t){ navigator.clipboard.writeText(t).then(()=>alert('Link copiado!')); }
        function filtrar(cat) {
            document.querySelectorAll('.canal-card').forEach(el => {
                el.style.display = (!cat || el.dataset.cat === cat) ? '' : 'none';
            });
        }
    </script>
    </body></html>`);
});

// ─── REDIRECIONADOR ────────────────────────────────────────────────────────────
app.get('/play/:id', (req, res) => {
    const id = decodeURIComponent(req.params.id);
    const canal = canaisCache.find(c => c.id === id);
    if (!canal) return res.status(404).send("Canal não encontrado");
    console.log(`▶️  ${canal.nome}`);
    res.redirect(302, canal.urlBase);
});

// ─── ROTA M3U ─────────────────────────────────────────────────────────────────
app.get('/lista.m3u', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    let m3u = "#EXTM3U\n";
    canaisCache.forEach(ch => {
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-logo="${ch.logo}" group-title="${ch.categoria}",${ch.nome}\n`;
        m3u += `${protocolo}://${host}/play/${encodeURIComponent(ch.id)}\n`;
    });
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor ativo na porta ${PORT}`));
