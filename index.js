'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

let canaisCache = [];

// ============================================================
// 1. ATUALIZADOR DE LISTA (BUSCA DIRETO DA API DA PLUTO)
// ============================================================
async function atualizarListaDeCanais() {
    try {
        console.log("🔄 Atualizando lista de canais via API...");
        const response = await fetch("https://api.pluto.tv/v2/channels");
        const json = await response.json();
        
        canaisCache = json.map(c => {
            // Tenta pegar o melhor logo disponível
            let logo = c.colorLogoPNG?.path || c.logo?.path || 'https://via.placeholder.com/150?text=Sem+Logo';
            
            return {
                id: c._id,
                nome: c.name,
                logo: logo.replace(/^http:\/\//i, 'https://'), // Garante HTTPS para não bloquear no browser
                url: c.stitched?.urls?.[0]?.url || null,
                categoria: c.category || "Geral"
            };
        }).filter(c => c.url); // Remove canais sem link de vídeo
        
        console.log(`✅ Sucesso: ${canaisCache.length} canais carregados.`);
        return canaisCache.length;
    } catch (e) {
        console.error("❌ Erro ao atualizar lista:", e.message);
        return 0;
    }
}

// Inicializa a lista ao ligar o servidor
atualizarListaDeCanais();

// ============================================================
// 2. PAINEL VISUAL (BOTÕES COPIAR E ASSISTIR)
// ============================================================
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
        <title>Pluto Manager - Render</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #121212; color: #eee; font-family: sans-serif; }
            .topo { background: #000; padding: 15px; border-bottom: 3px solid #ffee00; margin-bottom: 20px; position: sticky; top:0; z-index:100; }
            .card { background: #1e1e1e; border: 1px solid #333; transition: 0.3s; height: 100%; }
            .card:hover { border-color: #ffee00; transform: translateY(-3px); }
            .logo-img { height: 60px; object-fit: contain; width: 100%; background: #000; padding: 5px; border-radius: 5px; }
            .btn-watch { background: #ffee00; color: #000; font-weight: bold; width: 100%; border:none; margin-bottom: 5px; }
            .btn-copy { background: #333; color: #fff; width: 100%; border:none; font-size: 11px; }
            .badge-cat { font-size: 9px; color: #ffee00; text-transform: uppercase; letter-spacing: 1px; }
        </style>
    </head>
    <body>
    <div class="topo">
        <div class="container d-flex justify-content-between align-items-center">
            <h4 class="m-0 text-white">PLUTO <span style="color:#ffee00">TV</span></h4>
            <div>
                <button onclick="location.reload()" class="btn btn-outline-light btn-sm me-2">🔄 Recarregar</button>
                <a href="/lista.m3u" class="btn btn-warning btn-sm fw-bold">📥 LISTA M3U</a>
            </div>
        </div>
    </div>
    
    <div class="container pb-5">
        <div class="row g-2">
        ${canaisCache.map((ch) => {
            const linkPlay = `${baseUrl}/play/${ch.id}`;
            return `
            <div class="col-6 col-md-4 col-lg-2">
                <div class="card p-2 text-center">
                    <img src="${ch.logo}" class="logo-img mb-2" loading="lazy">
                    <div class="card-body p-0">
                        <small class="badge-cat d-block mb-1">${ch.categoria}</small>
                        <p class="text-truncate text-white fw-bold mb-2" style="font-size:12px;">${ch.nome}</p>
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
                alert('Link copiado! Pode colar no seu Player IPTV.');
            }).catch(err => {
                // Fallback para navegadores antigos
                const el = document.createElement('textarea');
                el.value = texto;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                alert('Link copiado!');
            });
        }
    </script>
    </body></html>`;
    res.send(html);
});

// ============================================================
// 3. REDIRECIONADOR (SEM ERRO DE DUPLICIDADE)
// ============================================================
app.get('/play/:id', (req, res) => {
    const canal = canaisCache.find(c => c.id === req.params.id);
    
    if (!canal) return res.status(404).send("Canal não encontrado ou offline.");

    // Redireciona diretamente para o link da Pluto. 
    // O Player cuidará dos parâmetros de sessão para evitar o erro "Duplicated sid"
    console.log(`▶️ Direcionando player para: ${canal.nome}`);
    res.redirect(302, canal.url);
});

// ============================================================
// 4. GERAÇÃO DE LISTA M3U
// ============================================================
app.get('/lista.m3u', (req, res) => {
    const host = req.headers.host;
    const protocolo = req.headers['x-forwarded-proto'] || 'http';
    
    let m3u = "#EXTM3U\n";
    canaisCache.forEach(ch => {
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-logo="${ch.logo}" group-title="${ch.categoria}",${ch.nome}\n${protocolo}://${host}/play/${ch.id}\n`;
    });
    
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', 'attachment; filename=pluto_render.m3u');
    res.send(m3u);
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Online!`);
    console.log(`📡 Porta: ${PORT}`);
});
