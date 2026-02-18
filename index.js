'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// Gerador de UUID Realista para evitar Blacklist e erros de SID vazio
const gerarID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// 1. ATUALIZADOR DE LISTA (FORÇA API BRASILEIRA)
async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando base de dados Pluto BR...");
        // Pedimos a lista à API informando que o cliente é brasileiro
        const response = await fetch("https://api.pluto.tv/v2/channels?marketingRegion=BR&locale=pt-BR");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            let logo = c.colorLogoPNG?.path || c.logo?.path || '';
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'),
                // Limpa a URL de parâmetros antigos para evitar "Duplicated Params"
                urlBase: c.stitched?.urls?.[0]?.url ? c.stitched.urls[0].url.split('?')[0] : null,
                categoria: c.category || "Geral"
            };
        }).filter(c => c.urlBase);
        
        console.log(`✅ ${canaisCache.length} canais carregados com sucesso.`);
    } catch (e) {
        console.error("❌ Erro ao carregar API Pluto:", e.message);
    }
}

// Inicializa a lista
atualizarListaDeCanais();

// 2. PAINEL VISUAL (COPIAR E ASSISTIR)
app.get('/', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    const baseUrl = `${protocolo}://${host}`;

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pluto Manager BR-FIX</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #0a0a0a; color: #eee; font-family: sans-serif; }
            .topo { background: #000; padding: 15px; border-bottom: 3px solid #ffee00; margin-bottom: 20px; position: sticky; top:0; z-index:1000; }
            .card { background: #161616; border: 1px solid #333; height: 100%; transition: 0.3s; }
            .card:hover { border-color: #ffee00; transform: translateY(-5px); }
            .logo-img { height: 60px; object-fit: contain; width: 100%; background: #000; padding: 8px; border-radius: 4px; }
            .btn-watch { background: #ffee00; color: #000; font-weight: bold; width: 100%; margin-bottom: 6px; border:none; }
            .btn-copy { background: #222; color: #fff; width: 100%; border: 1px solid #444; font-size: 11px; }
            .badge-cat { font-size: 9px; color: #ffee00; text-transform: uppercase; display: block; margin-bottom: 5px; }
        </style>
    </head>
    <body>
    <div class="topo d-flex justify-content-between align-items-center container-fluid">
        <h4 class="m-0"><span style="color:#ffee00">PLUTO</span> BRASIL</h4>
        <a href="/lista.m3u" class="btn btn-warning btn-sm fw-bold">📥 BAIXAR M3U</a>
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
        function copiar(t){ navigator.clipboard.writeText(t).then(()=>alert('Link copiado para o seu Player!')); }
    </script>
    </body></html>`);
});

// 3. REDIRECIONADOR (CORREÇÃO DE BLACKLIST + ÁUDIO PT-BR)
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal não encontrado.");

    const sid = gerarID();
    
    // Parâmetros para forçar o máximo possível o áudio em Português e evitar erros de header
    const query = new URLSearchParams({
        appName: "android",           // Simula dispositivo Android (mais flexível com áudio)
        appVersion: "3.0.1",
        deviceDNT: "0",
        deviceId: sid,
        deviceMake: "google",
        deviceModel: "androidtv",
        deviceType: "androidtv",
        sid: sid,
        userId: sid,
        marketingRegion: "BR",        // Força Brasil
        locale: "pt-BR",              // Força Português
        lang: "pt",                   // Prioridade de áudio PT
        deviceLat: "-23.5505",        // Coordenadas SP
        deviceLon: "-46.6333",
        includeExtendedEvents: "false",
        serverSideAds: "false"
    });

    const finalUrl = `${canal.urlBase}?${query.toString()}`;

    console.log(`▶️ Direcionando: ${canal.nome} (Simulando PT-BR)`);
    
    // Header opcional para tentar enganar Geo-IP
    res.setHeader('X-Forwarded-For', '189.120.0.1'); 
    res.redirect(302, finalUrl);
});

// 4. ROTA DE LISTA M3U
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

// LIGA O SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor pronto na porta ${PORT}`);
});
