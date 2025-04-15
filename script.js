// script.js (Versión completa - 2024-07-24 v8 - Corregido configSnapshot.exists)

// --- Variables Globales y Configuración ---
const firebaseConfig = {
    apiKey: "AIzaSyAVBHUX8Ey9lLUCiz6mNDOemrNfrR-3Szs", // Clave API del usuario
    authDomain: "presupuestadorcortelaser.firebaseapp.com",
    projectId: "presupuestadorcortelaser",
    storageBucket: "presupuestadorcortelaser.firebasestorage.app",
    messagingSenderId: "159566854109",
    appId: "1:159566854109:web:8d7351cef717697f3ea834"
};
const SUPER_ADMIN_UID = 'WirMlSEvm5UdlAkns4KNr7ND0wr1'; // UID Super Admin del usuario
// TIMEZONE ya no se usa activamente con el manejo de fechas revertido

// Variables de estado y datos globales
let db;
let auth;
let materialsData = {};
let configData = { cost_per_minute: 0, minutes_per_month: 2400, monthly_costs: {} };
let clientsData = {};
let jobsData = [];
let currentUser = null;
let currentUserRole = null;
let currentJobQuoteBaseCost = 0;
let dataLoaded = { clients: false, jobs: false, materials: false, config: false };
let activeSectionId = 'home';

// --- Inicialización de Firebase ---
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Firebase inicializado correctamente.");
    } else {
        firebase.app();
        console.log("Firebase ya estaba inicializado.");
    }
    db = firebase.firestore();
    auth = firebase.auth();
} catch (error) {
    console.error("Error Crítico - Inicialización de Firebase:", error);
    alert("Error crítico: No se pudo inicializar la conexión con la base de datos.");
    document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red;">Error Crítico: No se pudo conectar a Firebase.</div>`;
}

// --- Funciones: Navegación y Autenticación ---
function navigateTo(targetId) {
    console.log(`Navegando a: ${targetId}`);
    activeSectionId = targetId;
    document.querySelectorAll('#section-content-container .main-section').forEach(s => s.classList.remove('active-section'));
    document.querySelectorAll('#sidebar li').forEach(item => item.classList.remove('active'));
    const sectionToShow = document.getElementById(targetId);
    if (sectionToShow) {
        sectionToShow.classList.add('active-section');
        const activeLink = document.querySelector(`#sidebar a[data-target='${targetId}']`)?.closest('li');
        if (activeLink) {
            activeLink.classList.add('active');
        } else if (targetId === 'new-job-form') {
            document.querySelector(`#sidebar a[data-target='jobs']`)?.closest('li')?.classList.add('active');
        }
        loadDataForSection(targetId);
    } else {
        console.error(`Sección '${targetId}' N/E.`);
        navigateTo('home');
    }
}

function showLoginSection() {
    console.log("Mostrando login");
    navigateTo('login');
    const form = document.getElementById('login-form'); if (form) form.reset();
    const errDiv = document.getElementById('login-error'); if (errDiv) showFeedback(errDiv, '', 'info');
}

auth?.onAuthStateChanged(user => {
    if (!auth) { console.error("Auth listener: Auth N/D."); showLoginSection(); document.body.className = 'public-only'; return; }
    console.log("Auth state:", user ? user.uid : 'null');
    currentUser = user; const uSpan = document.getElementById('user-email');
    document.body.classList.remove('logged-in', 'role-superadmin', 'role-operator', 'public-only');
    if (user) {
        currentUserRole = (user.uid === SUPER_ADMIN_UID) ? 'superadmin' : 'operator';
        console.log("Role:", currentUserRole); document.body.classList.add('logged-in', `role-${currentUserRole}`);
        if (uSpan) uSpan.textContent = user.email;
        loadInitialDataForLoggedInUser().then(() => {
            console.log("Datos iniciales OK post-login.");
            if (activeSectionId === 'home' || activeSectionId === 'login' || !document.getElementById(activeSectionId)) navigateTo('jobs'); else navigateTo(activeSectionId);
        }).catch(error => { console.error("Error carga inicial:", error); const fbA = document.getElementById('job-form-feedback') || document.body; showFeedback(fbA, "Error carga datos.", 'error'); navigateTo('home'); });
    } else {
        console.log("Usuario desconectado."); currentUserRole = null; document.body.classList.add('public-only');
        if (uSpan) uSpan.textContent = ''; clearLocalDataCache(); navigateTo('home');
    }
});

function clearLocalDataCache() { materialsData = {}; clientsData = {}; jobsData = []; configData = { cost_per_minute: 0, minutes_per_month: 2400, monthly_costs: {} }; dataLoaded = { clients: false, jobs: false, materials: false, config: false }; console.log("Caché local limpiada."); }

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const errDiv = document.getElementById('login-error'); if (!auth) { showFeedback(errDiv, "Error: Auth N/D.", 'error'); return; }
    const email = document.getElementById('login-email').value; const password = document.getElementById('login-password').value; showFeedback(errDiv, '', 'info');
    const sb = e.target.querySelector('button[type="submit"]'); if (sb) { sb.disabled = true; sb.textContent = 'Entrando...'; }
    try { await auth.signInWithEmailAndPassword(email, password); } catch (error) {
        console.error("Error login:", error.code); let msg = 'Error desconocido.';
        switch (error.code) { case 'auth/user-not-found': case 'auth/wrong-password': case 'auth/invalid-credential': msg = 'Email/pass incorrectos.'; break; case 'auth/invalid-email': msg = 'Email inválido.'; break; case 'auth/user-disabled': msg = 'Usuario deshabilitado.'; break; case 'auth/too-many-requests': msg = 'Demasiados intentos.'; break; }
        showFeedback(errDiv, msg, 'error'); if (sb) { sb.disabled = false; sb.textContent = 'Entrar'; }
    }
});

function logoutUser() { if (!auth) { console.error("Logout: Auth N/D."); return; } auth.signOut().then(() => console.log("Logout OK.")).catch(e => { console.error("Error logout:", e); alert("Error logout: " + e.message); }); }

// --- Funciones: Carga de Datos (Firestore) ---
async function loadInitialDataForLoggedInUser() { if (!db) throw new Error("DB N/D carga inicial."); console.log("Cargando datos iniciales..."); try { await Promise.all([loadConfig(), loadMaterials(), loadClients()]); console.log("Datos iniciales OK."); } catch (e) { console.error("Fallo carga inicial:", e); throw e; } }

function loadDataForSection(sectionId) {
    if (!db) { console.error(`loadData: DB N/D para ${sectionId}.`); const sE = document.getElementById(sectionId); if (sE?.classList.contains('main-section')) sE.innerHTML = `<div class="content-card"><p class="feedback feedback-error">Error: DB N/D.</p></div>`; return; }
    if (!currentUser && !['home', 'login'].includes(sectionId)) { console.warn(`loadData: ${sectionId} sin user.`); return; }
    console.log(`loadData: Verificando ${sectionId}...`);
    switch (sectionId) {
        case 'clients': if (!dataLoaded.clients) loadClients().catch(handleLoadError); else populateClientsTable(); break;
        case 'jobs': case 'deadlines': case 'status': if (!dataLoaded.jobs) loadJobs().catch(handleLoadError); else { if (sectionId === 'jobs') populateJobsTable(); if (sectionId === 'deadlines') populateDeadlinesTable(); if (sectionId === 'status') populateStatusTable(); } break;
        case 'reports': if (currentUserRole === 'superadmin') { if (!dataLoaded.jobs) loadJobs().then(generateReports).catch(handleLoadError); else generateReports(); } break;
        case 'new-job-form': const p1 = dataLoaded.clients ? Promise.resolve() : loadClients(); const p2 = dataLoaded.materials ? Promise.resolve() : loadMaterials(); Promise.all([p1, p2]).then(() => { populateClientDropdown('job-client'); populateMaterialDropdown('job-material'); if (!document.getElementById('job-id').value) resetJobForm(); }).catch(handleLoadError); break;
        case 'admin-materials': if (currentUserRole === 'superadmin') { if (!dataLoaded.materials) loadMaterials().catch(handleLoadError); else { populateMaterialsAdminTable(); if (!document.getElementById('material-id-admin').value) resetMaterialFormAdmin(); } } break;
        case 'admin-config': if (currentUserRole === 'superadmin') { if (!dataLoaded.config) loadConfig().catch(handleLoadError); else populateConfigFormAdmin(); } break;
        case 'advanced-reports': if (currentUserRole === 'superadmin') { if (!dataLoaded.jobs) loadJobs().then(() => { document.getElementById('daily-report-output').innerHTML = 'Click para generar.'; document.getElementById('monthly-report-output').innerHTML = 'Click para generar.'; }).catch(handleLoadError); else { document.getElementById('daily-report-output').innerHTML = 'Click para generar.'; document.getElementById('monthly-report-output').innerHTML = 'Click para generar.'; } const fE = document.getElementById('advanced-reports-feedback'); if (fE) showFeedback(fE, '', 'info'); } break;
        case 'assistant': case 'home': case 'login': break; default: console.log(`loadData: No acción para ${sectionId}.`);
    }
}

