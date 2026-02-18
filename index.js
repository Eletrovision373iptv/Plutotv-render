'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// Gera IDs aleatórios complexos para evitar o blacklist por repetição
const gerarID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando base de dados Pluto...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            let logo = c.colorLogoPNG?.path || c.logo?.path || '';
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'),
                // Limpeza agressiva da URL
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

// PAINEL
app.get('/', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    res.send(`
    <body style="background:#000; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
        <h1 style="color:#ffee00">PLUTO V4 PROTECTED</h1>
        <p>Use o link abaixo no seu Player (VLC, IPTV Smarters, etc):</p>
        <code style="background:#222; padding:10px; display:block; width:fit-content; margin:20px auto; border:1px solid #ffee00;">
            ${protocolo}://${host}/lista.m3u
        </code>
        <a href="/lista.m3u" style="color:#ffee00; text-decoration:none;">[ BAIXAR ARQUIVO .M3U ]</a>
    </body>`);
});

// REDIRECIONADOR ANTI-BLACKLIST
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    if (!canal) return res.status(404).send("Canal não encontrado");

    const sid = gerarID();
    const deviceId = gerarID();

    // Parâmetros exatos que o Web Player oficial usa para não cair no Blacklist
    const query = new URLSearchParams({
        appName: "web",
        appVersion: "5.33.0-60f786d5d4d3", // Versão simulada do player oficial
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
        marketingRegion: "BR"
    });

    const finalUrl = `${canal.urlBase}?${query.toString()}`;

    console.log(`▶️ Bypass Blacklist: ${canal.nome}`);

    // Definindo headers para parecer uma requisição de navegador real
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.redirect(302, finalUrl);
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

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bypass ativo na porta ${PORT}`));
