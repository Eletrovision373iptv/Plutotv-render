'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// --- BUSCA OS CANAIS DA API ---
async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando lista via API...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            let logo = c.colorLogoPNG?.path || c.logo?.path || 'https://via.placeholder.com/150';
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'),
                url: c.stitched?.urls?.[0]?.url || null,
                categoria: c.category || "Geral"
            };
        }).filter(c => c.url);
        
        console.log(`✅ ${canaisCache.length} canais carregados.`);
        return canaisCache.length;
    } catch (e) {
        console.error("❌ Erro:", e.message);
        return 0;
    }
}

atualizarListaDeCanais();

// --- PAINEL VISUAL (COPIAR E ASSISTIR) ---
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
        <title>Pluto Render Panel</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #121212; color: #eee; font-family: sans-serif; }
            .topo { background: #000; padding: 15px; border-bottom: 3px solid #ffee00; margin-bottom: 20px; }
            .card { background: #1e1e1e; border: 1px solid #333; transition: 0.3s; }
            .card:hover { border-color: #ffee00; transform: translateY(-5px); }
            .logo-img { height: 60px; object-fit: contain; width: 100%; background: #000; padding: 5px; }
            .btn-watch { background: #ffee00; color: #000; font-weight: bold; width: 100%; border:none; margin-bottom: 5px; }
            .btn-copy { background: #333; color: #fff; width: 100%; border:none; font-size: 12px; }
            .badge-cat { font-size: 10px; color: #ffee00; text-transform: uppercase; }
        </style>
    </head>
    <body>
    <div class="topo">
        <div class="container d-flex justify-content-between align-items-center">
            <h4 class="m-0">PLUTO <span style="color:#ffee00">RENDER</span></h4>
            <a href="/lista.m3u" class="btn btn-warning btn-sm fw-bold">📥 BAIXAR M3U</a>
        </div>
    </div>
    
    <div class="container pb-5">
        <div class="row g-3">
        ${canaisCache.map((ch) => {
            const linkPlay = `${baseUrl}/play/${ch.id}`;
            return `
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card p-2 text-center h-100">
                    <img src="${ch.logo}" class="logo-img rounded mb-2">
                    <div class="card-body p-0">
                        <small class="badge-cat">${ch.categoria}</small>
                        <p class="text-truncate text-white fw-bold m-0" style="font-size:13px;">${ch.nome}</p>
                        <hr style="border-color:#333">
                        <a href="${linkPlay}" target="_blank" class="btn btn-sm btn-watch">ASSISTIR</a>
                        <button onclick="copiar('${linkPlay}')" class="btn btn-sm btn-copy">COPIAR LINK</button>
                    </div>
                </div>
            </div>`;
        }).join('')}
        </div>
    </div>

    <script>
        function copiar(texto) {
            navigator.clipboard.writeText(texto).then(() => {
                alert('Link copiado com sucesso!');
            });
        }
    </script>
    </body></html>`;
    res.send(html);
});

// --- ROTA DE REDIRECIONAMENTO (LEVE) ---
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal OFF");

    const params = "?appName=web&appVersion=unknown&clientTime=0&deviceDNT=0&deviceId=web&deviceMake=Chrome&deviceModel=web&deviceType=web&deviceVersion=unknown&sid=web";
    res.redirect(302, canal.url + params);
});

// --- ROTA M3U ---
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

app.listen(PORT, () => console.log(`🚀 Painel pronto na porta ${PORT}`));
