const express = require('express');
const cors = require('cors');
const path = require('path');
const { supabase } = require('./queue');
const { log } = require('./utils/logger'); // Adiciona o logger
const { connectPlatform } = require('./browser');

const app = express();
app.use(cors());
app.use(express.json());

// Serve os arquivos estáticos da pasta atual (index.html, script.js, style.css)
app.use(express.static(__dirname));

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
        await connectPlatform(userEmail, platform); // Esta função já abre o navegador com headless: false
        res.status(200).send({ status: 'success' });
    } catch (e) {
        console.error(e);
        res.status(500).send({ error: e.message });
    }
});

app.post('/start-auto-apply', async (req, res) => {
    const { jobData, userData } = req.body;
    try {
        const { error } = await supabase
            .from('job_applications')
            .insert([{ job_data: jobData, user_data: userData, status: 'queued' }]);

        if (error) throw error;
        log(`Vaga "${jobData.role}" para "${jobData.company}" adicionada à fila (Supabase).`, 'success');
        res.status(202).send({ status: 'queued' });
    } catch (error) {
        log(`Erro ao adicionar vaga à fila: ${error.message}`, 'error');
        res.status(500).send({ error: 'Erro ao adicionar vaga à fila.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    log(`🔥 Servidor de Automação rodando em http://localhost:${PORT}`, 'success');
});