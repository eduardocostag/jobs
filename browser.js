const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
puppeteer.use(StealthPlugin());
const { log } = require('./utils/logger'); // Adiciona o logger

async function getBrowserPage(userEmail, headless = true) {
    const userDataDir = path.join(__dirname, '../sessions', Buffer.from(userEmail).toString('base64'));
    log(`Lançando navegador para ${userEmail} (headless: ${headless}) com userDataDir: ${userDataDir}`, 'debug');
    const browser = await puppeteer.launch({
        headless,
        userDataDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-notifications',
            '--disable-popup-blocking',
            '--lang=pt-BR',
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setDefaultNavigationTimeout(60000); // 60 segundos de timeout
    return { page, browser };
}

async function connectPlatform(userEmail, platform) {
    const platformUrls = {
        gupy: 'https://gupy.io/login',
        linkedin: 'https://www.linkedin.com/login',
        indeed: 'https://br.indeed.com/account/login',
        infojobs: 'https://www.infojobs.com.br/login.aspx',
        glassdoor: 'https://www.glassdoor.com.br/member/login.htm'
    };

    const url = platformUrls[platform.toLowerCase()] || 'https://google.com';
    const { page } = await getBrowserPage(userEmail, false);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // O usuário loga manualmente aqui e a sessão é salva no userDataDir
    log(`Aguardando login manual na plataforma ${platform} para ${userEmail}. Por favor, complete o login no navegador que abriu.`, 'warn');
}

module.exports = { getBrowserPage, connectPlatform };