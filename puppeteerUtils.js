// /workspaces/jobs/utils/puppeteerUtils.js
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

/**
 * Preenche um campo seletor com um valor, se o campo estiver presente e visível.
 * @param {import('puppeteer').Page} page
 * @param {string[]} selectors - Array de seletores CSS para tentar encontrar o campo.
 * @param {string} value - O valor a ser preenchido.
 * @returns {Promise<boolean>} True se o campo foi preenchido, false caso contrário.
 */
async function fillIfPresent(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const field = await page.waitForSelector(sel, { timeout: 2000, visible: true });
      if (field && value) {
        await field.click({ clickCount: 3 }); // Seleciona texto existente
        await field.press('Backspace');
        await field.type(value, { delay: Math.floor(Math.random() * 100) + 50 }); // Simula digitação humana
        log(`Campo "${sel}" preenchido com "${value.substring(0, Math.min(value.length, 20))}..."`, 'debug');
        return true;
      }
    } catch (e) {
      // Selector not found or not visible, continue to next
    }
  }
  return false;
}

/**
 * Realiza o upload de um arquivo para um campo de input[type="file"].
 * @param {import('puppeteer').Page} page
 * @param {string} base64Data - Dados do arquivo em Base64 (ex: "data:application/pdf;base64,...").
 * @param {string} fileName - Nome do arquivo (ex: "curriculo.pdf").
 * @returns {Promise<boolean>} True se o upload foi bem-sucedido, false caso contrário.
 */
async function uploadFile(page, base64Data, fileName) {
  if (!base64Data || !fileName) {
    log('Dados do CV ou nome do arquivo ausentes para upload.', 'warn');
    return false;
  }

  const cvBuffer = Buffer.from(base64Data.split(',')[1], 'base64');
  const tempCvPath = path.join(__dirname, `temp_${Date.now()}_${fileName}`);
  fs.writeFileSync(tempCvPath, cvBuffer);
  log(`Arquivo temporário de CV criado em: ${tempCvPath}`, 'debug');

  try {
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000, visible: true });
    if (fileInput) {
      await fileInput.uploadFile(tempCvPath);
      log(`Currículo "${fileName}" anexado.`, 'success');
      return true;
    }
    log('Nenhum campo de upload de arquivo encontrado na página.', 'warn');
    return false;
  } catch (error) {
    log(`Erro ao fazer upload do currículo: ${error.message}`, 'error');
    return false;
  } finally {
    setTimeout(() => { if (fs.existsSync(tempCvPath)) fs.unlinkSync(tempCvPath); }, 5000);
  }
}

async function humanDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  log(`Aguardando ${delay / 1000} segundos para simular comportamento humano.`, 'debug');
  await new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = { fillIfPresent, uploadFile, humanDelay };