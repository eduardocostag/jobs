const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const { URL } = require('url'); // Importa o módulo URL
const path = require('path');
const fs = require('fs');
const { supabase } = require('./queue');
const { connectPlatform } = require('./browser');

const app = express();
app.use(cors());
app.use(express.json());

// Serve os arquivos estáticos da pasta atual (index.html, script.js, style.css)
app.use(express.static(__dirname));

let browser;

async function initBrowser() {
    // O 'userDataDir' permite que você salve o login do LinkedIn
    browser = await puppeteer.launch({
        headless: true, 
        userDataDir: './user_data',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
        // Se estiver no Codespaces e quiser ver o navegador para login inicial,
        // você precisará rodar localmente ou usar uma solução como Xvfb no Codespaces,
        // mas para automação headless, 'true' é o ideal.
        // Para login inicial no Codespaces, você pode mudar para 'false' e usar um VNC/SSH com X11 forwarding,
        // ou simplesmente fazer o login em sua máquina local e copiar o diretório user_data.
    });
}

// Rota explícita para o index.html (opcional, mas boa prática)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint genérico para login assistido em plataformas
app.post('/connect/platform', async (req, res) => {
    const { userEmail, platform } = req.body;
    if (!userEmail || !platform) {
        return res.status(400).send({ error: 'Email e plataforma são obrigatórios.' });
    }
    try {
        await connectPlatform(userEmail, platform);
        res.status(200).send({ status: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    }
});

app.post('/apply', async (req, res) => {
    const { url, company, userData } = req.body;
    console.log(`🚀 Iniciando candidatura para ${company}...`);

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        // 1. Tenta encontrar e clicar no botão de "Candidatar-se"
        const applySelectors = [
            '.jobs-apply-button', 
            'button.ia-IndeedApplyButton',
            'button[aria-label*="Candidatura"]',
            'button[aria-label*="Apply"]'
        ];

        for (const selector of applySelectors) {
            const btn = await page.$(selector);
            if (btn) {
                await btn.click();
                await new Promise(r => setTimeout(r, 2000)); // Espera o form abrir
                break;
            }
        }

        // 2. Sistema de Upload de Currículo
        if (userData && userData.cvData) {
            const cvBuffer = Buffer.from(userData.cvData.split(',')[1], 'base64');
            const tempCvPath = path.join(__dirname, 'temp_cv.pdf');
            fs.writeFileSync(tempCvPath, cvBuffer);

            const fileInputs = await page.$$('input[type="file"]');
            for (const input of fileInputs) {
                await input.uploadFile(tempCvPath);
                console.log(`📎 Currículo "${userData.cvName}" anexado com sucesso.`);
            }
            
            // Remove arquivo temporário após uso
            setTimeout(() => { if(fs.existsSync(tempCvPath)) fs.unlinkSync(tempCvPath); }, 10000);
        }

        // 2. Função auxiliar para preencher campos se existirem
        const fillIfPresent = async (selectors, value) => {
            for (const sel of selectors) {
                const field = await page.$(sel);
                if (field && value) {
                    await field.click({ clickCount: 3 }); // Seleciona texto existente
                    await field.press('Backspace');
                    await field.type(value, { delay: 50 }); // Simula digitação humana
                    return;
                }
            }
        };

        // 3. Preenchimento Automático
        if (userData) {
            await fillIfPresent(['input[name*="name"]', 'input[id*="first_name"]', 'input[autocomplete="name"]'], userData.name);
            await fillIfPresent(['input[type="email"]', 'input[name*="email"]'], userData.email);
            await fillIfPresent(['input[type="tel"]', 'input[name*="phone"]'], userData.phone || '11999999999');
            console.log(`📝 Campos preenchidos para ${company}`);
        }

        // Aguarda um pouco para simular preenchimento ou fechar
        await new Promise(r => setTimeout(r, 5000));
        await page.close();
        res.status(200).send({ status: 'success' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Erro ao processar vaga' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🔥 Servidor de Automação rodando em http://localhost:${PORT}`);
    initBrowser();
});