// ============================================================
// DATA
// ============================================================
// Removendo mock estático para usar fetch dinâmico
const RAPID_API_KEY = 'SUA_CHAVE_AQUI'; // Obtenha em rapidapi.com (necessário para JSearch)
const BACKEND_URL = 'http://localhost:3000'; // URL do seu novo backend
// Novas fontes (Exemplo Adzuna - precisa de cadastro no site deles)
const ADZUNA_APP_ID = 'SEU_ID_AQUI'; // Substitua pelo seu ID real da Adzuna
const ADZUNA_APP_KEY = '412290ed5ee2e5327038534944d660f9'; // Substitua pela sua chave real da Adzuna

const REMOTIVE_API_URL = 'https://remotive.com/api/remote-jobs';
const ARBEITNOW_API_URL = 'https://www.arbeitnow.com/api/job-board-api';

let JOBS = [];

const SKILLS_LIST = ['React','TypeScript','JavaScript','Node.js','Vue.js','Angular','Python','Java','AWS','Docker','GraphQL','REST API','CSS','HTML','Git','Redux','Next.js','PostgreSQL','MongoDB','Figma'];

let state = {
  currentUser: null,
  jobQueue: [],
  currentCardIdx: 0,
  applied: [],
  applicationQueue: [], // Vagas na fila para processamento
  isProcessingQueue: false,
  selectedSkills: [],
  cvName: null,
  cvData: null, // Base64 do PDF
  showInternational: false,
  desiredRoles: [],
  desiredModes: ['Remoto', 'Híbrido'],
  minSalary: 5000
};

