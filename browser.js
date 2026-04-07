const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
puppeteer.use(StealthPlugin());

async function getBrowserPage(userEmail, headless = true) {
    const userDataDir = path.join(__dirname, '../sessions', Buffer.from(userEmail).toString('base64'));
    const browser = await puppeteer.launch({
        headless,
        userDataDir,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    return { page, browser };
}

async function connectPlatform(userEmail, platform) {
    const platformUrls = {
        gupy: 'https://gupy.io/login',
        linkedin: 'https://www.linkedin.com/login',
        indeed: 'https://br.indeed.com/account/login',
        infojobs: 'https://www.infojobs.com.br/login.aspx'
    };

    const url = platformUrls[platform.toLowerCase()] || 'https://google.com';
    const { page } = await getBrowserPage(userEmail, false);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // O usuário loga manualmente aqui e a sessão é salva no userDataDir
    console.log(`Aguardando login manual na plataforma ${platform} para ${userEmail}`);
}

module.exports = { getBrowserPage, connectPlatform };