function handleLoadError(error) { console.error("Error carga datos:", error); const fbA = document.getElementById('job-form-feedback') || document.getElementById('client-form-feedback') || document.getElementById(activeSectionId)?.querySelector('.feedback') || document.body; showFeedback(fbA, `Error cargar datos: ${error.message}. Recargue.`, 'error'); }

async function loadMaterials() { if (!db) throw new Error("DB N/D loadMaterials"); console.log("Cargando materiales..."); dataLoaded.materials = false; try { const snap = await db.collection('materials').orderBy('name').get(); const temp = {}; snap.forEach(doc => temp[doc.id] = { ...doc.data(), id: doc.id }); materialsData = temp; dataLoaded.materials = true; console.log(`Mats cargados: ${Object.keys(materialsData).length}`); populateMaterialDropdown('job-material'); if (currentUserRole === 'superadmin' && activeSectionId === 'admin-materials') populateMaterialsAdminTable(); } catch (e) { console.error("Error cargar mats:", e); const fE = document.getElementById('material-form-feedback-admin'); if (fE && activeSectionId === 'admin-materials') showFeedback(fE, `Error mats: ${e.message}`, 'error'); throw e; } }

// ***** loadConfig CON CORRECCIÓN .exists *****
async function loadConfig() {
    if (!db) throw new Error("DB N/D loadConfig");
    console.log("Cargando config...");
    dataLoaded.config = false;
    try {
        const configSnapshot = await db.collection('config').doc('main').get();
        // ***** LÍNEA CORREGIDA: usa .exists como propiedad, no función *****
        if (configSnapshot.exists) { // <--- CORRECCIÓN AQUÍ
            const d = configSnapshot.data(); // Obtiene los datos
            configData.minutes_per_month = d.minutes_per_month || 2400;
            configData.monthly_costs = d.monthly_costs || {};
            const tMC = Object.values(configData.monthly_costs).reduce((s, v) => s + (Number(v) || 0), 0);
            configData.cost_per_minute = (configData.minutes_per_month > 0) ? tMC / configData.minutes_per_month : 0;
            console.log(`Config OK. Costo/min: $${configData.cost_per_minute.toFixed(4)}`);
        } else {
            console.warn("config/main N/E. Usando defaults.");
            configData = { cost_per_minute: 0, minutes_per_month: 2400, monthly_costs: {} };
        }
        dataLoaded.config = true;
        if (currentUserRole === 'superadmin' && activeSectionId === 'admin-config') {
            populateConfigFormAdmin();
        }
    } catch (e) {
        console.error("Error cargar config:", e);
        const fE = document.getElementById('config-form-feedback-admin');
        if (fE && activeSectionId === 'admin-config') showFeedback(fE, `Error config: ${e.message}`, 'error');
        dataLoaded.config = false; // Asegúrate de marcar como no cargado en caso de error
        throw e; // Relanza el error
    }
}

async function loadClients() { if (!currentUser || !db) throw new Error("User/DB N/D loadClients"); console.log("Cargando clientes..."); dataLoaded.clients = false; const tB = document.getElementById('clients-table')?.querySelector('tbody'); if (tB && activeSectionId === 'clients') tB.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Cargando...</td></tr>`; try { const snap = await db.collection('clients').orderBy('name', 'asc').get(); const temp = {}; snap.forEach(doc => temp[doc.id] = { ...doc.data(), id: doc.id }); clientsData = temp; dataLoaded.clients = true; console.log(`Clientes cargados: ${Object.keys(clientsData).length}`); if (activeSectionId === 'clients') populateClientsTable(); populateClientDropdown('job-client'); if (activeSectionId === 'clients') filterClients(); } catch (e) { console.error("Error cargar clientes:", e); if (tB && activeSectionId === 'clients') tB.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-600">Error: ${e.message}</td></tr>`; throw e; } }

// ***** loadJobs CON normalizeDate SIMPLIFICADO (v2) *****
async function loadJobs() {
    if (!currentUser || !db) {
        console.error("loadJobs: No hay usuario o DB");
        throw new Error("Usuario o DB no disponible en loadJobs");
    }
    console.log("Cargando trabajos (v6 - reescrito)...");
    dataLoaded.jobs = false;

    // Indicadores de carga
    const loadingHtml = (cols) => `<tr><td colspan="${cols}" class="text-center py-4 text-gray-500">Cargando trabajos...</td></tr>`;
    ['jobs-table', 'deadlines-table', 'status-table', 'outstanding-table'].forEach(id => {
        const tbody = document.getElementById(id)?.querySelector('tbody');
        if (tbody) {
            const colCount = tbody.closest('table')?.querySelector('thead th')?.length || 1;
            tbody.innerHTML = loadingHtml(colCount);
        }
    });
    ['report-total-value', 'report-total-deposit', 'report-total-outstanding']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'Calculando...'; });
    ['monthly-report-output', 'daily-report-output'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.querySelector('table') && !el.querySelector('ul')) {
            el.innerHTML = 'Cargando datos...';
        }
    });

    try {
        const snapshot = await db.collection('jobs').orderBy('orderDate', 'desc').get();
        const tempJobs = [];

        snapshot.forEach(doc => {
            const data = doc.data();

            // Función interna para normalizar fechas (reescrita y simplificada)
            const normalizeDate = (dateFieldValue) => {
                if (!dateFieldValue) {
                    return null;
                }
                let dateString = null;
                // Caso 1: Timestamp de Firebase
                if (dateFieldValue instanceof firebase.firestore.Timestamp) {
                    try {
                        dateString = dateFieldValue.toDate().toISOString();
                    } catch (tsError) {
                        console.error(`Error convirtiendo Timestamp en doc ${doc.id}:`, tsError);
                        return null;
                    }
                // Caso 2: String
                } else if (typeof dateFieldValue === 'string') {
                    dateString = dateFieldValue;
                // Caso 3: Otros tipos no soportados
                } else {
                     console.warn(`Tipo de fecha inesperado ${doc.id}:`, typeof dateFieldValue);
                     return null;
                }

                // Extraer YYYY-MM-DD del string (si es válido)
                if (dateString && dateString.length >= 10) {
                    const potentialDate = dateString.substring(0, 10);
                    // Validación simple de formato
                    if (/^\d{4}-\d{2}-\d{2}$/.test(potentialDate)) {
                        return potentialDate;
                    } else {
                         console.warn(`Formato de fecha string inválido ${doc.id}:`, potentialDate);
                         return null;
                    }
                } else {
                    console.warn(`Fecha string inválida o corta ${doc.id}:`, dateString);
                    return null;
                }
            }; // Fin de normalizeDate

            tempJobs.push({
                ...data, id: doc.id,
                orderDate: normalizeDate(data.orderDate),
                deliveryDate: normalizeDate(data.deliveryDate),
                finalCost: Number(data.finalCost || 0),
                deposit: Number(data.deposit || 0)
            });
        }); // Fin forEach

        jobsData = tempJobs; dataLoaded.jobs = true; console.log(`Trabajos cargados: ${jobsData.length}`);
        if (activeSectionId === 'jobs') populateJobsTable(); if (activeSectionId === 'deadlines') populateDeadlinesTable(); if (activeSectionId === 'status') populateStatusTable();
        if (activeSectionId === 'reports' && currentUserRole === 'superadmin') generateReports();
        if (activeSectionId === 'advanced-reports' && currentUserRole === 'superadmin') { document.getElementById('daily-report-output').innerHTML = 'Click.'; document.getElementById('monthly-report-output').innerHTML = 'Click.'; }
        if (activeSectionId === 'jobs') filterJobs();

    } catch (error) { // Catch revisado sin referencia a 'dS'
        console.error("Error crítico al cargar trabajos:", error);
        const errorHtml = (cols) => `<tr><td colspan="${cols}" class="text-center py-4 text-red-600">Error al cargar trabajos: ${error.message}</td></tr>`;
        ['jobs-table', 'deadlines-table', 'status-table', 'outstanding-table'].forEach(id => {
            const tbody = document.getElementById(id)?.querySelector('tbody');
            if (tbody) {
                const colCount = tbody.closest('table')?.querySelector('thead th')?.length || 1;
                tbody.innerHTML = errorHtml(colCount);
            }
        });
        throw error;
    }
}