// ============================================================
// API INTEGRATION (Mock de busca real)
// ============================================================
async function fetchRealJobs() {
  if (!state.currentUser || (state.desiredRoles.length === 0 && !state.currentUser.role)) {
    showToast('⚠️ Configure seus cargos desejados no perfil primeiro.', 'warning');
    return;
  }

  let allJobsRaw = [];
  let fetchPromises = [];
  
  try {
    // Busca baseada no cargo do usuário
    const role = state.desiredRoles.length > 0 ? state.desiredRoles[0] : (state.currentUser.role || "Desenvolvedor");
    const searchTerm = state.showInternational ? role : `vagas de emprego ${role}`;
    const locationQuery = state.showInternational ? "" : " no Brasil";
    const adzunaCountry = state.showInternational ? "us" : "br"; // Exemplo: busca nos EUA se internacional

    // Só adiciona fontes de API se o usuário ativar a opção Internacional
    if (state.showInternational) {
      showLoading('Buscando vagas internacionais...');
      
      // JSearch
      fetchPromises.push(
        fetch(`https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(searchTerm + locationQuery)}&num_pages=1&language=pt`, {
          method: 'GET',
          headers: { 'X-RapidAPI-Key': RAPID_API_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' }
        })
        .then(res => res.json())
        .then(data => data.data.map(job => ({
          id: `jsearch-${job.job_id}`,
          company: job.employer_name,
          role: job.job_title,
          location: job.job_city || 'Remoto',
          salary: job.job_min_salary ? `R$ ${job.job_min_salary}` : 'A combinar',
          description: job.job_description,
          apply_link: job.job_apply_link,
          icon: 'briefcase'
        })))
        .catch(err => { console.error("Erro JSearch:", err); return []; })
      );

      // Adzuna
      fetchPromises.push(
        fetch(`https://api.adzuna.com/v1/api/jobs/${adzunaCountry}/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=20&what=${encodeURIComponent(searchTerm)}`)
        .then(res => res.json())
        .then(data => data.results.map(job => ({
          id: `adzuna-${job.id}`,
          company: job.company.display_name,
          role: job.title,
          location: job.location.display_name,
          salary: job.salary_min ? `R$ ${(job.salary_min / 12).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}` : 'A combinar',
          description: job.description,
          apply_link: job.redirect_url,
          icon: 'zap'
        })))
        .catch(err => { console.error("Erro Adzuna:", err); return []; })
      );

      // Outras fontes...
      fetchPromises.push(
        fetch(`https://remotive.com/api/remote-jobs?category=software-dev&limit=20`)
        .then(res => res.json())
        .then(data => data.jobs.map(job => ({
          id: `remotive-${job.id}`,
          company: job.company_name,
          role: job.title,
          location: 'Remoto 🌎',
          salary: job.salary || 'Não informado',
          description: job.description.replace(/<[^>]*>?/gm, ''),
          apply_link: job.url,
          icon: 'globe'
        })))
        .catch(err => { console.error("Erro Remotive:", err); return []; })
      );
    }
    else {
      showLoading('Buscando vagas nas plataformas conectadas...');
      // Placeholder: Aqui o sistema chamará o backend para fazer o scraping das contas conectadas
      // allJobsRaw = await fetchBrazilianJobsFromScrapers();
    }

    // Executa todas as chamadas de API em paralelo
    const results = await Promise.allSettled(fetchPromises);

    // Coleta os resultados bem-sucedidos
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        allJobsRaw = allJobsRaw.concat(result.value);
      }
    });

    // Remove duplicatas (se houver)
    const uniqueJobsMap = new Map();
    allJobsRaw.forEach(job => {
      if (!uniqueJobsMap.has(job.id)) {
        uniqueJobsMap.set(job.id, job);
      }
    });
    const uniqueJobs = Array.from(uniqueJobsMap.values());

    // Filtro local adicional para garantir Brasil se não for internacional
    let filteredJobs = [];
    if (!state.showInternational) {
      filteredJobs = uniqueJobs.filter(j => 
        // Critério mais rigoroso: deve ser em português E mencionar Brasil/Remoto (ou ser remoto global)
        isPortuguese(j.description || "", j.role || "") &&
        (j.location.toLowerCase().includes('brasil') || j.location.toLowerCase().includes('brazil') || j.location.toLowerCase().includes('remoto'))
      );
    } else {
      filteredJobs = uniqueJobs;
    }

    // Se não encontrou vagas brasileiras e não é internacional, tenta buscar internacionalmente
    if (filteredJobs.length === 0 && !state.showInternational) {
      showToast('⚠️ Nenhuma vaga brasileira encontrada. Tente buscar internacionalmente.', 'warning');
    }

    // Normalização do Match e Skills para o estado
    state.jobQueue = filteredJobs.map(job => ({
      ...job,
      description: job.description.substring(0, 250) + '...',
      skills: extractSkills(job.description),
      match: calculateMatch(job),
      level: job.role.toLowerCase().includes('senior') ? 'Sênior' : 'Pleno/Junior'
    }));
    renderCards();
  } catch (error) {
    showToast('❌ Erro ao conectar com provedores', 'error');
  } finally {
    hideLoading();
  }
}

// Função para detectar se o texto está em português (heurística simples)
function isPortuguese(text, title = '') {
  const fullText = (text + " " + title).toLowerCase(); // Inclui título na análise
  // Lista de palavras que raramente aparecem em descrições em inglês
  const ptWords = ['vaga', 'requisitos', 'experiência', 'benefícios', 'trabalho', 'conhecimento', 'desejável', 'currículo', 'clt', 'pj', 'salário', 'formação', 'atuação'];
  // Palavras que indicam fortemente que a vaga é em inglês
  const enWords = ['requirements', 'responsibilities', 'benefits', 'apply', 'experience', 'skills'];
  
  const ptMatches = ptWords.filter(word => fullText.includes(word)).length;
  const enMatches = enWords.filter(word => fullText.includes(word)).length;

  // Aceita se tiver mais de 2 palavras em PT e menos de 2 em EN (para evitar falsos positivos)
  // Aumentamos o limiar para 3 palavras PT para ser mais rigoroso
  return ptMatches >= 3 && enMatches < 2;
}

// Lógica simples para extrair skills da descrição
function extractSkills(desc) {
  return SKILLS_LIST.filter(skill => desc.toLowerCase().includes(skill.toLowerCase())).slice(0, 5);
}

