'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// Função simples para gerar um ID aleatório (resolve o erro de "empty sid")
const gerarID = () => Math.random().toString(36).substring(2, 15);

async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando lista via API...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => ({
            id: c._id,
            nome: c.name,
            logo: (c.colorLogoPNG?.path || c.logo?.path || '').replace(/^http:\/\//i, 'https://'),
            url: c.stitched?.urls?.[0]?.url || null,
            categoria: c.category || "Geral"
        })).filter(c => c.url);
        
        console.log(`✅ ${canaisCache.length} canais carregados.`);
    } catch (e) { console.error("Erro API:", e.message); }
}

atualizarListaDeCanais();

// PAINEL VISUAL
app.get('/', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    res.send(`
        <body style="background:#121212; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h1>Pluto TV Proxy - Render</h1>
            <p>Sua lista M3U está pronta:</p>
            <input type="text" value="${protocolo}://${host}/lista.m3u" style="width:80%; padding:10px;" readonly>
            <br><br>
            <a href="/lista.m3u" style="color:#ffee00;">Baixar Lista .M3U</a>
        </body>
    `);
});

// REDIRECIONADOR COM FIX PARA O ERRO DE "EMPTY SID"
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal não encontrado");

    // Aqui está o segredo: preenchemos o deviceId e o sid com valores aleatórios
    const sessionId = gerarID();
    const fixUrl = `${canal.url}?appName=web&appVersion=unknown&deviceId=${sessionId}&deviceMake=Chrome&deviceModel=web&deviceType=web&sid=${sessionId}`;

    console.log(`▶️ Play: ${canal.nome}`);
    res.redirect(302, fixUrl);
});

// ROTA M3U
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

app.listen(PORT, () => console.log(`🚀 Rodando na porta ${PORT}`));
