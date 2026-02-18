'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// Função para gerar um ID de sessão aleatório
const gerarID = () => Math.random().toString(36).substring(2, 15);

async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Buscando lista oficial Pluto TV...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            let logo = c.colorLogoPNG?.path || c.logo?.path || '';
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'),
                // Guardamos apenas a URL base sem os parâmetros problemáticos
                url: c.stitched?.urls?.[0]?.url ? c.stitched.urls[0].url.split('?')[0] : null,
                categoria: c.category || "Geral"
            };
        }).filter(c => c.url);
        
        console.log(`✅ ${canaisCache.length} canais carregados.`);
    } catch (e) {
        console.error("❌ Erro ao carregar API:", e.message);
    }
}

atualizarListaDeCanais();

// Painel Visual
app.get('/', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    res.send(`
        <body style="background:#121212; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h1 style="color:#ffee00">PLUTO PROXY OK</h1>
            <p>Lista M3U para seu Player:</p>
            <input type="text" value="${protocolo}://${host}/lista.m3u" style="width:70%; padding:10px; border-radius:5px; border:none;" readonly>
            <br><br>
            <a href="/lista.m3u" style="color:#ffee00; text-decoration:none; font-weight:bold;">[ BAIXAR LISTA .M3U ]</a>
            <p style="font-size:12px; margin-top:20px; color:#666;">Os canais são redirecionados com SID dinâmico para evitar erros.</p>
        </body>
    `);
});

// Rota de Redirecionamento com Limpeza de Parâmetros
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal não encontrado");

    const sid = gerarID();
    
    // Montamos os parâmetros do zero. 
    // Como usamos o .split('?')[0] lá em cima, garantimos que não haverá duplicidade aqui.
    const params = new URLSearchParams({
        appName: "web",
        appVersion: "unknown",
        deviceId: sid,
        deviceMake: "Chrome",
        deviceModel: "web",
        deviceType: "web",
        deviceVersion: "unknown",
        sid: sid,
        userId: sid,
        includeExtendedEvents: "false",
        marketingRegion: "BR"
    }).toString();

    const finalUrl = `${canal.url}?${params}`;

    console.log(`▶️ Iniciando: ${canal.nome}`);
    res.redirect(302, finalUrl);
});

// Rota M3U
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

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
