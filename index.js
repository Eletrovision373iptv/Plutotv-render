'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// UUID Realista para evitar Blacklist
const gerarID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando base de dados Pluto (PT-BR)...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            let logo = c.colorLogoPNG?.path || c.logo?.path || '';
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'),
                urlBase: c.stitched?.urls?.[0]?.url ? c.stitched.urls[0].url.split('?')[0] : null,
                categoria: c.category || "Geral"
            };
        }).filter(c => c.urlBase);
        
        console.log(`✅ ${canaisCache.length} canais prontos.`);
    } catch (e) {
        console.error("Erro na API:", e.message);
    }
}

atualizarListaDeCanais();

// PAINEL VISUAL
app.get('/', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    const baseUrl = `${protocolo}://${host}`;

    let html = `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pluto Manager BR</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #0a0a0a; color: #eee; font-family: sans-serif; }
            .topo { background: #000; padding: 15px; border-bottom: 3px solid #ffee00; margin-bottom: 20px; position: sticky; top:0; z-index:1000; }
            .card { background: #161616; border: 1px solid #333; transition: 0.3s; height: 100%; }
            .card:hover { border-color: #ffee00; transform: translateY(-5px); }
            .logo-img { height: 60px; object-fit: contain; width: 100%; background: #000; padding: 8px; border-radius: 4px; }
            .btn-watch { background: #ffee00; color: #000; font-weight: bold; width: 100%; border:none; margin-bottom: 6px; }
            .btn-copy { background: #222; color: #fff; width: 100%; border: 1px solid #444; font-size: 11px; }
            .badge-cat { font-size: 9px; color: #ffee00; text-transform: uppercase; margin-bottom: 5px; display: block; }
        </style>
    </head>
    <body>
    <div class="topo">
        <div class="container d-flex justify-content-between align-items-center">
            <h4 class="m-0"><span style="color:#ffee00">PLUTO</span> BRASIL</h4>
            <a href="/lista.m3u" class="btn btn-warning btn-sm fw-bold">📥 LISTA M3U</a>
        </div>
    </div>
    <div class="container pb-5">
        <div class="row g-3">
        ${canaisCache.map(ch => `
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card p-3 text-center">
                    <img src="${ch.logo}" class="logo-img mb-2" loading="lazy">
                    <small class="badge-cat">${ch.categoria}</small>
                    <p class="text-truncate text-white fw-bold mb-3" style="font-size:12px;">${ch.nome}</p>
                    <a href="${baseUrl}/play/${ch.id}" target="_blank" class="btn btn-sm btn-watch">ASSISTIR</a>
                    <button onclick="copiar('${baseUrl}/play/${ch.id}')" class="btn btn-sm btn-copy">COPIAR LINK</button>
                </div>
            </div>`).join('')}
        </div>
    </div>
    <script>
        function copiar(t){ navigator.clipboard.writeText(t).then(()=>alert('Link copiado!')); }
    </script>
    </body></html>`;
    res.send(html);
});

// ============================================================
// REDIRECIONADOR COM FIX DE IDIOMA (PT-BR)
// ============================================================
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal OFF");

    const sid = gerarID();
    const deviceId = gerarID();

    const query = new URLSearchParams({
        appName: "web",
        appVersion: "5.33.0-60f786d5d4d3",
        deviceDNT: "0",
        deviceId: deviceId,
        deviceMake: "Chrome",
        deviceModel: "web",
        deviceType: "web",
        deviceVersion: "120.0.0.0",
        sid: sid,
        userId: deviceId,
        includeExtendedEvents: "false",
        serverSideAds: "false",
        // --- PARÂMETROS DE IDIOMA E REGIÃO ---
        marketingRegion: "BR", // Força Brasil
        locale: "pt-BR",       // Força interface em Português
        lang: "pt"             // Força áudio em Português quando disponível
    });

    res.redirect(302, `${canal.urlBase}?${query.toString()}`);
});

// ROTA M3U
app.get('/lista.m3u', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    let m3u = "#EXTM3U\n";
    canaisCache.forEach(ch => {
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-logo="${ch.logo}" group-title="${ch.categoria}",${ch.nome}\n${protocolo}://${host}/play/${ch.id}\n`;
    });
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Painel BR ativo na porta ${PORT}`));