// --- Funciones: Población de Elementos UI ---
function populateClientDropdown(id) { const s=document.getElementById(id); if(!s){console.warn(`Dropdown ${id} N/E.`);return;} const v=s.value; s.innerHTML='<option value="">Selecciona cliente...</option>'; const sorted=Object.values(clientsData).sort((a,b)=>(a.name||"S/N").localeCompare(b.name||"S/N")); sorted.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name||`S/N (ID:${c.id.substring(0,6)})`;s.appendChild(o);}); if(Array.from(s.options).some(opt=>opt.value===v))s.value=v;}
function populateMaterialDropdown(id) { const s=document.getElementById(id); if(!s){console.warn(`Dropdown ${id} N/E.`);return;} const v=s.value; s.innerHTML='<option value="">Selecciona material...</option>'; const avail=Object.values(materialsData).filter(m=>m.available!==false).sort((a,b)=>{const nA=`${a.name||'S/N'} ${a.thickness||0}mm`;const nB=`${b.name||'S/N'} ${b.thickness||0}mm`;return nA.localeCompare(nB);}); avail.forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=`${m.name||'S/N'} - ${m.thickness||'?'}mm`;s.appendChild(o);}); if(Array.from(s.options).some(opt=>opt.value===v))s.value=v;}
function filterClients(){populateClientsTable();} function filterJobs(){populateJobsTable();}

