'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// Gera IDs aleatórios para simular dispositivos diferentes
const gerarID = () => Math.random().toString(36).substring(2, 15);

async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Buscando canais da API...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            let logo = c.colorLogoPNG?.path || c.logo?.path || '';
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'),
                // Limpa a URL original para evitar parâmetros duplicados
                urlBase: c.stitched?.urls?.[0]?.url ? c.stitched.urls[0].url.split('?')[0] : null,
                categoria: c.category || "Geral"
            };
        }).filter(c => c.urlBase);
        
        console.log(`✅ ${canaisCache.length} canais carregados.`);
    } catch (e) {
        console.error("❌ Erro API:", e.message);
    }
}

atualizarListaDeCanais();

// --- PAINEL VISUAL ---
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
        <title>Pluto Manager Render</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #121212; color: #eee; font-family: sans-serif; }
            .topo { background: #000; padding: 15px; border-bottom: 3px solid #ffee00; margin-bottom: 20px; }
            .card { background: #1e1e1e; border: 1px solid #333; height: 100%; }
            .logo-img { height: 60px; object-fit: contain; width: 100%; background: #000; padding: 5px; }
            .btn-watch { background: #ffee00; color: #000; font-weight: bold; width: 100%; border:none; margin-bottom: 5px; }
            .btn-copy { background: #333; color: #fff; width: 100%; border:none; font-size: 11px; }
        </style>
    </head>
    <body>
    <div class="topo text-center">
        <h4>PLUTO <span style="color:#ffee00">RENDER</span></h4>
        <a href="/lista.m3u" class="btn btn-warning btn-sm fw-bold">BAIXAR LISTA M3U</a>
    </div>
    <div class="container pb-5">
        <div class="row g-2">
        ${canaisCache.map(ch => `
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card p-2 text-center">
                    <img src="${ch.logo}" class="logo-img mb-2">
                    <p class="text-truncate text-white fw-bold mb-2" style="font-size:12px;">${ch.nome}</p>
                    <a href="${baseUrl}/play/${ch.id}" target="_blank" class="btn btn-sm btn-watch">ASSISTIR</a>
                    <button onclick="copiar('${baseUrl}/play/${ch.id}')" class="btn btn-sm btn-copy">COPIAR</button>
                </div>
            </div>
        `).join('')}
        </div>
    </div>
    <script>
        function copiar(txt) {
            navigator.clipboard.writeText(txt).then(() => alert('Copiado!'));
        }
    </script>
    </body></html>`);
});

// --- REDIRECIONADOR (CORREÇÃO DE DNT E SID) ---
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal OFF");

    const sid = gerarID();
    
    // Lista completa de parâmetros obrigatórios para evitar erros da Pluto
    const query = new URLSearchParams({
        appName: "web",
        appVersion: "unknown",
        deviceId: sid,
        deviceDNT: "0",        // <--- FIX: "Missing deviceDNT"
        deviceMake: "Chrome",
        deviceModel: "web",
        deviceType: "web",
        deviceVersion: "unknown",
        sid: sid,
        userId: sid,
        includeExtendedEvents: "false",
        marketingRegion: "BR"
    });

    const finalUrl = `${canal.urlBase}?${query.toString()}`;

    console.log(`▶️ Play: ${canal.nome}`);
    res.redirect(302, finalUrl);
});

// --- ROTA M3U ---
app.get('/lista.m3u', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    let m3u = "#EXTM3U\n";
    canaisCache.forEach(ch => {
        m3u += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.categoria}",${ch.nome}\n${protocolo}://${host}/play/${ch.id}\n`;
    });
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Online na porta ${PORT}`));