function calculateMatch(job) {
  const jobSkills = extractSkills(job.description + job.role);
  const userSkills = state.selectedSkills || [];
  
  if (userSkills.length === 0) return Math.floor(Math.random() * 20) + 60;
  
  const intersection = jobSkills.filter(s => userSkills.includes(s));
  const score = 65 + (intersection.length / Math.max(jobSkills.length, 1)) * 34;
  return Math.floor(Math.min(score, 99));
}

function loadPersistedData() {
  const saved = localStorage.getItem('jobmatch_state');
  if (saved) {
    const parsed = JSON.parse(saved);
    state = { ...state, ...parsed };
    return true;
  }
  return false;
}

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i)=> t.classList.toggle('active', (tab==='login'&&i===0)||(tab==='register'&&i===1)));
  document.getElementById('login-form').style.display = tab==='login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab==='register' ? 'block' : 'none';
}

function doLogin() {
  const email = document.getElementById('login-email').value || 'usuario@jobmatch.ai';
  if (!email) { showToast('❌ Informe seu email','error'); return; }
  state.currentUser = { name: 'Usuário', email };
  enterApp();
}

function doRegister() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  if (!name || !email) { showToast('❌ Informe nome e email','error'); return; }
  state.currentUser = { name, email };
  enterApp();
}

function oauthLogin(provider) {
  showToast(`🔑 Conectando ao ${provider}...`,'');
  setTimeout(()=>{
    state.currentUser = { name: provider==='Google' ? 'João Silva' : 'Ana Lima', email:`user@${provider.toLowerCase()}.com` };
    enterApp();
  }, 1200);
}

function enterApp() {
  state.currentUser.role = state.desiredRoles.length > 0 ? state.desiredRoles.join(', ') : 'Developer';
  state.currentUser.city = state.currentUser.city || 'São Paulo';
  state.currentUser.salary = state.currentUser.salary || 'A combinar';
  document.getElementById('profile-hero-name').textContent = state.currentUser.name;
  document.getElementById('profile-hero-role').textContent = `${state.currentUser.role} • ${state.currentUser.city}`;
  saveState();
  switchScreen('screen-main');
  switchView('swipe-area');
  if (state.jobQueue.length === 0) fetchRealJobs();
  else renderCards();
  startWorker(); // Inicia o processador de fila
}

function logout() {
  state = { currentUser:null, jobQueue:[...JOBS], currentCardIdx:0, applied:[], selectedSkills:[], desiredRoles:[], desiredModes:['Remoto','Híbrido'], minSalary:5000, cvName:null };
  switchScreen('screen-auth');
  saveState(); // Limpa o estado salvo
  showToast('👋 Até logo!','');
}

