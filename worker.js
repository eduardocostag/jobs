const { supabase } = require('./queue');
const { getBrowserPage } = require('./services/browser');
const { decideToApply, getNextActionWithAI } = require('./services/ai');
const { applyToGupyJob } = require('./services/gupy');
const { humanDelay, fillIfPresent, uploadFile } = require('./utils/puppeteerUtils');
const { log } = require('./utils/logger');

async function runWorker() {
    log('🤖 Verificando fila no Supabase...', 'info');

    // Busca uma candidatura pendente
    const { data: jobs, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true }) // Processa os mais antigos primeiro
        .limit(1);

    if (error) {
        log(`Erro ao buscar jobs: ${error.message}`, 'error');
    } else if (jobs && jobs.length > 0) {
        const job = jobs[0];
        const { job_data: jobData, user_data: userData } = job;

        // Marcar como processando para evitar duplicidade
        const { error: updateError } = await supabase.from('job_applications').update({ status: 'processing' }).eq('id', job.id);
        if (updateError) {
            log(`Erro ao atualizar status para 'processing' para job ${job.id}: ${updateError.message}`, 'error');
            return setTimeout(runWorker, 5000); // Tenta novamente após um atraso
        }

        log(`🚀 Processando vaga: ${jobData.company} - ${jobData.role} (ID: ${job.id})`, 'info');

        // Simular delay humano antes de iniciar a automação
        await humanDelay(5000, 15000); // 5 a 15 segundos

        // 1. IA analisa se vale a pena
        if (!decideToApply(jobData, userData)) {
            await supabase.from('job_applications').update({ status: 'skipped' }).eq('id', job.id); // Marca como skipped
            log(`Vaga ${job.id} ignorada pela IA (match baixo).`, 'info');
            return setTimeout(runWorker, 5000);
        }

        // 2. Browser invisível com sessão salva
        const { page, browser } = await getBrowserPage(userData.email, true);
        
        try {
            await page.goto(jobData.apply_link, { waitUntil: 'networkidle2', timeout: 60000 });
            await humanDelay();

            if (jobData.apply_link.includes('gupy.io')) {
                await applyToGupyJob(page, jobData, userData);
            }
            else {
                // Lógica genérica com IA para outras plataformas (LinkedIn, Indeed, etc.)
                log(`Iniciando automação genérica com IA para ${jobData.platform || 'Outro'}`, 'info');
                let action = null;
                let attempts = 0;
                while (action?.success?.message !== 'Candidatura concluída' && attempts < 5) { // Limita tentativas
                    const htmlContent = await page.content();
                    action = await getNextActionWithAI(htmlContent, jobData.description);
                    if (action?.click) await page.click(action.click.selector);
                    if (action?.type) await fillIfPresent(page, [action.type.selector], userData[action.type.value]);
                    if (action?.upload) await uploadFile(page, userData.cvData, userData.cvName);
                    await humanDelay(2000, 5000); // Pequeno delay entre ações da IA
                    attempts++;
                }
            }
            await supabase.from('job_applications').update({ status: 'completed' }).eq('id', job.id); // Marca como concluído
            log(`Candidatura para job ${job.id} concluída com sucesso.`, 'success');
        } catch (err) {
            log(`Erro na automação para job ${job.id}: ${err.message}`, 'error');
            await supabase.from('job_applications').update({ status: 'failed' }).eq('id', job.id);
        } finally {
            await browser.close();
        }
    }

    // Aguarda 5 segundos antes da próxima verificação
    setTimeout(runWorker, 5000);
}

runWorker();
log('🤖 Worker de Autocandidatura iniciado (Supabase Polling)', 'success');