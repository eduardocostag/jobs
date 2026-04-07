const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyDaBTk7liYKoLpP9nPUYQd1aaOzisRN4tw");

/**
 * Usa IA para decidir a próxima ação na página baseada no HTML simplificado.
 */
async function getNextActionWithAI(pageHtml, jobDescription) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
        Você é um assistente de automação de candidaturas.
        HTML da página: ${pageHtml.substring(0, 2000)}
        Descrição da vaga: ${jobDescription.substring(0, 500)}

        Analise o HTML e retorne um JSON com a próxima ação:
        1. "click": { "selector": "seletor_css" }
        2. "type": { "selector": "seletor_css", "value": "email|nome|telefone" }
        3. "upload": { "selector": "seletor_css" }
        4. "success": { "message": "Candidatura concluída" }

        Apenas o JSON, sem explicações.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return JSON.parse(response.text());
    } catch (error) {
        console.error("Erro na IA:", error);
        return null;
    }
}

module.exports = { getNextActionWithAI };