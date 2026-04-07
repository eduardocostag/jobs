const { supabase } = require('./queue');
const { getBrowserPage } = require('./services/browser');
const { decideToApply } = require('./services/ai');
const { applyToGupyJob } = require('./services/gupy');
const { getNextActionWithAI } = require('./services/ai');

async function runWorker() {
    console.log('🤖 Verificando fila no Supabase...');

    // Busca uma candidatura pendente
    const { data: jobs, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        console.error('Erro ao buscar jobs:', error);
    } else if (jobs && jobs.length > 0) {
        const job = jobs[0];
        const { job_data: jobData, user_data: userData } = job;

        // Marcar como processando para evitar duplicidade
        await supabase.from('job_applications').update({ status: 'processing' }).eq('id', job.id);

        console.log(`🚀 Processando vaga: ${jobData.company} - ${jobData.role}`);

        // 1. IA analisa se vale a pena
        if (!decideToApply(jobData, userData)) {
            await supabase.from('job_applications').update({ status: 'skipped' }).eq('id', job.id);
            return runWorker();
        }

        // 2. Browser invisível com sessão salva
        const { page, browser } = await getBrowserPage(userData.email, true);
        
        try {
            if (jobData.apply_link.includes('gupy.io')) {
                await applyToGupyJob(page, jobData, userData);
            }
            await supabase.from('job_applications').update({ status: 'completed' }).eq('id', job.id);
        } catch (err) {
            console.error('Erro na automação:', err);
            await supabase.from('job_applications').update({ status: 'failed' }).eq('id', job.id);
        } finally {
            await browser.close();
        }
    }

    // Aguarda 5 segundos antes da próxima verificação
    setTimeout(runWorker, 5000);
}

runWorker();
console.log('🤖 Worker de Autocandidatura iniciado (Supabase Polling)');