// Nova função genérica para conectar plataformas (login assistido)
async function connectPlatformAccount(platform) {
  if (!state.currentUser || !state.currentUser.email) {
    showToast('❌ Faça login no App primeiro.', 'error');
    return;
  }
  showToast(`Abrindo navegador para login manual no ${platform}...`, 'info');
  
  fetch(`${BACKEND_URL}/connect/platform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      userEmail: state.currentUser.email,
      platform: platform
    })
  }).then(res => {
    if (res.ok) showToast('Navegador aberto. Faça o login e feche-o para salvar a sessão.', 'success');
  });
}

function handleCvUpload(input, isFromProfile = false) {
  const file = input.files[0];
  if (!file || file.type !== 'application/pdf') {
    showToast('❌ Por favor, selecione um arquivo PDF', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    state.cvData = e.target.result; // Armazena o Base64
    state.cvName = file.name;
    saveState();
    showToast('📄 Currículo carregado e pronto para envio!', 'success');
  };
  reader.readAsDataURL(file);

  const statusText = isFromProfile ? document.getElementById('profile-cv-info') : document.getElementById('cv-status-text');
  if (isFromProfile) {
    statusText.innerHTML = `<span>✅ CV: <strong>${file.name}</strong></span>`;
  } else {
    statusText.innerHTML = `<strong>${file.name}</strong> pronto para envio!`;
    document.getElementById('cv-upload-box').style.borderColor = 'var(--green)';
  }
}

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s=> s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function switchView(id) {
  document.getElementById('swipe-area').style.display='none';
  document.getElementById('dashboard-view').classList.remove('active');
  document.getElementById('profile-view').classList.remove('active');
  document.querySelectorAll('.bnav-btn').forEach(b=>b.classList.remove('active'));
  if (id==='swipe-area') {
    document.getElementById('swipe-area').style.display='flex';
    document.getElementById('bnav-swipe').classList.add('active');
  } else if (id==='dashboard-view') {
    document.getElementById('dashboard-view').classList.add('active');
    document.getElementById('bnav-dash').classList.add('active');
  } else if (id==='profile-view') {
    document.getElementById('profile-view').classList.add('active');
    document.getElementById('bnav-profile').classList.add('active');
  }
  lucide.createIcons();
}

function renderCards() {
  const stack = document.getElementById('card-stack');
  stack.innerHTML = '';
  const remaining = state.jobQueue.slice(state.currentCardIdx);
  document.getElementById('remaining-count').textContent = `${remaining.length} vaga${remaining.length!==1?'s':''} restante${remaining.length!==1?'s':''}`;
  if (remaining.length === 0) {
    stack.innerHTML = `<div class="empty-state"><i data-lucide="check-circle-2"></i><h3>Você viu tudo!</h3><p>Novas vagas são adicionadas diariamente. Volte amanhã!</p><button class="btn-primary" style="margin-top:16px;width:auto;padding:12px 24px" onclick="resetQueue()">Reiniciar Busca</button></div>`;
    lucide.createIcons();
    return;
  }
  const show = Math.min(3, remaining.length);
  for (let i=show-1; i>=0; i--) stack.appendChild(createCard(remaining[i], i));
  const topCard = stack.querySelector('.card-top');
  if (topCard) setupDrag(topCard);
}

function createCard(job, stackPos) {
  const matchClass = job.match>=85 ? 'match-high' : job.match>=70 ? 'match-mid' : 'match-low';
  const card = document.createElement('div');
  card.className = `job-card ${stackPos===0?'card-top':stackPos===1?'card-2':'card-3'}`;
  card.dataset.id = job.id;
  const skillsHTML = job.skills.map(s=> `<span class="card-skill ${state.selectedSkills.includes(s)?'match':''}">${s}</span>`).join('');
  card.innerHTML = `
    <div class="swipe-label label-like">LIKE ❤️</div>
    <div class="swipe-label label-nope">✕ NOPE</div>
    <div class="card-company-row">
      <div class="company-logo"><i data-lucide="${job.icon}"></i></div>
      <div class="company-info"><h3>${job.company}</h3><h2>${job.role}</h2></div>
      <div class="match-badge ${matchClass}">${job.match}%</div>
    </div>
    <div class="card-divider"></div>
    <div class="card-meta">
      <span class="meta-tag"><i data-lucide="map-pin"></i> ${job.location}</span>
      <span class="meta-tag level"><i data-lucide="bar-chart-2"></i> ${job.level}</span>
      ${job.remote ? '<span class="meta-tag remote"><i data-lucide="wifi"></i> Remoto</span>' : ''}
    </div>
    <div class="card-salary">${job.salary} <span>/ mês</span></div>
    <div class="card-skills">${skillsHTML}</div>
    <div class="card-description">${job.description}</div>
    <div class="card-bar"><div class="card-bar-fill" style="width:${job.match}%"></div></div>
    <div class="card-bar-label"><span>Match com seu perfil</span><span>${job.match}%</span></div>`;
  if (stackPos===0) card.style.animation = 'cardIn 0.4s ease';
  return card;
}

let dragState = { dragging:false, startX:0, startY:0, curX:0, card:null };
function setupDrag(card) {
  card.addEventListener('mousedown', dragStart);
  card.addEventListener('touchstart', dragStart, {passive:true});
}
function dragStart(e) {
  dragState.dragging = true;
  dragState.card = e.currentTarget;
  const pt = e.touches ? e.touches[0] : e;
  dragState.startX = pt.clientX; dragState.startY = pt.clientY;
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchmove', dragMove, {passive:false});
  document.addEventListener('touchend', dragEnd);
}
function dragMove(e) {
  if (!dragState.dragging) return;
  if (e.cancelable) e.preventDefault();
  const pt = e.touches ? e.touches[0] : e;
  dragState.curX = pt.clientX - dragState.startX;
  const curY = pt.clientY - dragState.startY;
  dragState.card.style.transform = `translateX(${dragState.curX}px) translateY(${curY}px) rotate(${dragState.curX * 0.08}deg)`;
  dragState.card.style.transition = 'none';
  const ratio = Math.abs(dragState.curX)/120;
  dragState.card.querySelector('.label-like').style.opacity = dragState.curX > 20 ? Math.min(ratio,1) : 0;
  dragState.card.querySelector('.label-nope').style.opacity = dragState.curX < -20 ? Math.min(ratio,1) : 0;
}
function dragEnd() {
  if (!dragState.dragging) return;
  dragState.dragging = false;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
  document.removeEventListener('touchmove', dragMove);
  document.removeEventListener('touchend', dragEnd);
  if (dragState.curX > 100) swipeCard('right');
  else if (dragState.curX < -100) swipeCard('left');
  else {
    dragState.card.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
    dragState.card.style.transform = '';
    dragState.card.querySelector('.label-like').style.opacity=0;
    dragState.card.querySelector('.label-nope').style.opacity=0;
  }
}
function swipeCard(direction) {
  const topCard = document.querySelector('.card-top');
  if (!topCard) return;
  topCard.classList.add(direction==='right' ? 'swiping-right' : 'swiping-left');
  if (direction==='right') applyToJob(state.jobQueue[state.currentCardIdx]);
  setTimeout(()=>{ state.currentCardIdx++; renderCards(); lucide.createIcons(); }, 380);
}

// ============================================================
// AUTOMATION WORKER (O "Cérebro" da aplicação)
// ============================================================
function applyToJob(job) {
  // Adiciona à fila BullMQ via backend
  if (state.applicationQueue.find(j => j.id === job.id)) return;

  // Correção de Fuso Horário: Garantindo que o timestamp e a data sigam o horário local
  const now = new Date();
  state.applicationQueue.push({ 
    ...job, 
    queuedAt: now.getTime(),
    localDate: now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  });
  saveState();
  showToast(`📥 ${job.company} adicionada à fila de aplicação`,'success');
  updateDashboard();
}

function startWorker() {
  if (state.isProcessingQueue) return;
  state.isProcessingQueue = true;

  const processNext = async () => {
    if (state.applicationQueue.length > 0) {
      const job = state.applicationQueue.shift();
      console.log(`🚀 Enviando para automação SaaS: ${job.company}`);

      try {
        const res = await fetch(`${BACKEND_URL}/start-auto-apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            jobData: job,
            userData: {
              ...state.currentUser,
              cvData: state.cvData,
              cvName: state.cvName,
              selectedSkills: state.selectedSkills,
              desiredRoles: state.desiredRoles,
              // Enviamos a data correta para o worker
              applicationDate: job.localDate 
            }
          })
        });

        if (res.ok) showToast(`🤖 IA processando sua vaga na ${job.company}...`, 'success');
      } catch (err) { console.error(err); }
    }
    setTimeout(processNext, 5000);
  };
  processNext();
}