function populateClientsTable() { const tB=document.getElementById('clients-table')?.querySelector('tbody'); if(!tB)return; const term=document.getElementById('client-search')?.value.toLowerCase()||''; const cols=tB.closest('table')?.querySelector('thead th')?.length||4; if(!dataLoaded.clients){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">Cargando...</td></tr>`; return;} const filt=Object.values(clientsData).filter(c=>(c.name?.toLowerCase()||'').includes(term)||(c.email?.toLowerCase()||'').includes(term)||(c.phone||'').includes(term)).sort((a,b)=>(a.name||"").localeCompare(b.name||"")); if(filt.length===0){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">No hay clientes${term?' que coincidan.':'.'}</td></tr>`; return;} let tH=''; filt.forEach(c=>{let pH=c.phone||'-';if(c.phone){const clP=c.phone.replace(/\D/g,'');if(clP.length>8){const waN=clP.startsWith('549')?clP:`549${clP}`;pH=`<a href="https://wa.me/${waN}" target="_blank" rel="noopener noreferrer" class="whatsapp-link inline-flex items-center gap-1" title="WhatsApp">${c.phone}<svg class="h-4 w-4 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.413 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg></a>`;}} tH+=`<tr data-client-id="${c.id}"><td data-label="Nombre">${c.name||'N/A'}</td><td data-label="Celular">${pH}</td><td data-label="Email">${c.email||'-'}</td><td data-label="Acciones" class="no-print space-x-1 nowrap"><button onclick="editClient('${c.id}')" class="action-button edit-button">Editar</button><button onclick="deleteClient('${c.id}')" class="action-button delete-button">Borrar</button><button onclick="selectClientForNewJob('${c.id}')" class="action-button btn-secondary">N.Trabajo</button></td></tr>`;}); tB.innerHTML=tH;}

const statusOrderValue={'Encargado':1,'Procesando':2,'Terminado':3}; function sortByStatusAndOrderDate(a,b){const sD=(statusOrderValue[a.status]||99)-(statusOrderValue[b.status]||99); if(sD!==0)return sD; return(b.orderDate||"").localeCompare(a.orderDate||"");} function sortByStatusAndDeliveryDate(a,b){const sD=(statusOrderValue[a.status]||99)-(statusOrderValue[b.status]||99); if(sD!==0)return sD; return(a.deliveryDate||"9999-12-31").localeCompare(b.deliveryDate||"9999-12-31");}

function populateJobsTable() { const tB=document.getElementById('jobs-table')?.querySelector('tbody'); if(!tB)return; const term=document.getElementById('job-search')?.value.toLowerCase()||''; const cols=tB.closest('table')?.querySelector('thead th')?.length||9; if(!dataLoaded.jobs){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">Cargando...</td></tr>`; return;} const filt=jobsData.filter(j=>(clientsData[j.clientId]?.name?.toLowerCase()||'').includes(term)||(j.details?.toLowerCase()||'').includes(term)).sort(sortByStatusAndOrderDate); if(filt.length===0){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">No hay trabajos${term?' que coincidan.':'.'}</td></tr>`; return;} let tH=''; const today=new Date(); today.setHours(0,0,0,0); filt.forEach(j=>{const cli=clientsData[j.clientId]; const cliN=cli?.name||'Borrado/Desc.'; const fC=j.finalCost||0; const dep=j.deposit||0; const out=Math.max(0,fC-dep); const dD=parseDateForComparison(j.deliveryDate); const isO=dD&&dD<today&&j.status!=='Terminado'; let ctBtn=''; if(cli&&cli.phone){ctBtn=`<button onclick="sendWhatsAppMessage('${j.id}')" class="action-button whatsapp-button p-1" title="WA"><svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.413 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg></button>`;} else{ctBtn=`<button onclick="printTicket('${j.id}')" class="action-button print-button" title="Ticket PDF">Ticket</button>`;} tH+=`<tr data-job-id="${j.id}"><td data-label="Cliente">${cliN}</td><td data-label="Detalles" class="max-w-xs truncate" title="${j.details||''}">${j.details||'-'}</td><td data-label="F.Ped">${formatDate(j.orderDate)}</td><td data-label="F.Ent" class="${isO?'date-overdue':''}">${formatDate(j.deliveryDate)}</td><td data-label="Estado"><span class="status-badge ${getStatusClass(j.status)}">${j.status||'N/A'}</span></td><td data-label="Total" class="tr">${fC.toFixed(2)}</td><td data-label="Seña" class="tr">${dep.toFixed(2)}</td><td data-label="Pend" class="tr font-semibold ${out>0.005?'text-red-600':'text-green-600'}">${out.toFixed(2)}</td><td data-label="Acc" class="no-print space-x-1 nowrap"><button onclick="editJob('${j.id}')" class="action-button edit-button">Editar</button><button onclick="deleteJob('${j.id}')" class="action-button delete-button">Borrar</button>${ctBtn}</td></tr>`;}); tB.innerHTML=tH;}

function populateDeadlinesTable() { const tB=document.getElementById('deadlines-table')?.querySelector('tbody'); if(!tB)return; const cols=tB.closest('table')?.querySelector('thead th')?.length||6; if(!dataLoaded.jobs){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">Cargando...</td></tr>`; return;} const upc=jobsData.filter(j=>j.status!=='Terminado').sort(sortByStatusAndDeliveryDate); if(upc.length===0){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">No hay trabajos pendientes.</td></tr>`; return;} let tH=''; const today=new Date(); today.setHours(0,0,0,0); upc.forEach(j=>{const cliN=clientsData[j.clientId]?.name||'Borrado/Desc.'; const dD=parseDateForComparison(j.deliveryDate); let dRS='-'; let rCls=''; if(dD){const diff=dD.getTime()-today.getTime(); const dR=Math.ceil(diff/(1000*60*60*24)); if(dR<0){dRS=`Vencido(${Math.abs(dR)}d)`;rCls='bg-red-100 date-overdue';} else if(dR===0){dRS='Hoy';rCls='bg-yellow-100 font-semibold';} else if(dR<=3){dRS=`${dR}d`;rCls='bg-yellow-50';} else{dRS=`${dR}d`;}} else{dRS='S/F';} tH+=`<tr data-job-id="${j.id}" class="${rCls}"><td data-label="Cliente">${cliN}</td><td data-label="Detalles" class="max-w-xs truncate" title="${j.details||''}">${j.details||'-'}</td><td data-label="F.Ped">${formatDate(j.orderDate)}</td><td data-label="F.Ent">${formatDate(j.deliveryDate)}</td><td data-label="Estado"><span class="status-badge ${getStatusClass(j.status)}">${j.status||'N/A'}</span></td><td data-label="Rest.">${dRS}</td></tr>`;}); tB.innerHTML=tH;}

function populateStatusTable() { const tB=document.getElementById('status-table')?.querySelector('tbody'); if(!tB)return; const cols=tB.closest('table')?.querySelector('thead th')?.length||4; if(!dataLoaded.jobs){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">Cargando...</td></tr>`; return;} const sorted=[...jobsData].sort(sortByStatusAndDeliveryDate); if(sorted.length===0){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">No hay trabajos.</td></tr>`; return;} let tH=''; const today=new Date(); today.setHours(0,0,0,0); sorted.forEach(j=>{const cliN=clientsData[j.clientId]?.name||'Borrado/Desc.'; const dD=parseDateForComparison(j.deliveryDate); const isO=dD&&dD<today&&j.status!=='Terminado'; tH+=`<tr data-job-id="${j.id}"><td data-label="Cliente">${cliN}</td><td data-label="Detalles" class="max-w-xs truncate" title="${j.details||''}">${j.details||'-'}</td><td data-label="Estado"><span class="status-badge ${getStatusClass(j.status)}">${j.status||'N/A'}</span></td><td data-label="F.Ent" class="${isO?'date-overdue':''}">${formatDate(j.deliveryDate)}</td></tr>`;}); tB.innerHTML=tH;}

function generateReports() { if(currentUserRole!=='superadmin')return; const tVE=document.getElementById('report-total-value'); const tDE=document.getElementById('report-total-deposit'); const tOE=document.getElementById('report-total-outstanding'); const oTB=document.getElementById('outstanding-table')?.querySelector('tbody'); if(!tVE||!tDE||!tOE||!oTB)return; if(!dataLoaded.jobs){tVE.textContent='$?.??';tDE.textContent='$?.??';tOE.textContent='$?.??';oTB.innerHTML='<tr><td colspan="4" class="tc p4 g5">N/D.</td></tr>'; return;} let tV=0, tD=0; let cliT={}; jobsData.forEach(j=>{const fC=j.finalCost||0; const dep=j.deposit||0; tV+=fC; tD+=dep; const cId=j.clientId; if(!cId)return; if(!cliT[cId])cliT[cId]={name:clientsData[cId]?.name||`Desc.(${cId.substring(0,6)})`,total:0,deposit:0,outstanding:0}; cliT[cId].total+=fC; cliT[cId].deposit+=dep;}); const tO=Math.max(0,tV-tD); tVE.textContent=`$${tV.toFixed(2)}`; tDE.textContent=`$${tD.toFixed(2)}`; tOE.textContent=`$${tO.toFixed(2)}`; const cWD=Object.values(cliT).map(c=>{c.outstanding=Math.max(0,c.total-c.deposit); return c;}).filter(c=>c.outstanding>0.005).sort((a,b)=>b.outstanding-a.outstanding); if(cWD.length===0){oTB.innerHTML='<tr><td colspan="4" class="tc p4 g5">Nadie debe.</td></tr>';} else {let oH=''; cWD.forEach(c=>{oH+=`<tr><td data-label="Cliente">${c.name}</td><td data-label="Total" class="tr">${c.total.toFixed(2)}</td><td data-label="Señado" class="tr">${c.deposit.toFixed(2)}</td><td data-label="Pend." class="tr font-semibold text-red-600">${c.outstanding.toFixed(2)}</td></tr>`;}); oTB.innerHTML=oH;} }

function populateMaterialsAdminTable() { if(currentUserRole!=='superadmin')return; const tB=document.getElementById('materials-admin-table')?.querySelector('tbody'); if(!tB)return; const cols=tB.closest('table')?.querySelector('thead th')?.length||6; if(!dataLoaded.materials){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">Cargando...</td></tr>`; return;} if(Object.keys(materialsData).length===0){tB.innerHTML=`<tr><td colspan="${cols}" class="tc p4 g5">No hay mats.</td></tr>`; return;} const sorted=Object.values(materialsData).sort((a,b)=>{const nc=(a.name||"").localeCompare(b.name||""); if(nc!==0)return nc; return(a.thickness||0)-(b.thickness||0);}); let tH=''; sorted.forEach(m=>{const d=(m.width&&m.height)?`${m.width}x${m.height}`:'N/A'; const aTxt=m.available!==false?'Sí':'No'; const aCls=m.available!==false?'text-green-600':'text-red-600'; const c=(m.costPerSheet!==undefined?m.costPerSheet:m.cost)||0; tH+=`<tr data-material-id="${m.id}"><td data-label="Nombre">${m.name||'N/A'}</td><td data-label="Grosor" class="tr">${m.thickness||'-'}</td><td data-label="Costo/P" class="tr">${c.toFixed(2)}</td><td data-label="Dim" class="tc">${d}</td><td data-label="Disp." class="tc ${aCls} font-semibold">${aTxt}</td><td data-label="Acc" class="no-print space-x-1 nowrap"><button onclick="editMaterialAdmin('${m.id}')" class="action-button edit-button">E</button><button onclick="deleteMaterialAdmin('${m.id}')" class="action-button delete-button">B</button></td></tr>`;}); tB.innerHTML=tH;}

function populateConfigFormAdmin() { if(currentUserRole!=='superadmin')return; const mI=document.getElementById('config-minutes-admin'); const cC=document.getElementById('monthly-costs-container'); const cD=document.getElementById('calculated-cost-per-minute'); if(!mI||!cC||!cD)return; mI.value=configData.minutes_per_month||2400; cC.innerHTML=''; const costs=configData.monthly_costs||{}; if(Object.keys(costs).length===0)addMonthlyCostInput('Ej: Alquiler',''); else Object.keys(costs).sort().forEach(k=>addMonthlyCostInput(k,costs[k])); cD.textContent=`$${(configData.cost_per_minute||0).toFixed(4)} / min`;}

// --- Funciones: CRUD Clientes ---
document.getElementById('client-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!db || !currentUser) return;
    const clientId = document.getElementById('client-id').value;
    const nameInput = document.getElementById('client-name'); const phoneInput = document.getElementById('client-phone'); const emailInput = document.getElementById('client-email');
    const feedbackEl = document.getElementById('client-form-feedback'); const submitButton = e.target.querySelector('button[type="submit"]');
    const name = nameInput.value.trim(); const phone = phoneInput.value.trim(); const email = emailInput.value.trim().toLowerCase();
    if (!name) { showFeedback(feedbackEl, 'Nombre obligatorio.', 'error'); nameInput.focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFeedback(feedbackEl, 'Email inválido.', 'error'); emailInput.focus(); return; }
    const clientData = { name, phone: phone || null, email: email || null };
    if (submitButton) submitButton.disabled = true;
    try {
        showFeedback(feedbackEl, clientId ? 'Actualizando...' : 'Añadiendo...', 'info');
        let message = '';
        if (clientId) {
            await db.collection('clients').doc(clientId).update(clientData);
            clientsData[clientId] = { ...clientsData[clientId], ...clientData }; message = 'Cliente actualizado.';
        } else {
            const docRef = await db.collection('clients').add(clientData);
            clientsData[docRef.id] = { ...clientData, id: docRef.id }; message = 'Cliente añadido.';
        }
        showFeedback(feedbackEl, message, 'success'); resetClientForm(); populateClientsTable(); populateClientDropdown('job-client');
    } catch (error) { console.error("Error guardando cliente:", error); showFeedback(feedbackEl, `Error: ${error.message}`, 'error');
    } finally { if (submitButton) submitButton.disabled = false; }
});

function editClient(clientId) {
    const client = clientsData[clientId]; if (!client) { showFeedback(document.getElementById('client-form-feedback'), `Cliente ${clientId} no encontrado.`, 'error'); return; }
    document.getElementById('client-form-title').textContent = 'Editar Cliente'; document.getElementById('client-id').value = client.id;
    document.getElementById('client-name').value = client.name || ''; document.getElementById('client-phone').value = client.phone || ''; document.getElementById('client-email').value = client.email || '';
    showFeedback(document.getElementById('client-form-feedback'), '', 'info');
    document.getElementById('client-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('client-name').focus();
}

function resetClientForm() {
    document.getElementById('client-form-title').textContent = 'Añadir Nuevo Cliente'; const form = document.getElementById('client-form'); if (form) form.reset();
    document.getElementById('client-id').value = ''; const feedbackEl = document.getElementById('client-form-feedback'); if (feedbackEl) showFeedback(feedbackEl, '', 'info');
}

async function deleteClient(clientId) {
    if (!db || !currentUser) return; const client = clientsData[clientId]; const clientName = client?.name || `ID ${clientId}`;
    const associatedJobs = jobsData.filter(job => job.clientId === clientId); let confirmMsg = `¿Borrar cliente "${clientName}"?`;
    if (associatedJobs.length > 0) confirmMsg += `\n\n¡ATENCIÓN! Tiene ${associatedJobs.length} trabajo(s) asociado(s).`; confirmMsg += "\n\nIrreversible.";
    if (!confirm(confirmMsg)) return;
    const feedbackEl = document.getElementById('client-form-feedback');
    try {
        showFeedback(feedbackEl, `Borrando "${clientName}"...`, 'info'); await db.collection('clients').doc(clientId).delete(); delete clientsData[clientId];
        showFeedback(feedbackEl, `Cliente "${clientName}" borrado.`, 'success'); populateClientsTable(); populateClientDropdown('job-client');
        if (associatedJobs.length > 0) { dataLoaded.jobs = false; if (['jobs', 'deadlines', 'status', 'reports', 'advanced-reports'].includes(activeSectionId)) loadDataForSection(activeSectionId); }
        if (document.getElementById('client-id').value === clientId) resetClientForm();
    } catch (error) { console.error("Error borrando cliente:", error); showFeedback(feedbackEl, `Error: ${error.message}`, 'error'); }
}

function selectClientForNewJob(clientId) {
    const client = clientsData[clientId]; if (!client) return; console.log(`Cliente ${client.name} (${clientId}) seleccionado.`); navigateTo('new-job-form');
    setTimeout(() => { const clientSelect = document.getElementById('job-client'); if (clientSelect) { resetJobForm(clientId); clientSelect.value = clientId; document.getElementById('job-details')?.focus(); } else { console.error("Dropdown 'job-client' N/E post-nav."); } }, 150);
}

// --- Funciones: CRUD Trabajos ---
document.getElementById('job-job-type')?.addEventListener('change', (e) => {
    const type = e.target.value; const cutField = document.getElementById('job-cut-time-field'); const engraveField = document.getElementById('job-engrave-time-field');
    const cutInput = document.getElementById('job-cut-minutes'); const engraveInput = document.getElementById('job-engrave-minutes'); if (!cutField || !engraveField || !cutInput || !engraveInput) return;
    cutField.style.display = (type === 'corte' || type === 'ambos') ? 'grid' : 'none'; engraveField.style.display = (type === 'grabado' || type === 'ambos') ? 'grid' : 'none';
    if (type === 'corte') engraveInput.value = 0; if (type === 'grabado') cutInput.value = 0;
});

function calculateJobQuote() { console.log("Calculando costo..."); const fb=document.getElementById('job-form-feedback'); const bR=document.getElementById('job-quote-base-result'); const fcI=document.getElementById('job-final-cost'); currentJobQuoteBaseCost=0; try{ showFeedback(fb,'Calculando...','info'); const mId=document.getElementById('job-material').value; const lMm=parseFloat(document.getElementById('job-length').value)||0; const wMm=parseFloat(document.getElementById('job-width').value)||0; const jT=document.getElementById('job-job-type').value; const cM=(jT==='corte'||jT==='ambos')?(parseFloat(document.getElementById('job-cut-minutes').value)||0):0; const eM=(jT==='grabado'||jT==='ambos')?(parseFloat(document.getElementById('job-engrave-minutes').value)||0):0; let mC=0, maC=0, w=[]; if(mId&&lMm>0&&wMm>0){const m=materialsData[mId];if(!m)throw new Error("Mat N/E.");const sC=parseFloat((m.costPerSheet!==undefined?m.costPerSheet:m.cost)||0);const sW=parseFloat(m.width||0);const sH=parseFloat(m.height||0);if(sW<=0||sH<=0||sW*sH===0){w.push(`Dim plancha inv. ${sW}x${sH}. Costo mat N/I.`);mC=0;}else mC=(sC/(sW*sH))*(lMm*wMm);}else if(mId)w.push('Alto/Ancho inv p/costo mat.'); const tM=cM+eM; if(configData.cost_per_minute===undefined)throw new Error("Costo/min N/C."); if(configData.cost_per_minute<=0&&tM>0)w.push('Costo/min $0.'); maC=tM*configData.cost_per_minute; currentJobQuoteBaseCost=mC+maC; let sFC=Math.ceil((currentJobQuoteBaseCost*2)/10)*10; console.log(`Base:$${currentJobQuoteBaseCost.toFixed(2)}(Mat:$${mC.toFixed(2)},Maq:$${maC.toFixed(2)}), Sug:$${sFC.toFixed(2)}`); if(currentUserRole==='superadmin'&&bR)bR.textContent=`Base Est:$${currentJobQuoteBaseCost.toFixed(2)}`; else if(bR)bR.textContent=''; if(fcI){fcI.value=sFC.toFixed(2);let fM=`Sugerido:$${sFC.toFixed(2)}.`;if(currentUserRole==='superadmin')fM=`Base:$${currentJobQuoteBaseCost.toFixed(2)}. ${fM}`; const cM=w.length>0?`Avisos:${w.join('. ')}.//${fM}`:fM; showFeedback(fb,cM,w.length>0?'warning':'success');}else{let fM=`Calc OK.`;if(currentUserRole==='superadmin')fM=`Base:$${currentJobQuoteBaseCost.toFixed(2)}.`; const cM=w.length>0?`Avisos:${w.join('. ')}.//${fM}`:fM; showFeedback(fb,cM,w.length>0?'warning':'success');}}catch(e){console.error("Error calc costo:",e);currentJobQuoteBaseCost=0;if(bR)bR.textContent='Error';if(fcI)fcI.value='0.00';showFeedback(fb,`Error calc:${e.message}`,'error');}}

document.getElementById('job-form')?.addEventListener('submit', async (e) => { e.preventDefault(); if(!db||!currentUser)return; const jId=document.getElementById('job-id').value; const fb=document.getElementById('job-form-feedback'); const sb=e.target.querySelector('button[type="submit"]'); showFeedback(fb,'','info'); const jD={clientId:document.getElementById('job-client').value,details:document.getElementById('job-details').value.trim(),materialId:document.getElementById('job-material').value,length:parseFloat(document.getElementById('job-length').value)||null,width:parseFloat(document.getElementById('job-width').value)||null,jobType:document.getElementById('job-job-type').value,cutMinutes:parseFloat(document.getElementById('job-cut-minutes').value)||0,engraveMinutes:parseFloat(document.getElementById('job-engrave-minutes').value)||0,orderDate:document.getElementById('job-order-date').value||null,deliveryDate:document.getElementById('job-delivery-date').value||null,status:document.getElementById('job-status').value,baseCost:currentJobQuoteBaseCost,finalCost:parseFloat(document.getElementById('job-final-cost').value)||0,deposit:parseFloat(document.getElementById('job-deposit').value)||0,observations:document.getElementById('job-observations').value.trim()||null,lastUpdated:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid,...(!jId&&{createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:currentUser.uid})}; let errs=[]; if(!jD.clientId)errs.push('Cliente.');if(!jD.details)errs.push('Detalles.');if(!jD.materialId)errs.push('Material.');if(!jD.length||jD.length<=0)errs.push('Alto>0.');if(!jD.width||jD.width<=0)errs.push('Ancho>0.');if(!jD.orderDate)errs.push('F.Ped.');if(!jD.deliveryDate)errs.push('F.Ent.');if(jD.orderDate&&jD.deliveryDate&&jD.deliveryDate<jD.orderDate)errs.push('Ent<Ped.');if(jD.finalCost<0)errs.push('Costo>=0.');if(jD.deposit<0)errs.push('Seña>=0.');if(jD.deposit>jD.finalCost+0.001)errs.push('Seña<=Total.'); if(errs.length>0){showFeedback(fb,`Errores:${errs.join(' ')}`,'error');return;} if(sb)sb.disabled=true; try{showFeedback(fb,jId?'Actualizando...':'Creando...','info'); if(jId){const{createdAt,createdBy,...updD}=jD;await db.collection('jobs').doc(jId).update(updD);showFeedback(fb,'Trabajo actualizado.','success');}else{const dR=await db.collection('jobs').add(jD);jD.id=dR.id;showFeedback(fb,'Trabajo creado.','success');} dataLoaded.jobs=false;navigateTo('jobs');}catch(e){console.error("Error guardar trabajo:",e);showFeedback(fb,`Error:${e.message}`,'error');}finally{if(sb)sb.disabled=false;}});

function editJob(jId) { const j=jobsData.find(j=>j.id===jId);if(!j){alert(`Error: Trabajo ${jId} N/E.`);return;}console.log("Editando:",j); navigateTo('new-job-form'); setTimeout(()=>{try{document.getElementById('job-form-title').textContent='Editar Trabajo';document.getElementById('job-id').value=j.id;document.getElementById('job-client').value=j.clientId||'';document.getElementById('job-details').value=j.details||'';document.getElementById('job-material').value=j.materialId||'';document.getElementById('job-length').value=j.length||'';document.getElementById('job-width').value=j.width||'';document.getElementById('job-job-type').value=j.jobType||'corte';document.getElementById('job-job-type').dispatchEvent(new Event('change'));document.getElementById('job-cut-minutes').value=j.cutMinutes||0;document.getElementById('job-engrave-minutes').value=j.engraveMinutes||0;document.getElementById('job-status').value=j.status||'Encargado';document.getElementById('job-final-cost').value=(j.finalCost||0).toFixed(2);document.getElementById('job-deposit').value=(j.deposit||0).toFixed(2);document.getElementById('job-observations').value=j.observations||'';currentJobQuoteBaseCost=j.baseCost||0;const bR=document.getElementById('job-quote-base-result');if(currentUserRole==='superadmin'&&bR)bR.textContent=`Base(Guardado):$${currentJobQuoteBaseCost.toFixed(2)}`;else if(bR)bR.textContent='';const oDI=document.getElementById('job-order-date');const dDI=document.getElementById('job-delivery-date');if(oDI?._flatpickr)oDI._flatpickr.setDate(j.orderDate||'',true);else if(oDI)oDI.value=j.orderDate||'';if(dDI?._flatpickr)dDI._flatpickr.setDate(j.deliveryDate||'',true);else if(dDI)dDI.value=j.deliveryDate||'';showFeedback(document.getElementById('job-form-feedback'),'','info');document.getElementById('job-form').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){console.error("Error poblar form edit:",e);alert("Error al preparar edit.");navigateTo('jobs');}},150);}

function resetJobForm(kCId=null) { console.log("Reseteando form trabajo...");document.getElementById('job-form-title').textContent='Nuevo Trabajo';const f=document.getElementById('job-form');if(f)f.reset();document.getElementById('job-id').value='';currentJobQuoteBaseCost=0;const bR=document.getElementById('job-quote-base-result');if(bR)bR.textContent=currentUserRole==='superadmin'?'Base Est:$0.00':'';document.getElementById('job-final-cost').value='0.00';document.getElementById('job-deposit').value='0';document.getElementById('job-job-type').value='corte';document.getElementById('job-job-type').dispatchEvent(new Event('change'));showFeedback(document.getElementById('job-form-feedback'),'','info');const oDI=document.getElementById('job-order-date');const dDI=document.getElementById('job-delivery-date');const tA=new Date().toISOString().split('T')[0]; /* REVERTIDO a Date nativo */ if(oDI?._flatpickr)oDI._flatpickr.setDate(tA,true);else if(oDI)oDI.value=tA;if(dDI?._flatpickr)dDI._flatpickr.clear();else if(dDI)dDI.value='';const cS=document.getElementById('job-client');if(cS)cS.value=kCId||'';}

async function deleteJob(jId) { if(!db||!currentUser)return;const j=jobsData.find(j=>j.id===jId);const cN=j?(clientsData[j.clientId]?.name||'Desc.'):'Desc.';const jD=j?(j.details?.substring(0,30)||`ID ${jId.substring(0,6)}`):`ID ${jId.substring(0,6)}`;if(!confirm(`¿Borrar trabajo "${jD}..." / "${cN}"?\n\nIrreversible.`))return; try{console.log(`Borrando job ${jId}...`);await db.collection('jobs').doc(jId).delete();jobsData=jobsData.filter(j=>j.id!==jId);console.log(`Job ${jId} borrado.`);const fbA=document.getElementById('jobs-table')?.closest('.content-card').querySelector('.feedback')||document.body;showFeedback(fbA,`Trabajo "${jD}..." borrado.`,'success');dataLoaded.jobs=false;if(['jobs','deadlines','status','reports','advanced-reports'].includes(activeSectionId))loadDataForSection(activeSectionId);if(document.getElementById('job-id').value===jId)resetJobForm();}catch(e){console.error(`Error borrar job ${jId}:`,e);alert(`Error:${e.message}`);}}

// --- Funciones: CRUD Materiales (Admin) ---
document.getElementById('material-form-admin')?.addEventListener('submit', async (e) => { e.preventDefault(); if(currentUserRole!=='superadmin'||!db)return; const mId=document.getElementById('material-id-admin').value; const fb=document.getElementById('material-form-feedback-admin'); const sb=e.target.querySelector('button[type="submit"]'); showFeedback(fb,'','info'); const mD={name:document.getElementById('material-name-admin').value.trim(),thickness:parseFloat(document.getElementById('material-thickness-admin').value)||null,costPerSheet:parseFloat(document.getElementById('material-cost-admin').value)||0,width:parseFloat(document.getElementById('material-width-admin').value)||null,height:parseFloat(document.getElementById('material-height-admin').value)||null,available:document.getElementById('material-availability-admin').checked}; let errs=[];if(!mD.name)errs.push('Nombre');if(!mD.thickness||mD.thickness<=0)errs.push('Grosor>0');if(mD.costPerSheet<0)errs.push('Costo>=0');if(!mD.width||mD.width<=0)errs.push('Ancho>0');if(!mD.height||mD.height<=0)errs.push('Alto>0'); if(errs.length>0){showFeedback(fb,`Inválido:${errs.join(', ')}.`,'error');return;} if(sb)sb.disabled=true; try{showFeedback(fb,mId?'Actualizando...':'Guardando...','info'); if(mId){await db.collection('materials').doc(mId).update(mD);materialsData[mId]={...materialsData[mId],...mD};showFeedback(fb,'Material actualizado.','success');}else{const dR=await db.collection('materials').add(mD);materialsData[dR.id]={...mD,id:dR.id};showFeedback(fb,'Material añadido.','success');} resetMaterialFormAdmin();populateMaterialsAdminTable();populateMaterialDropdown('job-material');}catch(e){console.error("Error guardar mat:",e);showFeedback(fb,`Error:${e.message}`,'error');}finally{if(sb)sb.disabled=false;}});
function editMaterialAdmin(mId){if(currentUserRole!=='superadmin')return;const m=materialsData[mId];if(!m)return; document.getElementById('material-form-title-admin').textContent='Editar Material';document.getElementById('material-id-admin').value=m.id;document.getElementById('material-name-admin').value=m.name||'';document.getElementById('material-thickness-admin').value=m.thickness||'';document.getElementById('material-cost-admin').value=(m.costPerSheet!==undefined?m.costPerSheet:m.cost)||0;document.getElementById('material-width-admin').value=m.width||'';document.getElementById('material-height-admin').value=m.height||'';document.getElementById('material-availability-admin').checked=m.available!==false;showFeedback(document.getElementById('material-form-feedback-admin'),'','info');document.getElementById('material-form-admin').scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('material-name-admin').focus();}
function resetMaterialFormAdmin(){if(currentUserRole!=='superadmin')return;document.getElementById('material-form-title-admin').textContent='Añadir Material';const f=document.getElementById('material-form-admin');if(f)f.reset();document.getElementById('material-id-admin').value='';document.getElementById('material-availability-admin').checked=true;document.getElementById('material-width-admin').value='1300';document.getElementById('material-height-admin').value='900';const fb=document.getElementById('material-form-feedback-admin');if(fb)showFeedback(fb,'','info');}
async function deleteMaterialAdmin(mId){if(currentUserRole!=='superadmin'||!db)return;const mN=materialsData[mId]?.name||`ID ${mId}`;const iU=jobsData.some(j=>j.materialId===mId);let cM=`¿Borrar material "${mN}"?`;if(iU)cM+=`\n\n¡ATN! Usado en trabajos.`;cM+="\n\nIrreversible.";if(!confirm(cM))return; const fb=document.getElementById('material-form-feedback-admin'); try{showFeedback(fb,`Borrando "${mN}"...`,'info');await db.collection('materials').doc(mId).delete();delete materialsData[mId];showFeedback(fb,`"${mN}" borrado.`,'success');populateMaterialsAdminTable();populateMaterialDropdown('job-material');if(document.getElementById('material-id-admin').value===mId)resetMaterialFormAdmin();}catch(e){console.error("Error borrar mat:",e);showFeedback(fb,`Error:${e.message}`,'error');}}

// --- Funciones: Configuración Admin ---
function addMonthlyCostInput(k='',v=''){const c=document.getElementById('monthly-costs-container');if(!c)return; const d=document.createElement('div');d.className='flex items-center space-x-2 cost-entry mb-2'; d.innerHTML=`<input type="text" placeholder="Descripción" value="${k}" data-cost-key required class="form-input form-input-sm flex-grow"><input type="number" placeholder="0.00" value="${v}" step="0.01" min="0" data-cost-value required class="form-input form-input-sm w-28 text-right"><button type="button" onclick="removeMonthlyCostInput(this)" class="btn btn-danger action-button px-2 py-1" title="Eliminar">&times;</button>`; c.appendChild(d); d.querySelector('[data-cost-key]').focus();}
function removeMonthlyCostInput(btn){const d=btn.closest('.cost-entry'); if(d)d.remove();}
document.getElementById('config-form-admin')?.addEventListener('submit', async (e)=>{ e.preventDefault(); if(currentUserRole!=='superadmin'||!db)return; const fb=document.getElementById('config-form-feedback-admin'); const sb=e.target.querySelector('button[type="submit"]'); showFeedback(fb,'','info'); e.target.querySelectorAll('.border-red-500').forEach(el=>el.classList.remove('border-red-500')); const mI=document.getElementById('config-minutes-admin'); const mPM=parseInt(mI.value,10); const cE=document.querySelectorAll('#monthly-costs-container .cost-entry'); const mC={}; let iV=true; let errs=[]; if(isNaN(mPM)||mPM<=0){errs.push('Minutos>0.');mI.classList.add('border-red-500');iV=false;} cE.forEach((en,idx)=>{const kI=en.querySelector('[data-cost-key]'); const vI=en.querySelector('[data-cost-value]'); const k=kI.value.trim(); const vS=vI.value.trim(); const v=parseFloat(vS); if(k||vS){let eV=true; if(!k){errs.push(`F${idx+1}:Descrip.`);kI.classList.add('border-red-500');eV=false;} if(vS===''||isNaN(v)||v<0){errs.push(`F${idx+1}:Valor>=0.`);vI.classList.add('border-red-500');eV=false;} if(eV&&mC.hasOwnProperty(k)){errs.push(`F${idx+1}:Duplicado"${k}".`);kI.classList.add('border-red-500');eV=false;} if(eV)mC[k]=v; if(!eV)iV=false;} else { console.log(`Fila ${idx+1} ignorada por estar vacía.`); } }); if(!iV){showFeedback(fb,`Errores:${errs.join(' ')}`,'error');return;} if(sb)sb.disabled=true; const cfgUpd={minutes_per_month:mPM,monthly_costs:mC}; try{showFeedback(fb,'Guardando...','info');await db.collection('config').doc('main').set(cfgUpd,{merge:true});configData.minutes_per_month=mPM;configData.monthly_costs=mC;const tC=Object.values(mC).reduce((s,v)=>s+v,0);configData.cost_per_minute=mPM>0?tC/mPM:0; console.log("Config OK.Costo/min:",configData.cost_per_minute);populateConfigFormAdmin();showFeedback(fb,'Config guardada.','success');}catch(e){console.error("Error guardar config:",e);showFeedback(fb,`Error:${e.message}`,'error');}finally{if(sb)sb.disabled=false;}});

// --- Funciones: Generación PDF, Reportes, Asistente, WhatsApp y Utilidades ---
function showPdfLoading(show=true){const o=document.getElementById('pdf-loading-overlay'); if(o)o.style.display=show?'flex':'none';}
async function printTicket(jId){console.log(`PDF ticket:${jId}`);if(typeof window.jspdf?.jsPDF==='undefined'||typeof window.html2canvas==='undefined'){alert("Err:Librerías PDF.");return;}const{jsPDF}=window.jspdf;const j=jobsData.find(j=>j.id===jId);if(!j){alert(`Err:Trabajo ${jId} N/E.`);return;}const cli=clientsData[j.clientId];const mat=materialsData[j.materialId];const rA=document.getElementById('pdf-render-area');if(!rA){alert("Err interno:Render area N/E.");return;}showPdfLoading(true);const fC=j.finalCost||0;const dep=j.deposit||0;const out=Math.max(0,fC-dep);const cNF=cli?.name?.replace(/[^a-z0-9_]/gi,'_').substring(0,20)||'cliente';const fN=`ticket_${cNF}_${jId.substring(0,6)}.pdf`;let tH=`<h2>** TICKET **</h2><p><span class="detail-label">ID:</span>${j.id.substring(0,6)}</p><p><span class="detail-label">Pedido:</span>${formatDate(j.orderDate)}</p><p><span class="detail-label">Entrega:</span>${formatDate(j.deliveryDate)}</p><hr><p><strong>CLIENTE:</strong> ${cli?.name||'N/A'}</p>${cli?.phone?`<p><span class="detail-label">Tel:</span>${cli.phone}</p>`:''}<hr><p><strong>DETALLES:</strong></p><p style="white-space:pre-wrap;">${j.details||'-'}</p><p><span class="detail-label">Mat:</span>${mat?.name||'?'} ${mat?.thickness||'?'}mm</p>${(j.length&&j.width)?`<p><span class="detail-label">Med:</span>${j.length}x${j.width}mm</p>`:''}<p><span class="detail-label">Tipo:</span>${j.jobType||'N/A'}</p>${j.observations?`<hr><p><strong>Obs:</strong><br><span style="white-space:pre-wrap;">${j.observations}</span></p>`:''}<hr><div class="totals"><p class="item-line"><span>Total:</span><span>$${fC.toFixed(2)}</span></p><p class="item-line"><span>Seña:</span><span>$${dep.toFixed(2)}</span></p><p class="item-line"><strong><span>PENDIENTE:</span><span>$${out.toFixed(2)}</span></strong></p></div><hr><p style="text-align:center;font-size:8pt!important;margin-top:5px;">¡Gracias!</p>`;rA.innerHTML=tH;const oS={visibility:rA.style.visibility,zIndex:rA.style.zIndex,position:rA.style.position,left:rA.style.left,top:rA.style.top};rA.style.position='fixed';rA.style.left='0';rA.style.top='0';rA.style.visibility='hidden';rA.style.zIndex='-100';await new Promise(r=>setTimeout(r,100));try{const canvas=await html2canvas(rA,{scale:2,useCORS:true,logging:false,windowWidth:rA.scrollWidth,windowHeight:rA.scrollHeight});const imgData=canvas.toDataURL('image/png');const pdf=new jsPDF({orientation:'p',unit:'mm',format:[80,Math.max(80,canvas.height*(80/canvas.width)+10)]});const margin=3;const pW=pdf.internal.pageSize.getWidth()-(margin*2);const pH=(canvas.height*pW)/canvas.width;pdf.addImage(imgData,'PNG',margin,margin,pW,pH);pdf.save(fN);}catch(e){console.error("Error PDF ticket:",e);alert(`Error PDF:${e.message}`);}finally{rA.style.position=oS.position;rA.style.left=oS.left;rA.style.top=oS.top;rA.style.visibility=oS.visibility;rA.style.zIndex=oS.zIndex;rA.innerHTML='';showPdfLoading(false);console.log("PDF ticket fin.");}}
async function printCurrentSection(){console.log(`PDF sección:${activeSectionId}`);if(typeof window.jspdf?.jsPDF==='undefined'||typeof window.html2canvas==='undefined'){alert("Err:Libs PDF.");return;}const{jsPDF}=window.jspdf;const sE=document.getElementById(activeSectionId);if(!sE?.classList.contains('main-section')){alert("Err:Sección N/E.");return;}const nP=['home','login'];const fS=['new-job-form','admin-materials','admin-config','clients'];if(nP.includes(activeSectionId)){alert("Sección no exportable.");return;}if(fS.includes(activeSectionId)&&!confirm("Exportar form puede N/S ideal.¿OK?"))return;const tE=sE.querySelector('.data-table');const cC=sE.querySelector('.content-card > div:not(.no-print):not(form)');const eTP=tE||cC||sE;if(!eTP){alert("No hay contenido.");return;}console.log("Elto PDF:",eTP.tagName,eTP.id||'');let hE=[];eTP.querySelectorAll('.no-print').forEach(el=>{if(el.offsetParent!==null){hE.push({element:el,originalDisplay:el.style.display});el.style.display='none';}});if(eTP.tagName==='TABLE'){eTP.querySelectorAll('thead th:last-child,tbody td:last-child').forEach(el=>{if(el.offsetParent!==null){hE.push({element:el,originalDisplay:el.style.display});el.style.display='none';}});}showPdfLoading(true);await new Promise(r=>setTimeout(r,150));try{const canvas=await html2canvas(eTP,{scale:1.5,useCORS:true,logging:false,windowWidth:eTP.scrollWidth,windowHeight:eTP.scrollHeight});const imgData=canvas.toDataURL('image/png');const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});const iProps=pdf.getImageProperties(imgData);const pW=pdf.internal.pageSize.getWidth()-20;const pH=(iProps.height*pW)/iProps.width;const pageH=pdf.internal.pageSize.getHeight()-20;let hL=pH,pos=10;pdf.addImage(imgData,'PNG',10,pos,pW,pH);hL-=pageH;while(hL>0){pos-=pageH;pdf.addPage();pdf.addImage(imgData,'PNG',10,pos,pW,pH);hL-=pageH;}const todayFmt=new Date().toISOString().split('T')[0].replace(/-/g,''); pdf.save(`seccion_${activeSectionId}_${todayFmt}.pdf`);}catch(e){console.error("Error PDF sección:",e);alert(`Error PDF:${e.message}`);}finally{hE.forEach(item=>{item.element.style.display=item.originalDisplay||'';});showPdfLoading(false);console.log("PDF sección fin.");}}
function generateDailyReport(){if(currentUserRole!=='superadmin')return;const oD=document.getElementById('daily-report-output');const fE=document.getElementById('advanced-reports-feedback');if(!oD||!fE)return;showFeedback(fE,'','info');if(!dataLoaded.jobs){showFeedback(fE,'Datos N/C.','error');oD.innerHTML='<p class="text-red-500">Error: Datos N/D.</p>';return;}const tS=new Date().toISOString().split('T')[0]; const tJ=jobsData.filter(j=>j.orderDate===tS);const cnt=tJ.length;const tA=tJ.reduce((s,j)=>s+(j.finalCost||0),0);const tD=tJ.reduce((s,j)=>s+(j.deposit||0),0);const tO=Math.max(0,tA-tD);if(cnt===0)oD.innerHTML=`<p>No hubo trabajos hoy (${formatDate(tS)}).</p>`;else oD.innerHTML=`<p><strong>Reporte ${formatDate(tS)}:</strong></p><ul class="list-disc list-inside ml-4 space-y-1 text-sm"><li>Cant:<strong>${cnt}</strong></li><li>Total:<strong>$${tA.toFixed(2)}</strong></li><li>Señado:<strong>$${tD.toFixed(2)}</strong></li><li>Pendiente:<strong>$${tO.toFixed(2)}</strong></li></ul>`;showFeedback(fE,'Reporte diario OK.','success');}
function generateMonthlyReport(){if(currentUserRole!=='superadmin')return;const oD=document.getElementById('monthly-report-output');const fE=document.getElementById('advanced-reports-feedback');if(!oD||!fE)return;showFeedback(fE,'','info');if(!dataLoaded.jobs){showFeedback(fE,'Datos N/C.','error');oD.innerHTML='<p class="text-red-500">Error: Datos N/D.</p>';return;}const report={};const now=new Date(); const monthNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]; for(let i=0;i<12;i++){const mD=new Date(now.getFullYear(),now.getMonth()-i,1);const key=`${mD.getFullYear()}-${String(mD.getMonth()+1).padStart(2,'0')}`;report[key]={total:0,deposit:0,outstanding:0,count:0,label:`${monthNames[mD.getMonth()]} ${mD.getFullYear()}`};}jobsData.forEach(job=>{if(job.orderDate){const jMK=job.orderDate.substring(0,7);if(report[jMK]){const c=job.finalCost||0;const d=job.deposit||0;report[jMK].count++;report[jMK].total+=c;report[jMK].deposit+=d;report[jMK].outstanding+=Math.max(0,c-d);}}});const sK=Object.keys(report).sort().reverse();let tH=`<table id="monthly-report-table" class="data-table w-full text-sm"><thead><tr><th>Mes</th><th>Cant.</th><th>Total ($)</th><th>Señado ($)</th><th>Pendiente ($)</th></tr></thead><tbody>`;if(jobsData.length===0)tH+=`<tr><td colspan="5" class="tc py3 g5">No hay datos.</td></tr>`;else sK.forEach(key=>{const d=report[key];tH+=`<tr><td>${d.label}</td><td class="tc">${d.count}</td><td class="tr">${d.total.toFixed(2)}</td><td class="tr">${d.deposit.toFixed(2)}</td><td class="tr ${d.outstanding>0.005?'text-red-600 font-semibold':''}">${d.outstanding.toFixed(2)}</td></tr>`;});tH+=`</tbody></table>`;oD.innerHTML=tH;showFeedback(fE,'Reporte mensual OK.','success');}
function calcularTiempoAsistente(){const tipo=document.getElementById("tipoTrabajo").value; const aI=document.getElementById("ancho"); const anI=document.getElementById("alto"); const rD=document.getElementById("resultadoAsistente"); const aMm=parseFloat(aI.value); const anMm=parseFloat(anI.value); if(isNaN(aMm)||isNaN(anMm)||aMm<=0||anMm<=0){rD.innerHTML=`<strong class="text-red-600">Error: Alto/Ancho inv.</strong>`; rD.style.display="block"; return;} const FAC_C3=0.34,FAC_C5=0.51,FAC_G=0.38,FAC_M=0.05; const aCm=aMm/10;const anCm=anMm/10;const pCm=2*(aCm+anCm);const areaCm2=aCm*anCm; let tS=0;let dets=[]; switch(tipo){case"corte3":tS=pCm*FAC_C3;dets.push(`C3(${pCm.toFixed(1)}cm): ${tS.toFixed(1)}s`);break; case"corte5":tS=pCm*FAC_C5;dets.push(`C5(${pCm.toFixed(1)}cm): ${tS.toFixed(1)}s`);break; case"grabado":tS=areaCm2*FAC_G;dets.push(`G(${areaCm2.toFixed(1)}cm²): ${tS.toFixed(1)}s`);break; case"marcado":tS=pCm*FAC_M;dets.push(`M(${pCm.toFixed(1)}cm): ${tS.toFixed(1)}s`);break; case"combinado3":let tC3=pCm*FAC_C3;let tG3=areaCm2*FAC_G;tS=tC3+tG3;dets=[`C3:${tC3.toFixed(1)}s`,`G:${tG3.toFixed(1)}s`];break; case"combinado5":let tC5=pCm*FAC_C5;let tG5=areaCm2*FAC_G;tS=tC5+tG5;dets=[`C5:${tC5.toFixed(1)}s`,`G:${tG5.toFixed(1)}s`];break; default:rD.innerHTML=`<strong class="text-red-600">Tipo N/V.</strong>`;rD.style.display="block";return;} const tM=tS/60; rD.innerHTML=`<strong>T. Est:</strong><br>${dets.join("<br>")}<br><br><strong>Total: ${tS.toFixed(1)}s (${tM.toFixed(1)}m)</strong><p class="text-xs text-gray-500 mt-2">Aprox.</p>`; rD.style.display="block";}
function actualizarVisibilidadAsistente(){const rD=document.getElementById("resultadoAsistente"); if(rD)rD.style.display="none";}
function sendWhatsAppMessage(jId){const j=jobsData.find(j=>j.id===jId); if(!j){alert(`Err:Trabajo ${jId} N/E.`);return;} const cli=clientsData[j.clientId]; if(!cli){alert("Err:Cliente N/E.");return;} if(!cli.phone){alert(`Cli ${cli.name||''} no tiene tel.`);return;} const clPh=cli.phone.replace(/\D/g,''); let waN=clPh; if(waN.length>8&&!waN.startsWith('549')) waN=`549${waN}`; else if(waN.length<=8){alert(`Num"${cli.phone}" inv.`);return;} const cost=j.finalCost||0; const dep=j.deposit||0; const out=Math.max(0,cost-dep); const dets=j.details||'(S/D)'; const del=formatDate(j.deliveryDate); const msg=`Hola ${cli.name||'Cliente'}, de Corte Laser TQL.\n\nRef: *${dets}*\nEntrega: *${del}*\n\nTotal: $${cost.toFixed(2)}\nSeña: $${dep.toFixed(2)}\nPendiente: $${out.toFixed(2)}\n\n¡Gracias!`; const encMsg=encodeURIComponent(msg); const url=`https://wa.me/${waN}?text=${encMsg}`; console.log(`WA ${waN}...`); window.open(url,'_blank');}

// --- Funciones Utilitarias ---
function showFeedback(el,msg,type='info'){if(!el){console.warn("showFeedback:Elto N/E:",msg);return;} el.className='feedback mt-2';el.textContent=msg; if(msg){el.style.display='block';el.classList.add(`feedback-${type}`);if(type==='success'||type==='info'){setTimeout(()=>{if(el.textContent===msg){el.textContent='';el.style.display='none';el.className='feedback mt-2';}},4000);}}else{el.style.display='none';}}
// ***** formatDate (Revertido a formato simple) *****
function formatDate(dStr) {
    if (!dStr || typeof dStr !== 'string' || dStr.length < 10) return '-';
    try {
        const [y, m, d] = dStr.substring(0, 10).split('-');
        if (!y || !m || !d || y.length !== 4) return dStr; // Retorna original si formato no es YYYY-MM-DD
        return `${d}/${m}/${y}`;
    } catch (e) {
        console.warn(`formatDate (simple): Error formateando '${dStr}':`, e);
        return dStr; // Retorna original en caso de error
    }
}
// ***** parseDateForComparison (Revertido a Date nativo) *****
function parseDateForComparison(dStr) {
    if (!dStr || typeof dStr !== 'string' || dStr.length < 10) return null;
    try {
        // Crea objeto Date asumiendo YYYY-MM-DD en hora local 00:00:00
        const d = new Date(dStr.substring(0, 10) + 'T00:00:00');
        if (isNaN(d.getTime())) return null; // Verifica si la fecha es válida
        d.setHours(0, 0, 0, 0); // Asegura que la hora sea 00:00:00 local
        return d;
    } catch (e) {
        console.error(`parseDateForComparison (simple): Error parseando '${dStr}':`, e);
        return null;
    }
}
function getStatusClass(s){switch(s){case'Encargado':return'status-encargado';case'Procesando':return'status-procesando';case'Terminado':return'status-terminado';default:return'bg-gray-400 text-gray-800';}}

// --- Inicialización al Cargar el DOM ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM cargado y listo.");
    const yS=document.getElementById('current-year'); if(yS)yS.textContent= new Date().getFullYear();
    document.getElementById('job-job-type')?.dispatchEvent(new Event('change'));
    if(typeof flatpickr!=='undefined'){const fCfg={locale:"es",altInput:true,altFormat:"d/m/Y",dateFormat:"Y-m-d",allowInput:true,time_24hr:true,errorHandler:(e)=>console.error("Flatpickr Err:",e)}; try{flatpickr("#job-order-date",fCfg);flatpickr("#job-delivery-date",{...fCfg,minDate:"today"});console.log("Flatpickr OK.");}catch(e){console.error("Error Flatpickr init:",e);}}else console.warn("Flatpickr N/D.");
    document.getElementById('client-search')?.addEventListener('input',filterClients); document.getElementById('job-search')?.addEventListener('input',filterJobs);
    // Asignación del listener al botón de login principal (Corregido)
    const loginBtnMain=document.getElementById('admin-login-button-main'); if(loginBtnMain)loginBtnMain.addEventListener('click',showLoginSection); else console.error("Botón 'admin-login-button-main' N/E.");
    // Verificación inicial de auth
    if(typeof auth==='undefined'){console.error("Fallo crítico:Auth N/I.");showLoginSection();document.body.className='public-only';} else console.log("Esperando estado auth...");
});