function resetQueue() { state.currentCardIdx = 0; fetchRealJobs(); }
function openDetail() {
  const job = state.jobQueue[state.currentCardIdx]; if (!job) return;
  document.getElementById('modal-company-badge').innerHTML = `<i data-lucide="${job.icon}" style="width:40px; height:40px"></i>`;
  document.getElementById('modal-job-title').textContent = job.role;
  document.getElementById('modal-company-name').textContent = `${job.company} • ${job.level}`;
  document.getElementById('modal-location').textContent = job.location;
  document.getElementById('modal-salary').textContent = job.salary + '/mês';
  document.getElementById('modal-description').textContent = job.description;
  document.getElementById('modal-match-bar').style.width = job.match+'%';
  document.getElementById('modal-match-pct').textContent = job.match+'%';
  document.getElementById('modal-skills').innerHTML = job.skills.map(s=>`<span class="card-skill ${state.selectedSkills.includes(s)?'match':''}">${s}</span>`).join('');
  openModal('detail-modal'); lucide.createIcons();
}
function applyFromModal() { const job = state.jobQueue[state.currentCardIdx]; if (job) { applyToJob(job); closeModal('detail-modal'); swipeCard('right'); } }
function updateDashboard() {
  const list = document.getElementById('applications-list');
  if (state.applied.length===0 && state.applicationQueue.length===0) { list.innerHTML = `<div class="empty-state" style="padding:30px"><i data-lucide="clipboard-list"></i><p>Suas candidaturas aparecerão aqui</p></div>`; lucide.createIcons(); return; }
  const statusMap = { sent:'status-sent', viewed:'status-viewed', process:'status-process', rejected:'status-rejected', queued:'status-viewed' };
  const statusLabel = { sent:'Enviado', viewed:'Visualizado', process:'Em processo', rejected:'Rejeitado', queued: 'Na fila (IA)' };

  const queueHtml = state.applicationQueue.map(app => `
    <div class="app-item" style="opacity: 0.7; border-left: 3px solid var(--accent)">
      <div class="app-logo"><i data-lucide="cpu" style="width:20px"></i></div>
      <div class="app-info"><div class="app-role">${app.role}</div><div class="app-company">${app.company} • Aguardando...</div></div>
      <span class="app-status ${statusMap.queued}">${statusLabel.queued}</span>
    </div>`).join('');

  const appliedHtml = state.applied.slice().reverse().map(app=>`
    <div class="app-item">
      <div class="app-logo"><i data-lucide="${app.icon}" style="width:20px"></i></div>
      <div class="app-info"><div class="app-role">${app.role}</div><div class="app-company">${app.company} • ${app.date}</div></div>
      <span class="app-status ${statusMap[app.status]}">${statusLabel[app.status]}</span>
    </div>`).join('');

  list.innerHTML = queueHtml + appliedHtml;
  lucide.createIcons();
}
function updateStatApplied() { document.getElementById('stat-applied').textContent = state.applied.length; }
function init() { if (loadPersistedData() && state.currentUser) { document.getElementById('profile-hero-name').textContent = state.currentUser.name; document.getElementById('profile-hero-role').textContent = `${state.currentUser.role} • ${state.currentUser.city}`; switchScreen('screen-main'); switchView('swipe-area'); renderCards(); updateDashboard(); updateStatApplied(); } }
function saveState() { localStorage.setItem('jobmatch_state', JSON.stringify(state)); }
function openFilter() { document.getElementById('filter-panel').classList.add('open'); }
function closeFilter() { document.getElementById('filter-panel').classList.remove('open'); }
function toggleChip(el) { el.classList.toggle('active'); }
function toggleGeo(isInternational) {
  state.showInternational = isInternational;
  document.getElementById('btn-geo-br').classList.toggle('active', !isInternational);
  document.getElementById('btn-geo-int').classList.toggle('active', isInternational);
}
function updateSalaryLabel() { document.getElementById('salary-label').textContent = `R$ ${parseInt(document.getElementById('salary-range').value).toLocaleString('pt-BR')}`; }
function applyFilters() { closeFilter(); fetchRealJobs(); showToast('✅ Filtros aplicados!','success'); }
function openModal(id) { document.getElementById(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = 'auto'; }
let toastTimer = null;
function showToast(msg, type='') {
  const toast = document.getElementById('toast'); toast.textContent = msg; toast.className = `toast show ${type}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ toast.classList.add('hide'); setTimeout(()=>{ toast.className='toast'; },300); },2800);
}
document.addEventListener('keydown', e=>{ if (document.getElementById('screen-main').classList.contains('active')) { if (e.key==='ArrowRight') swipeCard('right'); if (e.key==='ArrowLeft') swipeCard('left'); if (e.key==='i'||e.key==='I') openDetail(); } });
document.addEventListener('DOMContentLoaded', () => { init(); lucide.createIcons(); });