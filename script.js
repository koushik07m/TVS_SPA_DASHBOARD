/* =====================================================================
   ACCESS CONTROL
   ---------------------------------------------------------------------
   Accounts live here. EDIT THESE before you host the file — change every
   username/password to something real, then re-save.
   role: 'admin'  -> full access (add / upload / delete / reset)
   role: 'viewer' -> browse, search, drill into models/customers, export
                     Excel only. All edit controls are hidden and blocked.
   Because this is a single self-contained HTML file (no server), this
   login is a practical access gate for your team, not bank-grade
   security — anyone who opens the file in a text editor can still see
   this list. Don't reuse these passwords anywhere sensitive.

   ADMIN_SIGNUP_CODE below is asked for whenever someone tries to create
   a new Admin account, or reset the password on an existing Admin
   account, from the login page. Change it to something only your real
   admins know. Users signing up / resetting as "User" never need it.
===================================================================== */
/* ===================================================================
   SUPABASE CLOUD STORAGE (replaces Anthropic's window.storage so cross-
   device sync also works when this file is hosted outside Claude.ai,
   e.g. on Netlify). Fill in your project's URL and anon key below —
   get these from Supabase Dashboard > Settings > API.
   Create this table first (SQL editor in Supabase):

     create table kv_store (
       key text primary key,
       value text,
       updated_at timestamptz default now()
     );
     alter table kv_store enable row level security;
     create policy "public read" on kv_store for select using (true);
     create policy "public write" on kv_store for insert with check (true);
     create policy "public update" on kv_store for update using (true);
     create policy "public delete" on kv_store for delete using (true);

   NOTE: these policies allow anyone with the anon key (visible in this
   HTML file) to read/write the table. That matches how login accounts
   already work in this file (plaintext passwords in a shared blob), but
   if you want this locked down further, restrict these policies later.
=================================================================== */
const SUPABASE_URL = 'https://blicqwdfdamacprhuhaf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ocMHqRyp6igsIZzeqEmLfQ_o7Om8iLt';
(function setupSupabaseStorage(){
  if(SUPABASE_URL.indexOf('YOUR-PROJECT') !== -1) return; // not configured yet
  if(typeof window.supabase === 'undefined') return; // SDK failed to load
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.storage = {
    async get(key){
      const { data, error } = await sb.from('kv_store').select('value').eq('key', key).maybeSingle();
      if(error || !data) return null;
      return { key, value: data.value };
    },
    async set(key, value){
      const { error } = await sb.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() });
      if(error){ console.warn('supabase set failed', error); return null; }
      return { key, value };
    },
    async delete(key){
      const { error } = await sb.from('kv_store').delete().eq('key', key);
      if(error) return null;
      return { key, deleted: true };
    },
    async list(prefix){
      let q = sb.from('kv_store').select('key');
      if(prefix) q = q.like('key', prefix + '%');
      const { data, error } = await q;
      if(error) return null;
      return { keys: (data||[]).map(r=>r.key), prefix };
    }
  };
})();

const ADMIN_SIGNUP_CODE = 'Tvs@AdminCode1';
const DEFAULT_USERS = {
  'manager': { password: 'Tvs@Manager1', role: 'manager', label: 'Manager' },
  'admin':   { password: 'Tvs@Admin1',   role: 'admin',   label: 'Admin'   },
  'viewer':  { password: 'Tvs@Viewer1',  role: 'viewer',  label: 'Viewer'  }
};
const ROLE_LABELS = { manager: 'Manager', admin: 'Admin', viewer: 'Viewer' };
const USERS_KEY = 'tvsUsersStore';
function loadUsers(){
  try{
    const raw = localStorage.getItem(USERS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object' && Object.keys(parsed).length) return parsed;
    }
  }catch(e){}
  const initial = JSON.parse(JSON.stringify(DEFAULT_USERS));
  try{ localStorage.setItem(USERS_KEY, JSON.stringify(initial)); }catch(e){}
  return initial;
}
function saveUsers(){
  try{ localStorage.setItem(USERS_KEY, JSON.stringify(USERS)); }catch(e){}
  saveUsersRemote();
}
let USERS = loadUsers();
const AUTH_KEY = 'tvsAuthSession';

/* ===== SHARED ACCOUNT SYNC =====
   Login accounts used to live only in this browser's localStorage, so an
   account created on one device didn't exist on another. USERS now also syncs
   through the same shared cloud storage used for the sales records, so
   sign-ups, password changes and deletions made on any device are visible
   everywhere. localStorage is kept as an instant-loading local cache and as
   a fallback if shared storage isn't reachable (e.g. file opened outside
   Claude.ai). */
const SHARED_USERS_KEY = 'users';
async function loadUsersRemote(){
  if(!hasSharedStorage()) return null;
  try{
    const res = await window.storage.get(SHARED_USERS_KEY, true);
    if(!res || res.value===undefined || res.value===null) return null;
    const parsed = JSON.parse(res.value);
    return (parsed && typeof parsed==='object' && Object.keys(parsed).length) ? parsed : null;
  }catch(e){ return null; }
}
async function saveUsersRemote(){
  if(!hasSharedStorage()) return;
  try{ await window.storage.set(SHARED_USERS_KEY, JSON.stringify(USERS), true); }
  catch(e){ console.warn('shared account save failed', e); }
}
let _usersSynced = false;
function syncUsersFromCloud(){
  return loadUsersRemote().then(remote=>{
    if(remote){
      USERS = remote;
      try{ localStorage.setItem(USERS_KEY, JSON.stringify(USERS)); }catch(e){}
      renderAccountsListSafe();
    } else {
      // Nothing saved in the cloud yet — publish what this device has so
      // every other device starts from the same baseline.
      saveUsersRemote();
    }
    _usersSynced = true;
    setLoginBusy(false);
  }).catch(()=>{ _usersSynced = true; setLoginBusy(false); });
}
function renderAccountsListSafe(){ try{ if(typeof renderAccountsList==='function') renderAccountsList(); }catch(e){} }
function setLoginBusy(isBusy){
  const btn = document.getElementById('loginSubmit');
  if(!btn) return;
  btn.disabled = isBusy;
  btn.style.opacity = isBusy ? '.6' : '';
  const err = document.getElementById('loginError');
  if(err) err.textContent = isBusy ? 'Syncing accounts…' : (err.textContent==='Syncing accounts…' ? '' : err.textContent);
}
setLoginBusy(true);
syncUsersFromCloud();

// Kept as a no-op shim: earlier code used to repopulate a <select>. The login
// field is now a plain ID input, so there is nothing to (re)populate — but we
// keep the function name around since other code still calls it.
function populateUserDropdown(){}

let loginRoleMode = 'admin'; // 'admin' -> Admin/Manager accounts, 'user' -> Viewer accounts
function roleMatchesMode(role, mode){
  if(mode === 'admin') return role === 'admin' || role === 'manager';
  return role === 'viewer';
}
function setLoginRoleMode(mode){
  loginRoleMode = mode === 'user' ? 'user' : 'admin';
  const adminTab = document.getElementById('roleTabAdmin');
  const userTab = document.getElementById('roleTabUser');
  const label = document.getElementById('loginUserLabel');
  const input = document.getElementById('loginUser');
  const isAdminMode = loginRoleMode === 'admin';
  if(adminTab){ adminTab.classList.toggle('active', isAdminMode); adminTab.setAttribute('aria-selected', String(isAdminMode)); }
  if(userTab){ userTab.classList.toggle('active', !isAdminMode); userTab.setAttribute('aria-selected', String(!isAdminMode)); }
  if(label) label.textContent = isAdminMode ? 'Admin ID' : 'User ID';
  if(input) input.placeholder = isAdminMode ? 'Enter your Admin ID' : 'Enter your User ID';
  const err = document.getElementById('loginError');
  if(err) err.textContent = '';
}
document.getElementById('roleTabAdmin').addEventListener('click', ()=> setLoginRoleMode('admin'));
document.getElementById('roleTabUser').addEventListener('click', ()=> setLoginRoleMode('user'));
setLoginRoleMode('admin');

function getSession(){
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null'); }
  catch(e){ return null; }
}
function setSession(username, role, label){
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ username, role, label }));
}
function clearSession(){
  sessionStorage.removeItem(AUTH_KEY);
}
function isManager(){
  const s = getSession();
  return !!s && (s.role === 'manager' || s.role === 'admin');
}
function canUpload(){
  const s = getSession();
  return !!s && (s.role === 'manager' || s.role === 'admin');
}
// Kept for compatibility with any other admin-tier checks: now means "manager" (full access).
function isAdmin(){ return isManager(); }
function applyRoleToBody(role, label){
  document.body.classList.remove('role-manager','role-admin','role-viewer');
  document.body.classList.add(role === 'manager' ? 'role-manager' : (role === 'admin' ? 'role-admin' : 'role-viewer'));
  const lbl = document.getElementById('logoutLabel');
  if(lbl) lbl.textContent = `Sign Out (${label})`;
  // Admins/Managers always get the full-access view; Viewers always get the
  // restricted browse-only view. There is no manual panel toggle anymore.
  setPanel(role === 'viewer' ? 'user' : 'admin');
}
const PANEL_KEY = 'tvsPanelMode';
function setPanel(panel){
  const p = panel === 'user' ? 'user' : 'admin';
  document.body.setAttribute('data-panel', p);
  try{ sessionStorage.setItem(PANEL_KEY, p); }catch(e){}
}
function showLoginGate(errorMsg){
  const gate = document.getElementById('loginGate');
  gate.classList.remove('hidden');
  setLoginRoleMode('admin');
  document.getElementById('loginError').textContent = errorMsg || '';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  setTimeout(()=>document.getElementById('loginUser').focus(), 50);
}
function hideLoginGate(){
  document.getElementById('loginGate').classList.add('hidden');
}
function attemptLogin(){
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const acct = USERS[u];
  if(!acct || acct.password !== p){
    const idLabel = loginRoleMode === 'admin' ? 'Admin ID' : 'User ID';
    document.getElementById('loginError').textContent = `Incorrect ${idLabel} or password.`;
    return;
  }
  if(!roleMatchesMode(acct.role, loginRoleMode)){
    document.getElementById('loginError').textContent = loginRoleMode === 'admin'
      ? 'This ID is not an Admin/Manager account. Switch to "User" to sign in.'
      : 'This ID is an Admin/Manager account. Switch to "Admin" to sign in.';
    return;
  }
  setSession(u, acct.role, acct.label);
  applyRoleToBody(acct.role, acct.label);
  hideLoginGate();
}
document.getElementById('loginSubmit').addEventListener('click', attemptLogin);
document.getElementById('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
document.getElementById('loginUser').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('loginPass').focus(); });
document.getElementById('pwToggle').addEventListener('click', ()=>{
  const pw = document.getElementById('loginPass');
  const icon = document.getElementById('pwToggleIcon');
  const showing = pw.type === 'text';
  pw.type = showing ? 'password' : 'text';
  document.getElementById('pwToggle').setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  icon.innerHTML = showing
    ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a17.9 17.9 0 0 1-3.3 4.1M6.6 6.6A17.6 17.6 0 0 0 1 12s4 7 11 7c1.2 0 2.3-.16 3.3-.46"/>';
  pw.focus();
});
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  if(!confirm('Sign out?')) return;
  clearSession();
  location.reload();
});

(function initAuth(){
  const s = getSession();
  if(s && USERS[s.username] && USERS[s.username].role === s.role){
    applyRoleToBody(s.role, s.label);
    hideLoginGate();
  } else {
    showLoginGate();
  }
})();
/* ===================== END ACCESS CONTROL ===================== */

/* ===================== ACCOUNT CREATION (LOGIN PAGE) ===================== */
function showSignupPanel(){
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('forgotPanel').style.display = 'none';
  document.getElementById('signupPanel').style.display = '';
  document.getElementById('signupError').textContent = '';
  document.getElementById('signupRole').value = 'viewer';
  toggleSignupAdminCodeField();
}
function showLoginPanelOnly(){
  document.getElementById('signupPanel').style.display = 'none';
  document.getElementById('forgotPanel').style.display = 'none';
  document.getElementById('loginPanel').style.display = '';
}
document.getElementById('showSignupBtn').addEventListener('click', showSignupPanel);
document.getElementById('showLoginBtn').addEventListener('click', showLoginPanelOnly);

function toggleSignupAdminCodeField(){
  const isAdmin = document.getElementById('signupRole').value === 'admin';
  const field = document.getElementById('signupAdminCodeField');
  field.style.display = isAdmin ? '' : 'none';
  if(!isAdmin) document.getElementById('signupAdminCode').value = '';
}
document.getElementById('signupRole').addEventListener('change', toggleSignupAdminCodeField);
toggleSignupAdminCodeField();

document.getElementById('signupSubmit').addEventListener('click', ()=>{
  const usernameEl = document.getElementById('signupUsername');
  const labelEl = document.getElementById('signupLabel');
  const roleEl = document.getElementById('signupRole');
  const adminCodeEl = document.getElementById('signupAdminCode');
  const passEl = document.getElementById('signupPass');
  const confirmEl = document.getElementById('signupPassConfirm');
  const errEl = document.getElementById('signupError');

  const username = usernameEl.value.trim();
  const label = labelEl.value.trim();
  const role = roleEl.value === 'admin' ? 'admin' : 'viewer';
  const adminCode = adminCodeEl.value;
  const password = passEl.value;
  const confirm = confirmEl.value;

  if(!username || !label || !password){
    errEl.textContent = 'Please fill in all fields.';
    return;
  }
  if(USERS[username]){
    errEl.textContent = 'That username is already taken.';
    return;
  }
  if(role === 'admin' && adminCode !== ADMIN_SIGNUP_CODE){
    errEl.textContent = 'Incorrect Admin Creation Code.';
    return;
  }
  if(password.length < 6){
    errEl.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if(password !== confirm){
    errEl.textContent = 'Passwords do not match.';
    return;
  }

  USERS[username] = { password, role, label };
  saveUsers();
  populateUserDropdown();

  errEl.textContent = '';
  showLoginPanelOnly();
  setLoginRoleMode(role === 'admin' ? 'admin' : 'user');
  document.getElementById('loginUser').value = username;
  document.getElementById('loginPass').focus();
  showToast('Account created', `Welcome, ${label}! Sign in to continue.`, false);

  usernameEl.value = ''; labelEl.value = ''; passEl.value = ''; confirmEl.value = '';
  adminCodeEl.value = ''; roleEl.value = 'viewer'; toggleSignupAdminCodeField();
});
/* ===================== END ACCOUNT CREATION ===================== */

/* ===================== FORGOT PASSWORD (LOGIN PAGE) ===================== */
function refreshForgotPanelForMode(){
  const isAdminMode = loginRoleMode === 'admin';
  document.getElementById('forgotTitle').textContent = isAdminMode ? 'Reset Admin Password' : 'Reset User Password';
  document.getElementById('forgotSub').textContent = isAdminMode
    ? 'Enter your Admin ID, the Admin Creation Code, and choose a new password.'
    : 'Enter your User ID and choose a new password.';
  document.getElementById('forgotUserLabel').textContent = isAdminMode ? 'Admin ID' : 'User ID';
  document.getElementById('forgotUser').placeholder = isAdminMode ? 'Enter your Admin ID' : 'Enter your User ID';
  document.getElementById('forgotAdminCodeField').style.display = isAdminMode ? '' : 'none';
  document.getElementById('forgotError').textContent = '';
}
function showForgotPanel(){
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('forgotPanel').style.display = '';
  refreshForgotPanelForMode();
  document.getElementById('forgotUser').value = document.getElementById('loginUser').value || '';
  document.getElementById('forgotAdminCode').value = '';
  document.getElementById('forgotNewPass').value = '';
  document.getElementById('forgotNewPassConfirm').value = '';
}
function showLoginFromForgot(){
  document.getElementById('forgotPanel').style.display = 'none';
  document.getElementById('loginPanel').style.display = '';
}
document.getElementById('showForgotBtn').addEventListener('click', showForgotPanel);
document.getElementById('showLoginFromForgotBtn').addEventListener('click', showLoginFromForgot);

document.getElementById('forgotSubmit').addEventListener('click', ()=>{
  const isAdminMode = loginRoleMode === 'admin';
  const userEl = document.getElementById('forgotUser');
  const adminCodeEl = document.getElementById('forgotAdminCode');
  const newPassEl = document.getElementById('forgotNewPass');
  const confirmEl = document.getElementById('forgotNewPassConfirm');
  const errEl = document.getElementById('forgotError');

  const username = userEl.value.trim();
  const newPassword = newPassEl.value;
  const confirm = confirmEl.value;

  if(!username || !newPassword){
    errEl.textContent = 'Please fill in all fields.';
    return;
  }
  const acct = USERS[username];
  if(!acct || !roleMatchesMode(acct.role, loginRoleMode)){
    errEl.textContent = isAdminMode
      ? 'No Admin account found with that ID.'
      : 'No User account found with that ID.';
    return;
  }
  if(isAdminMode && adminCodeEl.value !== ADMIN_SIGNUP_CODE){
    errEl.textContent = 'Incorrect Admin Creation Code.';
    return;
  }
  if(newPassword.length < 6){
    errEl.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if(newPassword !== confirm){
    errEl.textContent = 'Passwords do not match.';
    return;
  }

  acct.password = newPassword;
  saveUsers();

  errEl.textContent = '';
  showLoginFromForgot();
  document.getElementById('loginUser').value = username;
  document.getElementById('loginPass').value = '';
  document.getElementById('loginPass').focus();
  showToast('Password reset', `Your password has been updated. Sign in with your new password.`, false);
});
/* ===================== END FORGOT PASSWORD ===================== */

/* ===================== CHANGE PASSWORD (SELF-SERVICE) ===================== */
function pwShowMsg(text){
  const b = document.getElementById('pwSuccessBanner');
  const t = document.getElementById('pwSuccessText');
  if(!b || !t) return;
  t.textContent = text;
  b.classList.add('show');
  clearTimeout(pwShowMsg._t);
  pwShowMsg._t = setTimeout(()=> b.classList.remove('show'), 2600);
}

function openPasswordModal(){
  const session = getSession();
  if(!session){ showToast('Sign in required', 'Please sign in first.', true); return; }
  document.getElementById('changePasswordForm').reset();
  document.getElementById('accountUsername').value = session.username;
  setFieldError('fg-accountUsername', false);
  setFieldError('fg-currentPassword', false);
  setFieldError('fg-newPasswordSelf', false);
  setFieldError('fg-confirmPasswordSelf', false);
  document.getElementById('pwSuccessBanner').classList.remove('show');
  renderAccountsList();
  document.getElementById('overlay').classList.add('open');
  requestAnimationFrame(()=>document.getElementById('overlay').classList.add('show'));
  document.getElementById('pwModal').classList.add('open');
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('custModal').classList.remove('open');
  document.getElementById('addModal').classList.remove('open');
}
document.getElementById('changePasswordBtn').addEventListener('click', openPasswordModal);
document.getElementById('pwModalClose').addEventListener('click', closeDrawer);

document.getElementById('changePasswordForm').addEventListener('submit', e=>{
  e.preventDefault();
  const session = getSession();
  if(!session){ showToast('Sign in required', 'Please sign in first.', true); return; }
  const usernameEl = document.getElementById('accountUsername');
  const currentEl = document.getElementById('currentPassword');
  const newEl = document.getElementById('newPasswordSelf');
  const confirmEl = document.getElementById('confirmPasswordSelf');

  let ok = true;
  setFieldError('fg-accountUsername', false);
  setFieldError('fg-currentPassword', false);
  setFieldError('fg-newPasswordSelf', false);
  setFieldError('fg-confirmPasswordSelf', false);

  const oldUsername = session.username;
  const acct = USERS[oldUsername];
  const newUsername = (usernameEl.value || '').trim();

  if(!newUsername){ setFieldError('fg-accountUsername', true); ok = false; }
  if(newUsername && newUsername !== oldUsername && USERS[newUsername]){ setFieldError('fg-accountUsername', true); ok = false; }
  if(!acct || acct.password !== currentEl.value){ setFieldError('fg-currentPassword', true); ok = false; }
  const wantsPasswordChange = !!(newEl.value || confirmEl.value);
  if(wantsPasswordChange){
    if(!newEl.value || newEl.value.length < 6){ setFieldError('fg-newPasswordSelf', true); ok = false; }
    if(newEl.value !== confirmEl.value){ setFieldError('fg-confirmPasswordSelf', true); ok = false; }
  }
  if(!ok) return;

  if(wantsPasswordChange) acct.password = newEl.value;

  if(newUsername !== oldUsername){
    delete USERS[oldUsername];
    USERS[newUsername] = acct;
    setSession(newUsername, acct.role, acct.label);
  }
  saveUsers();
  populateUserDropdown();
  document.getElementById('changePasswordForm').reset();
  document.getElementById('accountUsername').value = newUsername;
  pwShowMsg(newUsername !== oldUsername ? 'Account updated. Username changed.' : 'Password updated.');
  renderAccountsList();
});

function renderAccountsList(){
  const list = document.getElementById('accountsList');
  if(!list) return;
  const session = getSession();
  const usernames = Object.keys(USERS).sort((a,b)=> a.localeCompare(b));
  if(!usernames.length){
    list.innerHTML = '<div class="accounts-empty">No accounts found.</div>';
    return;
  }
  list.innerHTML = usernames.map(username=>{
    const acct = USERS[username];
    const roleLabel = ROLE_LABELS[acct.role] || acct.role;
    const isSelf = session && session.username === username;
    return `<div class="account-row" data-username="${username}">
      <div class="account-row-info">
        <div class="account-row-name">${acct.label || username}</div>
        <div class="account-row-meta">${username} &middot; ${roleLabel}${isSelf ? ' &middot; signed in now' : ''}</div>
      </div>
      <button type="button" class="account-row-del" data-del-user="${username}" ${isSelf ? 'disabled title="You can\'t delete the account you\'re signed in with"' : ''}>Delete</button>
    </div>`;
  }).join('');
}

function deleteAccount(username){
  const acct = USERS[username];
  if(!acct) return;
  const session = getSession();
  if(session && session.username === username){
    showToast("Can't delete this account", "You're currently signed in with this account.", true);
    return;
  }
  if(!confirm(`Delete the account "${acct.label || username}" (${username})? This can't be undone.`)) return;
  delete USERS[username];
  saveUsers();
  populateUserDropdown();
  renderAccountsList();
  showToast('Account deleted', `"${acct.label || username}" has been removed.`, false);
}
document.getElementById('accountsList').addEventListener('click', e=>{
  const btn = e.target.closest('[data-del-user]');
  if(!btn || btn.disabled) return;
  deleteAccount(btn.getAttribute('data-del-user'));
});
/* ===================== END CHANGE PASSWORD ===================== */

const DATA = JSON.parse(document.getElementById('dashData').textContent);
const { years, models, modelData, modelTotals, statusByModel, yearTotals, statusTotals, records, totalVehicles, totalCustomers } = DATA;

/* Snapshot the pristine page markup at load time (before any charts, drawers
   or toasts mutate the DOM) so the "Download Updated File" button can produce
   a clean, fully-working HTML file with the current data baked in. */
const PRISTINE_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

const COLORS = { 'Lost Customer': '#6B7684', 'Recovered Customer': '#B23A2E', 'Other': '#9DA5B0' };
const STATUS_LABEL = { 'Lost Customer': 'Lost Customers', 'Recovered Customer': 'Recovered Customers', 'all': 'All Customers' };

function odometer(num, digits=6, accent='var(--odo-navy)', glow='var(--odo-navy-glow)'){
  const s = String(num).padStart(digits,'0');
  let html = `<div class="odometer" style="--accent-color:${accent};--accent-glow:${glow}">`;
  for(const ch of s) html += `<div class="odo-digit">${ch}</div>`;
  html += '</div>';
  return html;
}
function fmt(n){ return n.toLocaleString('en-IN'); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- Model x Year x Status index (built once from records) ---------- */
const modelYearStatus = {};   // model -> year -> {status: count}
const yearStatusTotals = {};  // year -> {status: count}
/* NOTE: There is no more "permanent baseline" dataset. The dashboard starts
   empty on every fresh install; the only data that shows is whatever has been
   uploaded/added and persisted to shared storage, and it stays there until the
   Reset button is used. rebuildFromRecords() below intentionally rebuilds all
   derived structures (years, models, modelData, modelTotals, statusByModel,
   yearTotals, statusTotals, modelYearStatus, yearStatusTotals) from an EMPTY
   array rather than from the embedded DATA.records blob, so any historical
   data baked into this file is ignored. The real data is loaded further down
   from shared storage (loadRecordsRemote) once it resolves. */
rebuildFromRecords([]);

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---------- KPI row ---------- */
function renderKPI(){
  const lost = statusTotals['Lost Customer']||0;
  const recovered = statusTotals['Recovered Customer']||0;
  const retentionRate = (lost+recovered)>0 ? ((recovered/(lost+recovered))*100).toFixed(1) : '0.0';
  const total = records.length;

  /* Overall first-sale -> last-sale date span (mirrors the per-model card logic),
     recomputed from `records` every render so it self-updates as data is added. */
  let dateRangeLabel = '';
  const datedAll = records.filter(r=>r[10]);
  if(datedAll.length){
    let mn = datedAll[0][10], mx = datedAll[0][10];
    datedAll.forEach(r=>{ if(r[10]<mn) mn=r[10]; if(r[10]>mx) mx=r[10]; });
    dateRangeLabel = mn===mx ? formatDisplayDate(mn) : `${formatDisplayDate(mn)} &ndash; ${formatDisplayDate(mx)}`;
  } else if(years.length){
    dateRangeLabel = `${years[0]}&ndash;${years[years.length-1]}`;
  }

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Total Vehicles Sold</div>
      ${odometer(total, 6)}
      <div class="kpi-sub">${dateRangeLabel ? `<b>${dateRangeLabel}</b> \u00b7 ` : ''}${models.length} models</div>
    </div>
    <div class="kpi kpi-clickable" id="kpiRecoveredCard" data-kpi-status="Recovered Customer" title="View recovered customer details">
      <div class="kpi-label"><span>Recovered Customers</span><span class="kpi-open-hint">View details →</span></div>
      ${odometer(recovered, 6, 'var(--odo-grey)', 'var(--odo-grey-glow)')}
      <div class="kpi-sub"><span class="dot" style="background:var(--red)"></span>${retentionRate}% retention rate</div>
    </div>
    <div class="kpi kpi-clickable" id="kpiLostCard" data-kpi-status="Lost Customer" title="View lost customer details">
      <div class="kpi-label"><span>Lost Customers</span><span class="kpi-open-hint">View details →</span></div>
      ${odometer(lost, 6, 'var(--odo-red)', 'var(--odo-red-glow)')}
      <div class="kpi-sub"><span class="dot" style="background:var(--teal)"></span>${(100-retentionRate).toFixed(1)}% churned</div>
    </div>
  `;
  document.getElementById('totalRecFooter').textContent = fmt(records.length);
}
renderKPI();
document.getElementById('kpiRow').addEventListener('click', e=>{
  const card = e.target.closest('[data-kpi-status]');
  if(card) openExplorer(card.dataset.kpiStatus);
});

/* ---------- Status filter (Lost / Recovered / All) ---------- */
let statusFilter = 'all';

function countForModel(model, year){
  if(statusFilter==='all') return (modelData[model]||{})[year] || 0;
  const ys = (modelYearStatus[model]||{})[year] || {};
  return ys[statusFilter] || 0;
}
function totalForModel(model){
  if(statusFilter==='all') return modelTotals[model];
  const sd = statusByModel[model]||{};
  return sd[statusFilter]||0;
}

/* ---------- Model grid ---------- */
let currentSort = 'count';
let modelFilterText = '';
function getRankByCount(){ return models.slice().sort((a,b)=>modelTotals[b]-modelTotals[a]); }

function recentMomentum(model){
  const yd = modelData[model];
  return years.slice(-3).reduce((a,y)=>a+(yd[y]||0),0);
}
function recentMomentumFiltered(model){
  return years.slice(-3).reduce((a,y)=>a+countForModel(model,y),0);
}

function renderGrid(){
  const rankByCount = getRankByCount();
  let list = models.filter(m => m.toLowerCase().includes(modelFilterText.toLowerCase()));
  if(currentSort==='count') list.sort((a,b)=>totalForModel(b)-totalForModel(a));
  else if(currentSort==='name') list.sort((a,b)=>a.localeCompare(b));
  else if(currentSort==='recent') list.sort((a,b)=>recentMomentumFiltered(b)-recentMomentumFiltered(a));

  const filterNote = statusFilter==='all' ? '' : ` \u00b7 showing ${STATUS_LABEL[statusFilter]}`;
  document.getElementById('modelCountHint').textContent = `${list.length} of ${models.length} models${filterNote}`;

  const grid = document.getElementById('modelGrid');
  if(list.length===0){
    grid.innerHTML = `<div class="empty-state">No models match "${esc(modelFilterText)}"</div>`;
    return;
  }

  grid.innerHTML = list.map((m)=>{
    const total = totalForModel(m);
    const barMax = Math.max(...years.map(y=>countForModel(m,y)), 1);
    const bars = years.map(y=>{
      const v = countForModel(m,y);
      const h = Math.max(2, Math.round((v/barMax)*32));
      return `<div class="mc-bar" style="height:${h}px" title="${y}: ${v}"></div>`;
    }).join('');
    const sd = statusByModel[m] || {};
    const lostN = sd['Lost Customer']||0, recN = sd['Recovered Customer']||0;
    const lostCls = statusFilter==='Lost Customer' ? ' mc-status-active' : '';
    const recCls = statusFilter==='Recovered Customer' ? ' mc-status-active' : '';
    const countLabel = statusFilter==='all' ? 'units sold' : STATUS_LABEL[statusFilter].toLowerCase();
    let rangeLabel = `${years[0]}–${years[years.length-1]}`;
    const datedForM = records.filter(r=>r[1]===m && r[10]);
    if(datedForM.length){
      let mn = datedForM[0][10], mx = datedForM[0][10];
      datedForM.forEach(r=>{ if(r[10]<mn) mn=r[10]; if(r[10]>mx) mx=r[10]; });
      rangeLabel = mn===mx ? formatDisplayDate(mn) : `${formatDisplayDate(mn)} – ${formatDisplayDate(mx)}`;
    }
    return `
    <div class="model-card" data-model="${esc(m)}">
      <div class="mc-top">
        <div class="mc-name">${esc(m)}</div>
        <div class="mc-rank">#${rankByCount.indexOf(m)+1}</div>
      </div>
      <div class="mc-count">${fmt(total)}</div>
      <div class="mc-count-label">${countLabel} \u00b7 ${rangeLabel}</div>
      <div class="mc-spark">${bars}</div>
      <div class="mc-status">
        <span class="${recCls}"><span class="dot" style="background:var(--red)"></span>${recN} recovered</span>
        <span class="${lostCls}"><span class="dot" style="background:var(--teal)"></span>${lostN} lost</span>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.model-card').forEach(card=>{
    card.addEventListener('click', ()=> openDrawer(card.dataset.model));
  });
}
renderGrid();

document.getElementById('modelFilter').addEventListener('input', e=>{
  modelFilterText = e.target.value;
  renderGrid();
});
document.querySelectorAll('#modelSortPills .pill').forEach(p=>{
  p.addEventListener('click', ()=>{
    document.querySelectorAll('#modelSortPills .pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');
    currentSort = p.dataset.sort;
    renderGrid();
  });
});
document.querySelectorAll('#statusPills .pill').forEach(p=>{
  p.addEventListener('click', ()=>{
    document.querySelectorAll('#statusPills .pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');
    statusFilter = p.dataset.status;
    renderGrid();
  });
});

/* ---------- Year-wise Retention Report ---------- */
const yearReportModelSel = document.getElementById('yearReportModel');
function populateYearReportModelOptions(){
  const current = yearReportModelSel.value || '__ALL__';
  yearReportModelSel.querySelectorAll('option:not([value="__ALL__"])').forEach(o=>o.remove());
  models.slice().sort((a,b)=>a.localeCompare(b)).forEach(m=>{
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    yearReportModelSel.appendChild(opt);
  });
  if([...yearReportModelSel.options].some(o=>o.value===current)) yearReportModelSel.value = current;
}
populateYearReportModelOptions();

function renderYearReport(){
  const sel = yearReportModelSel.value;
  const body = document.getElementById('yearReportBody');

  let grandTotal=0, grandRec=0, grandLost=0;
  const rows = years.map(y=>{
    let total, rec, lostN;
    if(sel==='__ALL__'){
      total = yearTotals[y]||0;
      const ys = yearStatusTotals[y]||{};
      rec = ys['Recovered Customer']||0;
      lostN = ys['Lost Customer']||0;
    } else {
      const ys = (modelYearStatus[sel]||{})[y] || {};
      rec = ys['Recovered Customer']||0;
      lostN = ys['Lost Customer']||0;
      total = (modelData[sel]||{})[y] || 0;
    }
    grandTotal += total; grandRec += rec; grandLost += lostN;
    if(total===0 && rec===0 && lostN===0) return '';
    const retention = (rec+lostN)>0 ? ((rec/(rec+lostN))*100).toFixed(1) : '\u2014';
    const barWidth = (rec+lostN)>0 ? Math.round((rec/(rec+lostN))*60) : 0;
    return `<tr>
      <td class="yr-mono mono">${y}</td>
      <td class="yr-mono mono">${fmt(total)}</td>
      <td class="yr-mono mono" style="color:var(--red)">${fmt(rec)}</td>
      <td class="yr-mono mono" style="color:var(--teal)">${fmt(lostN)}</td>
      <td class="yr-mono mono">${retention}${retention!=='\u2014'?'%':''}<span class="yr-retain-bar" style="width:${barWidth}px"></span></td>
    </tr>`;
  }).join('');

  const overallRetention = (grandRec+grandLost)>0 ? ((grandRec/(grandRec+grandLost))*100).toFixed(1)+'%' : '\u2014';
  const totalRow = `<tr class="yr-total-row">
    <td class="yr-mono mono">All Years</td>
    <td class="yr-mono mono">${fmt(grandTotal)}</td>
    <td class="yr-mono mono" style="color:var(--red)">${fmt(grandRec)}</td>
    <td class="yr-mono mono" style="color:var(--teal)">${fmt(grandLost)}</td>
    <td class="yr-mono mono">${overallRetention}</td>
  </tr>`;

  body.innerHTML = (rows || `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-faint)">No data</td></tr>`) + totalRow;

  const modelLabel = sel==='__ALL__' ? 'all models' : sel;
  document.getElementById('yearReportHint').textContent = years.length ? `Showing ${modelLabel} \u00b7 ${years[0]}\u2013${years[years.length-1]}` : `Showing ${modelLabel}`;
}
renderYearReport();
yearReportModelSel.addEventListener('change', renderYearReport);

function openYearReportForModel(model){
  yearReportModelSel.value = model;
  renderYearReport();
  closeDrawer();
  document.getElementById('yearReportTable').scrollIntoView({behavior:'smooth', block:'center'});
}
document.getElementById('drawerYearReportLink').addEventListener('click', ()=>{
  openYearReportForModel(currentDrawerModel);
});

/* ---------- Drawer / drill-down ---------- */
let drawerRecords = [], recordPage = 0, currentDrawerModel = null;
const PAGE_SIZE = 12;

function renderYearChart(model, yd, highlightYear){
  const barMax = Math.max(...years.map(y=>yd[y]||0), 1);
  const scaleMax = Math.sqrt(barMax);
  const el = document.getElementById('yearChart');
  el.innerHTML = years.map(y=>{
    const v = yd[y]||0;
    const ys = (modelYearStatus[model]||{})[y] || {};
    const recN = ys['Recovered Customer']||0, lostN = ys['Lost Customer']||0, othN = Math.max(0, v-recN-lostN);
    const recPct = v>0 ? (recN/v)*100 : 0;
    const lostPct = v>0 ? (lostN/v)*100 : 0;
    const othPct = v>0 ? (othN/v)*100 : 0;
    // Square-root scale so smaller bars stay visible instead of shrinking to near-zero height
    let totalPct = v>0 ? Math.round((Math.sqrt(v)/scaleMax)*100) : 0;
    if(v>0) totalPct = Math.max(totalPct, 4);
    const hl = (highlightYear && y===highlightYear) ? ' hl' : '';
    const zero = v===0 ? ' zero' : '';
    const sel = (highlightYear && y===highlightYear) ? ' selected' : '';
    return `<div class="year-col${sel}" data-year="${y}">
      <div class="year-val">${v}</div>
      <div class="year-bar-track" title="${y}: ${recN} recovered, ${lostN} lost \u00b7 tap for month breakdown">
        <div class="year-bar${hl}${zero}" data-h="${totalPct}" style="height:0%;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;">
          <div style="height:${othPct}%;background:${COLORS['Other']};flex:none;"></div>
          <div style="height:${lostPct}%;background:${COLORS['Lost Customer']};flex:none;"></div>
          <div style="height:${recPct}%;background:${COLORS['Recovered Customer']};flex:none;"></div>
        </div>
      </div>
      <div class="year-label">'${String(y).slice(2)}</div>
      <div class="year-rl">
        <span class="yr-r"><span class="yr-dot" style="background:${COLORS['Recovered Customer']}"></span>${recN}</span>
        <span class="yr-l"><span class="yr-dot" style="background:${COLORS['Lost Customer']}"></span>${lostN}</span>
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      el.querySelectorAll('.year-bar').forEach(b=>{ b.style.height = b.dataset.h + '%'; });
    });
  });
  el.querySelectorAll('.year-col').forEach(col=>{
    col.addEventListener('click', ()=>{
      const y = Number(col.dataset.year);
      el.querySelectorAll('.year-col').forEach(c=>c.classList.remove('selected'));
      col.classList.add('selected');
      showMonthChart(model, y);
    });
  });
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---------- Sales timeline: units sold per exact date (Day / Week / Month) ---------- */
let tlGran = 'D';
let tlZoom = null;              // {min,max} visible timestamp window, or null for full
let tlFullDomain = [0, 0];      // [minT,maxT] of all data in the current render

/* Zoom the visible window toward centerT by `factor` (<1 = in, >1 = out), clamped to data. */
function tlSetZoomAround(centerT, factor, curMin, curMax){
  const [fmin, fmax] = tlFullDomain;
  const fullSpan = Math.max(1, fmax - fmin);
  const curSpan = Math.max(1, curMax - curMin);
  const minSpan = Math.max(86400000, fullSpan/2000);
  let span = Math.min(fullSpan, Math.max(minSpan, curSpan*factor));
  let nmin = centerT - (centerT - curMin) * (span/curSpan);
  let nmax = nmin + span;
  if(nmin < fmin){ nmin = fmin; nmax = fmin + span; }
  if(nmax > fmax){ nmax = fmax; nmin = fmax - span; }
  tlZoom = (span >= fullSpan - 1) ? null : {min:nmin, max:nmax};
  if(currentDrawerModel) renderDailyTimeline(currentDrawerModel);
}

/* Scroll the zoomed window left (dir<0) or right (dir>0) by `frac` of its span. */
function tlPan(dir, frac){
  if(!tlZoom) return;
  const [fmin, fmax] = tlFullDomain;
  const span = tlZoom.max - tlZoom.min;
  let nmin = tlZoom.min + span * (frac||0.3) * dir;
  let nmax = nmin + span;
  if(nmin < fmin){ nmin = fmin; nmax = fmin + span; }
  if(nmax > fmax){ nmax = fmax; nmin = fmax - span; }
  tlZoom = {min:nmin, max:nmax};
  if(currentDrawerModel) renderDailyTimeline(currentDrawerModel);
}

function tlFmt(t, gran){
  const d = new Date(t);
  const mo = MONTH_NAMES[d.getMonth()], yy = String(d.getFullYear()).slice(2);
  if(gran==='M') return `${mo} '${yy}`;
  return `${d.getDate()} ${mo} '${yy}`;
}

function tlBuckets(dates, gran){
  const map = new Map();
  const keyOf = (d)=>{
    if(gran==='D') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if(gran==='W'){ const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); t.setDate(t.getDate() - ((t.getDay()+6)%7)); return t.getTime(); }
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  };
  dates.forEach(d=>{ const k = keyOf(d); map.set(k, (map.get(k)||0)+1); });
  return [...map.entries()].map(([t,c])=>({t:+t, c})).sort((a,b)=>a.t-b.t);
}

/* For the smoothed (week/month) view, fill the gaps between buckets with zeros
   so the area line reflects quiet periods instead of interpolating across them. */
function tlFillZeros(buckets, gran){
  if(buckets.length < 2) return buckets;
  const have = new Map(buckets.map(b=>[b.t, b.c]));
  const out = [];
  if(gran==='M'){
    const d = new Date(buckets[0].t), end = buckets[buckets.length-1].t;
    while(d.getTime() <= end){ const t = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); out.push({t, c: have.get(t)||0}); d.setMonth(d.getMonth()+1); }
  } else {
    const step = 7*86400000;
    for(let t = buckets[0].t; t <= buckets[buckets.length-1].t; t += step) out.push({t, c: have.get(t)||0});
  }
  return out;
}

function tlNearest(plot, t){
  if(t <= plot[0].t) return plot[0];
  const last = plot.length-1;
  if(t >= plot[last].t) return plot[last];
  let lo = 0, hi = last;
  while(lo < hi){ const mid = (lo+hi)>>1; if(plot[mid].t < t) lo = mid+1; else hi = mid; }
  const a = plot[lo-1], b = plot[lo];
  return (t - a.t) <= (b.t - t) ? a : b;
}

function tlStatusBucket(s){ return (s==='Recovered Customer' || s==='Lost Customer') ? s : 'Other'; }

function tlReadFilters(){
  return {
    from: document.getElementById('tlFrom').value,
    to: document.getElementById('tlTo').value,
    year: document.getElementById('tlYear').value,
    status: [...document.querySelectorAll('#tlStatusGroup .tl-status-chip.active')].map(b=>b.dataset.s)
  };
}

/* Reset filters and repopulate the Year dropdown from the current model's dated records. */
function tlInitFilters(){
  tlZoom = null;
  document.getElementById('tlFrom').value = '';
  document.getElementById('tlTo').value = '';
  document.querySelectorAll('#tlStatusGroup .tl-status-chip').forEach(b=>b.classList.add('active'));
  const yrs = [...new Set(drawerRecords.filter(r=>r[10]).map(r=>r[0]))].sort((a,b)=>a-b);
  const sel = document.getElementById('tlYear');
  sel.innerHTML = '<option value="">All</option>' + yrs.map(y=>`<option value="${y}">${y}</option>`).join('');
}

function renderDailyTimeline(model){
  const chartEl = document.getElementById('timelineChart');
  const subEl = document.getElementById('timelineSub');
  document.getElementById('timelineTitle').innerHTML = `${esc(model)} — <b>sales timeline</b>`;

  const anyDated = drawerRecords.some(r=>r[10]);
  const f = tlReadFilters();
  const filtered = drawerRecords.filter(r=>{
    if(!r[10]) return false;
    if(f.from && r[10] < f.from) return false;
    if(f.to && r[10] > f.to) return false;
    if(f.year && String(r[0]) !== f.year) return false;
    return f.status.includes(tlStatusBucket(r[5]));
  });
  const dates = filtered
    .map(r=>{ const [y,m,d] = r[10].split('-').map(Number); return new Date(y, m-1, d); })
    .filter(d=>!isNaN(d));

  document.getElementById('tlCountBadge').innerHTML = `${fmt(dates.length)} <span>vehicle${dates.length===1?'':'s'}</span>`;

  if(dates.length === 0){
    subEl.textContent = '';
    const msg = anyDated ? 'No sales match these filters.' : `No exact sale dates recorded for ${esc(model)} yet.`;
    chartEl.innerHTML = `<div class="tl-empty">${msg}</div>`;
    return;
  }

  const buckets = tlBuckets(dates, tlGran);
  const peak = buckets.reduce((a,b)=> b.c>a.c ? b : a, buckets[0]);
  subEl.innerHTML = `${fmt(dates.length)} dated units · ${tlFmt(buckets[0].t,'D')} – ${tlFmt(buckets[buckets.length-1].t,'D')} · peak ${peak.c} on ${tlFmt(peak.t,'D')}`;

  const isBar = tlGran === 'D';
  const fullPlot = isBar ? buckets : tlFillZeros(buckets, tlGran);

  // Full data domain + effective (zoomed) domain
  tlFullDomain = [fullPlot[0].t, fullPlot[fullPlot.length-1].t];
  let minT = tlFullDomain[0], maxT = tlFullDomain[1];
  if(tlZoom){
    minT = Math.max(tlZoom.min, tlFullDomain[0]);
    maxT = Math.min(tlZoom.max, tlFullDomain[1]);
    if(!(maxT > minT)){ tlZoom = null; minT = tlFullDomain[0]; maxT = tlFullDomain[1]; }
  }
  let plot = fullPlot.filter(p=> p.t >= minT && p.t <= maxT);
  if(plot.length === 0){ tlZoom = null; minT = tlFullDomain[0]; maxT = tlFullDomain[1]; plot = fullPlot; }
  document.getElementById('tlZoomCtrls').classList.toggle('zoomed', !!tlZoom);
  if(tlZoom) subEl.innerHTML += ` · <b style="color:var(--navy)">zoom ${tlFmt(minT,'D')} – ${tlFmt(maxT,'D')}</b>`;

  const H=280, padL=12, padR=12, padT=30, padB=28;
  // Give every point real pixel breathing room instead of squeezing the whole
  // range into the panel width — the container scrolls horizontally when the
  // computed width exceeds what's visible.
  const containerW = chartEl.clientWidth || 1000;
  const pxPerPoint = tlGran === 'D' ? 5 : tlGran === 'W' ? 9 : 22;
  const W = Math.max(containerW, Math.round(plot.length * pxPerPoint) + padL + padR);
  const spanT = Math.max(1, maxT-minT);
  const maxC = Math.max(...plot.map(p=>p.c), 1);
  const X = t => padL + (spanT ? (t-minT)/spanT : 0.5) * (W-padL-padR);
  const Y = c => H-padB - (c/maxC) * (H-padT-padB);

  let marks;
  if(isBar){
    const bw = Math.max(1.2, Math.min(10, (W-padL-padR)/plot.length * 0.8));
    marks = plot.map(p=>`<rect x="${(X(p.t)-bw/2).toFixed(1)}" y="${Y(p.c).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.6,(H-padB)-Y(p.c)).toFixed(1)}" rx="${Math.min(1.5,bw/2).toFixed(1)}" fill="url(#tlGrad)"></rect>`).join('');
  } else {
    const line = plot.map((p,i)=>`${i?'L':'M'}${X(p.t).toFixed(1)} ${Y(p.c).toFixed(1)}`).join(' ');
    const area = `M${X(plot[0].t).toFixed(1)} ${H-padB} ` + plot.map(p=>`L${X(p.t).toFixed(1)} ${Y(p.c).toFixed(1)}`).join(' ') + ` L${X(plot[plot.length-1].t).toFixed(1)} ${H-padB} Z`;
    marks = `<path d="${area}" fill="url(#tlArea)"></path><path d="${line}" fill="none" stroke="var(--orange)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"></path>`;
  }

  const nTicks = Math.min(Math.max(6, Math.round(W/130)), plot.length);
  let xaxis = '';
  for(let i=0;i<nTicks;i++){
    const f = nTicks<=1 ? 0.5 : i/(nTicks-1);
    const t = minT + f*spanT, x = padL + f*(W-padL-padR);
    const anchor = i===0 ? 'start' : i===nTicks-1 ? 'end' : 'middle';
    xaxis += `<text class="tl-axis-label" x="${x.toFixed(1)}" y="${H-9}" text-anchor="${anchor}">${tlFmt(t, tlGran==='D'?'M':tlGran)}</text>`;
  }

  const prevScrollRatio = (chartEl.scrollWidth > chartEl.clientWidth + 2)
    ? chartEl.scrollLeft / (chartEl.scrollWidth - chartEl.clientWidth) : null;

  chartEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sales over time for ${esc(model)}">
    <defs>
      <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--orange-soft)"></stop><stop offset="1" stop-color="var(--orange)"></stop></linearGradient>
      <linearGradient id="tlArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--orange)" stop-opacity="0.28"></stop><stop offset="1" stop-color="var(--orange)" stop-opacity="0.02"></stop></linearGradient>
    </defs>
    <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="var(--line)" stroke-width="1"></line>
    <text class="tl-axis-label" x="${padL}" y="${padT-5}" text-anchor="start">${maxC}</text>
    ${marks}
    <rect id="tlSel" x="0" y="${padT}" width="0" height="${H-padB-padT}" fill="var(--navy)" fill-opacity="0.12" stroke="var(--navy)" stroke-opacity="0.4" stroke-width="1" opacity="0"></rect>
    <line id="tlHoverLine" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="var(--navy)" stroke-width="1" stroke-dasharray="3 3" opacity="0"></line>
    <circle id="tlHoverDot" r="4" fill="var(--navy)" stroke="#fff" stroke-width="1.5" opacity="0"></circle>
    ${xaxis}
  </svg><div class="tl-tip" id="tlTip"></div>`;

  // Keep the same relative scroll position across re-renders (filter/zoom
  // changes); on first render for a model, start scrolled to the most
  // recent data since that's usually what's most relevant.
  const maxScroll = chartEl.scrollWidth - chartEl.clientWidth;
  if(maxScroll > 0){
    chartEl.scrollLeft = prevScrollRatio === null ? maxScroll : prevScrollRatio * maxScroll;
  }

  const svg = chartEl.querySelector('svg');
  const hLine = chartEl.querySelector('#tlHoverLine');
  const hDot = chartEl.querySelector('#tlHoverDot');
  const sel = chartEl.querySelector('#tlSel');
  const tip = chartEl.querySelector('#tlTip');
  const clientXToT = (clientX)=>{
    const rect = svg.getBoundingClientRect();
    const internalX = ((clientX - rect.left) / rect.width) * W;
    return Math.max(minT, Math.min(maxT, minT + ((internalX - padL) / (W-padL-padR)) * spanT));
  };
  const hide = ()=>{ hLine.setAttribute('opacity',0); hDot.setAttribute('opacity',0); tip.style.opacity = 0; };
  let dragStartX = null, dragStartT = null;
  const move = (e)=>{
    const clientX = ('touches' in e ? e.touches[0].clientX : e.clientX);
    const t = clientXToT(clientX);
    if(dragStartX !== null){                 // drawing a zoom selection
      hide();
      const x1 = X(dragStartT), x2 = X(t);
      sel.setAttribute('x', Math.min(x1,x2)); sel.setAttribute('width', Math.abs(x2-x1)); sel.setAttribute('opacity', 1);
      return;
    }
    const p = tlNearest(plot, t);
    const px = X(p.t), py = Y(p.c);
    hLine.setAttribute('x1', px); hLine.setAttribute('x2', px); hLine.setAttribute('opacity', 1);
    hDot.setAttribute('cx', px); hDot.setAttribute('cy', py); hDot.setAttribute('opacity', 1);
    tip.style.left = px + 'px';
    tip.style.top = py + 'px';
    tip.textContent = `${p.c} on ${tlFmt(p.t, tlGran)}`;
    // Near the very top of the chart there isn't room for the tooltip above
    // the point (it would get clipped by the scroll container), so flip it
    // to sit below the point instead.
    tip.classList.toggle('tip-below', py < 42);
    tip.style.opacity = 1;
  };
  const startDrag = (e)=>{ dragStartX = e.clientX; dragStartT = clientXToT(e.clientX); };
  const endDrag = (e)=>{
    if(dragStartX === null) return;
    const movedPx = Math.abs(e.clientX - dragStartX);
    const endT = clientXToT(e.clientX);
    const a = Math.min(dragStartT, endT), b = Math.max(dragStartT, endT);
    dragStartX = null; dragStartT = null; sel.setAttribute('opacity', 0);
    if(movedPx > 4 && b - a > 0){ tlZoom = {min:a, max:b}; renderDailyTimeline(currentDrawerModel); }
  };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', (e)=>{ hide(); if(dragStartX!==null) endDrag(e); });
  svg.addEventListener('mousedown', startDrag);
  svg.addEventListener('mouseup', endDrag);
  svg.addEventListener('dblclick', ()=>{ if(tlZoom){ tlZoom = null; renderDailyTimeline(currentDrawerModel); } });
  svg.addEventListener('wheel', (e)=>{
    // Plain scroll (wheel, trackpad, shift-wheel) pans the chart natively via
    // the container's scrollbar. Ctrl/Cmd+wheel (pinch-zoom gesture) zooms.
    if(e.ctrlKey || e.metaKey){
      e.preventDefault();
      tlSetZoomAround(clientXToT(e.clientX), e.deltaY < 0 ? 0.8 : 1.25, minT, maxT);
    }
  }, {passive:false});
  svg.addEventListener('touchstart', move, {passive:true});
  svg.addEventListener('touchmove', move, {passive:true});
}

document.getElementById('timelineGran').addEventListener('click', (e)=>{
  const btn = e.target.closest('.tl-gran-btn');
  if(!btn) return;
  tlGran = btn.dataset.g;
  document.querySelectorAll('#timelineGran .tl-gran-btn').forEach(b=> b.classList.toggle('active', b===btn));
  if(currentDrawerModel) renderDailyTimeline(currentDrawerModel);
});

document.getElementById('timelineFilters').addEventListener('click', (e)=>{
  const chip = e.target.closest('.tl-status-chip');
  if(chip){
    chip.classList.toggle('active');
    // don't allow all three off — keep at least one selected
    if(!document.querySelector('#tlStatusGroup .tl-status-chip.active')) chip.classList.add('active');
  } else if(e.target.closest('#tlReset')){
    tlInitFilters();
  } else return;
  if(currentDrawerModel) renderDailyTimeline(currentDrawerModel);
});
document.getElementById('timelineFilters').addEventListener('change', (e)=>{
  if(e.target.matches('#tlFrom, #tlTo, #tlYear') && currentDrawerModel) renderDailyTimeline(currentDrawerModel);
});

/* ===== Sales Timeline download (filtered or full model data) ===== */
// Mirrors the exact filter logic used to draw the chart, so "Filtered data"
// always matches what's currently shown (date range, year, status chips).
function tlGetFilteredRecords(){
  const f = tlReadFilters();
  return drawerRecords.filter(r=>{
    if(!r[10]) return false;
    if(f.from && r[10] < f.from) return false;
    if(f.to && r[10] > f.to) return false;
    if(f.year && String(r[0]) !== f.year) return false;
    return f.status.includes(tlStatusBucket(r[5]));
  });
}

const tlDownloadBtn = document.getElementById('tlDownloadBtn');
const tlDownloadMenu = document.getElementById('tlDownloadMenu');

tlDownloadBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  if(!currentDrawerModel) return;
  const isOpen = tlDownloadMenu.style.display === 'block';
  if(isOpen){ tlDownloadMenu.style.display = 'none'; return; }
  document.getElementById('tlDownloadFilteredCount').textContent = `${fmt(tlGetFilteredRecords().length)} records`;
  document.getElementById('tlDownloadFullCount').textContent = `${fmt(drawerRecords.length)} records`;
  tlDownloadMenu.style.display = 'block';
});

document.getElementById('tlDownloadFilteredBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  const safeModel = String(currentDrawerModel||'Model').replace(/[^a-z0-9]+/gi,'_');
  exportToExcel(tlGetFilteredRecords(), `TVS_${safeModel}_Timeline_Filtered`);
  tlDownloadMenu.style.display = 'none';
});

document.getElementById('tlDownloadFullBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  const safeModel = String(currentDrawerModel||'Model').replace(/[^a-z0-9]+/gi,'_');
  exportToExcel(drawerRecords, `TVS_${safeModel}_Full`);
  tlDownloadMenu.style.display = 'none';
});

document.addEventListener('click', (e)=>{
  if(tlDownloadMenu.style.display === 'block' && !e.target.closest('.tl-download-group')){
    tlDownloadMenu.style.display = 'none';
  }
});

document.getElementById('tlZoomCtrls').addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  const z = b.dataset.z;
  if(z === 'reset'){ tlZoom = null; if(currentDrawerModel) renderDailyTimeline(currentDrawerModel); return; }
  if(z === 'left'){ tlPan(-1, 0.3); return; }
  if(z === 'right'){ tlPan(1, 0.3); return; }
  const [fmin, fmax] = tlFullDomain;
  const curMin = tlZoom ? tlZoom.min : fmin, curMax = tlZoom ? tlZoom.max : fmax;
  tlSetZoomAround((curMin+curMax)/2, z === 'in' ? 0.6 : 1.6, curMin, curMax);
});

/* Expand any chart panel to full screen (native Fullscreen API, with a CSS fallback). */
(function(){
  const isFs = (el)=> document.fullscreenElement === el || el.classList.contains('chart-fs');
  function enter(el){
    if(el.requestFullscreen){ el.requestFullscreen().catch(()=> el.classList.add('chart-fs')); }
    else if(el.webkitRequestFullscreen){ el.webkitRequestFullscreen(); }
    else { el.classList.add('chart-fs'); }
  }
  function exit(el){
    if(document.fullscreenElement === el){ document.exitFullscreen(); }
    else if(document.webkitFullscreenElement === el){ document.webkitExitFullscreen && document.webkitExitFullscreen(); }
    el.classList.remove('chart-fs');
  }
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chart-expand-btn');
    if(!btn) return;
    const el = document.getElementById(btn.dataset.fsTarget);
    if(el) isFs(el) ? exit(el) : enter(el);
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') document.querySelectorAll('.panel-box.chart-fs').forEach(el=> el.classList.remove('chart-fs'));
  });
})();

function showMonthChart(model, year){
  const monthCounts = new Array(13).fill(0); // index 1-12 used
  const yd = modelData[model] || {};
  const yearTotal = yd[year] || 0;

  drawerRecords.forEach(r=>{
    if(r[0]===year){
      const m = r[9];
      if(m>=1 && m<=12) monthCounts[m] += 1;
    }
  });

  const knownTotal = monthCounts.reduce((a,b)=>a+b,0);
  const title = document.getElementById('monthChartTitle');
  title.innerHTML = `${esc(model)} \u2014 <b>${year}</b>: ${fmt(yearTotal)} sold`;

  const chartEl = document.getElementById('monthChart');
  if(yearTotal===0){
    chartEl.innerHTML = `<div class="month-chart-empty">No units sold by ${esc(model)} in ${year}.</div>`;
  } else if(knownTotal===0){
    chartEl.innerHTML = `<div class="month-chart-empty">Sale month isn't recorded for these ${fmt(yearTotal)} units.</div>`;
  } else {
    const barMax = Math.max(...monthCounts.slice(1), 1);
    const bestMonth = monthCounts.indexOf(Math.max(...monthCounts.slice(1)));
    chartEl.innerHTML = MONTH_NAMES.map((name, i)=>{
      const m = i+1;
      const v = monthCounts[m];
      const pct = Math.round((v/barMax)*100);
      const best = (v>0 && m===bestMonth) ? ' best' : '';
      const zero = v===0 ? ' zero' : '';
      const clickable = v>0 ? ' style="cursor:pointer;"' : '';
      return `<div class="month-col" data-m="${m}"${clickable}>
        <div class="month-val">${v}</div>
        <div class="month-bar-track" title="${name} ${year}: ${v} sold${v>0?' \u00b7 tap for the vehicle-wise list':''}">
          <div class="month-bar${best}${zero}" data-h="${pct}"></div>
        </div>
        <div class="month-label">${name}</div>
      </div>`;
    }).join('');
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        chartEl.querySelectorAll('.month-bar').forEach(b=>{ b.style.height = b.dataset.h + '%'; });
      });
    });
    chartEl.querySelectorAll('.month-col').forEach(col=>{
      const m = Number(col.dataset.m);
      if(monthCounts[m]>0){
        col.addEventListener('click', ()=> showMonthDetail(model, year, m));
      }
    });
  }

  document.getElementById('monthChartWrap').classList.add('show');
  closeMonthDetail();
  document.getElementById('monthChartWrap').scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeMonthChart(){
  document.getElementById('monthChartWrap').classList.remove('show');
  document.getElementById('yearChart').querySelectorAll('.year-col').forEach(c=>c.classList.remove('selected'));
  closeMonthDetail();
}
document.getElementById('monthChartClose').addEventListener('click', closeMonthChart);

/* ---------- Month drill-down: vehicle-wise list with exact invoice date ---------- */
let currentMonthDetailRows = [], currentMonthDetailLabel = '';

function showMonthDetail(model, year, month){
  const monthName = MONTH_NAMES[month-1];
  const rows = drawerRecords
    .filter(r => r[0]===year && r[9]===month)
    .slice()
    .sort((a,b) => (a[10]||'').localeCompare(b[10]||''));

  currentMonthDetailRows = rows;
  currentMonthDetailLabel = `${model}_${monthName}_${year}`;

  document.getElementById('monthDetailTitle').innerHTML =
    `${esc(model)} \u2014 <b>${monthName} ${year}</b>: ${fmt(rows.length)} vehicle${rows.length===1?'':'s'} sold`;

  const body = document.getElementById('monthDetailBody');
  body.innerHTML = rows.map(r=>{
    const [,, customer, frame, regis, status,,,,, invDate] = r;
    const cls = status==='Lost Customer'?'status-lost':status==='Recovered Customer'?'status-recovered':'status-other';
    return `<tr><td class="mono">${formatDisplayDate(invDate)}</td><td>${esc(customer)}</td><td class="mono">${esc(frame)}</td><td class="mono">${esc(regis)}</td><td><span class="status-chip ${cls}">${status}</span></td></tr>`;
  }).join('') || `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-faint)">No records</td></tr>`;

  document.getElementById('monthDetailWrap').classList.add('show');
  document.getElementById('monthDetailWrap').scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeMonthDetail(){
  document.getElementById('monthDetailWrap').classList.remove('show');
}
document.getElementById('monthDetailClose').addEventListener('click', closeMonthDetail);

document.getElementById('monthDetailDownloadBtn').addEventListener('click', ()=>{
  try{
    if(!currentMonthDetailRows.length){ showToast('Nothing to export', 'There are no vehicles sold in this month.', true); return; }
    const header = ['Invoice Date','Customer_Name','Frame_No','Regis_No','Status','Pincode','Address','Customer_Number_1'];
    const aoa = [header].concat(currentMonthDetailRows.map(r => [
      r[10]||'', r[2], r[3], r[4], r[5], r[6], r[7], r[8]
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Month Sales');
    XLSX.writeFile(wb, `${currentMonthDetailLabel}_Sales.xlsx`);
    showToast('Excel exported', `Saved ${fmt(currentMonthDetailRows.length)} record${currentMonthDetailRows.length===1?'':'s'} for ${currentMonthDetailLabel.replace(/_/g,' ')}.`, false);
  }catch(err){
    showToast('Export failed', String(err.message||err), true);
  }
});

function renderDonut(sd){
  const entries = Object.entries(sd).filter(([,v])=>v>0);
  const total = entries.reduce((a,[,v])=>a+v,0);
  let acc = 0;
  const stops = entries.map(([k,v])=>{
    const from = (acc/total)*360; acc += v;
    const to = (acc/total)*360;
    return `${COLORS[k]||'#9DA5B0'} ${from}deg ${to}deg`;
  }).join(', ');
  document.getElementById('statusDonut').style.background = total ? `conic-gradient(${stops})` : 'var(--line)';
  document.getElementById('donutTotal').textContent = fmt(total);
  document.getElementById('statusLegend').innerHTML = entries.map(([k,v])=>`
    <div class="legend-item"><span class="dot" style="background:${COLORS[k]||'#9DA5B0'}"></span>${k}<b>${fmt(v)}</b></div>
  `).join('') || '<div style="color:var(--text-faint);font-size:13px;">No status data</div>';
}

function openDrawer(model, highlightYear){
  currentDrawerModel = model;
  const total = modelTotals[model];
  const yd = modelData[model];
  document.getElementById('drawerEyebrow').textContent = `Model Drill-down \u00b7 ${fmt(total)} units`;
  document.getElementById('drawerTitle').textContent = model;

  const sd = statusByModel[model] || {};
  const lostN = sd['Lost Customer']||0, recN = sd['Recovered Customer']||0;
  const firstYear = years.find(y=>(yd[y]||0)>0);
  const lastYear = [...years].reverse().find(y=>(yd[y]||0)>0);
  const bestYear = years.reduce((a,b)=> (yd[b]||0)>(yd[a]||0)?b:a, years[0]);

  document.getElementById('drawerStats').innerHTML = `
    <div class="st"><div class="st-num">${fmt(total)}</div><div class="st-label">Total Sold</div></div>
    <div class="st"><div class="st-num">${bestYear}</div><div class="st-label">Best Year (${yd[bestYear]||0})</div></div>
    <div class="st"><div class="st-num">${firstYear||'\u2014'}\u2013${lastYear||'\u2014'}</div><div class="st-label">Active Range</div></div>
    <div class="st"><div class="st-num">${total? ((recN/(recN+lostN||1))*100).toFixed(0):0}%</div><div class="st-label">Retained</div></div>
  `;

  drawerRecords = records.filter(r=>r[1]===model);
  recordPage = 0;
  document.getElementById('recordSearch').value='';
  renderRecordTable();

  closeMonthChart();
  renderYearChart(model, yd, highlightYear);
  tlInitFilters();
  renderDailyTimeline(model);
  renderDonut(sd);
  if(highlightYear) showMonthChart(model, highlightYear);

  document.getElementById('overlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  requestAnimationFrame(()=>document.getElementById('overlay').classList.add('show'));
}

function renderRecordTable(){
  const q = document.getElementById('recordSearch').value.trim().toLowerCase();
  let filtered = drawerRecords;
  if(q){
    filtered = drawerRecords.filter(r =>
      String(r[0]).includes(q) ||
      r[2].toLowerCase().includes(q) ||
      r[3].toLowerCase().includes(q) ||
      r[4].toLowerCase().includes(q)
    );
  }
  const start = recordPage*PAGE_SIZE;
  const pageItems = filtered.slice(start, start+PAGE_SIZE);
  const body = document.getElementById('recordBody');

  if(filtered.length===0){
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-faint)">No matching records</td></tr>`;
  } else {
    body.innerHTML = pageItems.map(r=>{
      const [year, model, customer, frame, regis, status] = r;
      const cls = status==='Lost Customer'?'status-lost':status==='Recovered Customer'?'status-recovered':'status-other';
      return `<tr class="clickable-row" data-customer="${esc(customer)}" data-frame="${esc(frame)}" style="cursor:pointer;"><td class="mono">${year}</td><td>${esc(customer)}</td><td class="mono">${esc(frame)}</td><td class="mono">${esc(regis)}</td><td><span class="status-chip ${cls}">${status}</span></td></tr>`;
    }).join('');
    body.querySelectorAll('.clickable-row').forEach(row=>{
      row.addEventListener('click', ()=> openCustomerDetail(row.dataset.customer, row.dataset.frame));
    });
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  document.getElementById('pageInfo').textContent = `Page ${recordPage+1} of ${totalPages} \u00b7 ${fmt(filtered.length)} records`;
  document.getElementById('prevPage').disabled = recordPage===0;
  document.getElementById('nextPage').disabled = recordPage>=totalPages-1;
}
document.getElementById('recordSearch').addEventListener('input', ()=>{ recordPage=0; renderRecordTable(); });
document.getElementById('prevPage').addEventListener('click', ()=>{ if(recordPage>0){recordPage--; renderRecordTable();} });
document.getElementById('nextPage').addEventListener('click', ()=>{ recordPage++; renderRecordTable(); });

function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('custModal').classList.remove('open');
  document.getElementById('addModal').classList.remove('open');
  document.getElementById('pwModal').classList.remove('open');
  document.getElementById('explorerDrawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  setTimeout(()=>document.getElementById('overlay').classList.remove('open'), 250);
}
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('custClose').addEventListener('click', closeDrawer);
document.getElementById('overlay').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });

/* ---------- Customer Explorer (Recovered / Lost customer drill-down) ---------- */
let explorerStatus = 'Lost Customer';
let explorerPage = 0;
const EXPLORER_PAGE_SIZE = 12;

(function populateExplorerMonthOptions(){
  const monthSel = document.getElementById('explorerMonthFilter');
  monthSel.innerHTML = '<option value="__ALL__">All Months</option>' +
    MONTH_NAMES_SHORT.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
})();

function explorerBaseRecords(){
  return records.filter(r => r[5] === explorerStatus);
}

function populateExplorerFilterOptions(){
  const yearSel = document.getElementById('explorerYearFilter');
  const modelSel = document.getElementById('explorerModelFilter');
  const base = explorerBaseRecords();
  const yrs = Array.from(new Set(base.map(r=>r[0]))).sort((a,b)=>a-b);
  const mdls = Array.from(new Set(base.map(r=>r[1]))).sort((a,b)=>a.localeCompare(b));
  yearSel.innerHTML = '<option value="__ALL__">All Years</option>' + yrs.map(y=>`<option value="${y}">${y}</option>`).join('');
  modelSel.innerHTML = '<option value="__ALL__">All Models</option>' + mdls.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
}

function getExplorerFiltered(){
  const q = document.getElementById('explorerSearch').value.trim().toLowerCase();
  const yearSel = document.getElementById('explorerYearFilter').value;
  const monthSel = document.getElementById('explorerMonthFilter').value;
  const modelSel = document.getElementById('explorerModelFilter').value;
  let list = explorerBaseRecords();
  if(yearSel!=='__ALL__') list = list.filter(r=>String(r[0])===String(yearSel));
  if(monthSel!=='__ALL__') list = list.filter(r=>String(r[9])===String(monthSel));
  if(modelSel!=='__ALL__') list = list.filter(r=>r[1]===modelSel);
  if(q){
    list = list.filter(r =>
      String(r[2]||'').toLowerCase().includes(q) ||
      String(r[8]||'').toLowerCase().includes(q) ||
      String(r[4]||'').toLowerCase().includes(q) ||
      String(r[3]||'').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderExplorerYearTable(){
  const monthSel = document.getElementById('explorerMonthFilter').value;
  const modelSel = document.getElementById('explorerModelFilter').value;
  let base = explorerBaseRecords();
  if(modelSel!=='__ALL__') base = base.filter(r=>r[1]===modelSel);
  if(monthSel!=='__ALL__') base = base.filter(r=>String(r[9])===String(monthSel));
  const byYear = {};
  base.forEach(r=>{ byYear[r[0]] = (byYear[r[0]]||0)+1; });
  const yrs = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
  const body = document.getElementById('explorerYearBody');
  if(!yrs.length){
    body.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-faint)">No records</td></tr>`;
  } else {
    body.innerHTML = yrs.map(y=>`<tr><td class="mono">${y}</td><td class="mono">${fmt(byYear[y])}</td></tr>`).join('');
  }
  document.getElementById('explorerYearHint').textContent = modelSel==='__ALL__' ? 'All models' : modelSel;
}

function renderExplorerTable(){
  const filtered = getExplorerFiltered();
  const start = explorerPage*EXPLORER_PAGE_SIZE;
  const pageItems = filtered.slice(start, start+EXPLORER_PAGE_SIZE);
  const body = document.getElementById('explorerBody');
  if(!filtered.length){
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-faint)">No matching records</td></tr>`;
  } else {
    body.innerHTML = pageItems.map(r=>{
      const [year, model, customer, frame, regis, status, pincode, address, phone, month] = r;
      const cls = status==='Lost Customer'?'status-lost':status==='Recovered Customer'?'status-recovered':'status-other';
      const mLabel = month ? (MONTH_NAMES_SHORT[month-1]||month) : '\u2014';
      return `<tr class="clickable-row" data-customer="${esc(customer)}" data-frame="${esc(frame)}" style="cursor:pointer;"><td class="mono">${year}</td><td class="mono">${mLabel}</td><td>${esc(model)}</td><td>${esc(customer)}</td><td class="mono">${esc(phone||'')}</td><td class="mono">${esc(regis||'')}</td><td><span class="status-chip ${cls}">${status}</span></td></tr>`;
    }).join('');
    body.querySelectorAll('.clickable-row').forEach(row=>{
      row.addEventListener('click', ()=> openCustomerDetail(row.dataset.customer, row.dataset.frame));
    });
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length/EXPLORER_PAGE_SIZE));
  document.getElementById('explorerPageInfo').textContent = `Page ${explorerPage+1} of ${totalPages} \u00b7 ${fmt(filtered.length)} records`;
  document.getElementById('explorerPrevPage').disabled = explorerPage===0;
  document.getElementById('explorerNextPage').disabled = explorerPage>=totalPages-1;
  document.getElementById('explorerCountHint').textContent = `Showing ${fmt(filtered.length)} of ${fmt(explorerBaseRecords().length)} ${STATUS_LABEL[explorerStatus].toLowerCase()}`;
  document.getElementById('explorerDownloadCount').textContent = fmt(filtered.length);
}

function refreshExplorer(){
  explorerPage = 0;
  renderExplorerYearTable();
  renderExplorerTable();
}

function openExplorer(status){
  explorerStatus = status;
  const base = explorerBaseRecords();
  const total = base.length;
  const otherStatus = status==='Lost Customer' ? 'Recovered Customer' : 'Lost Customer';
  const otherTotal = records.filter(r=>r[5]===otherStatus).length;
  const rate = (total+otherTotal)>0 ? ((total/(total+otherTotal))*100).toFixed(1) : '0.0';

  document.getElementById('explorerTitle').textContent = STATUS_LABEL[status];
  document.getElementById('explorerStats').innerHTML = `
    <div class="st"><div class="st-num">${fmt(total)}</div><div class="st-label">${STATUS_LABEL[status]}</div></div>
    <div class="st"><div class="st-num">${rate}%</div><div class="st-label">Share of Lost + Recovered</div></div>
  `;

  document.getElementById('explorerSearch').value = '';
  populateExplorerFilterOptions();
  document.getElementById('explorerYearFilter').value = '__ALL__';
  document.getElementById('explorerMonthFilter').value = '__ALL__';
  document.getElementById('explorerModelFilter').value = '__ALL__';

  refreshExplorer();

  document.getElementById('overlay').classList.add('open');
  document.getElementById('explorerDrawer').classList.add('open');
  requestAnimationFrame(()=>document.getElementById('overlay').classList.add('show'));
}

document.getElementById('explorerSearch').addEventListener('input', refreshExplorer);
document.getElementById('explorerYearFilter').addEventListener('change', refreshExplorer);
document.getElementById('explorerMonthFilter').addEventListener('change', refreshExplorer);
document.getElementById('explorerModelFilter').addEventListener('change', refreshExplorer);
document.getElementById('explorerPrevPage').addEventListener('click', ()=>{ if(explorerPage>0){ explorerPage--; renderExplorerTable(); } });
document.getElementById('explorerNextPage').addEventListener('click', ()=>{ explorerPage++; renderExplorerTable(); });
document.getElementById('explorerDownloadBtn').addEventListener('click', ()=>{
  const filtered = getExplorerFiltered();
  exportToExcel(filtered, `TVS_${explorerStatus.replace(/\s+/g,'_')}_Filtered`);
});
document.getElementById('explorerClose').addEventListener('click', closeDrawer);

/* ---------- Customer detail modal ---------- */
function initials(name){
  const parts = name.replace(/\./g,' ').trim().split(/\s+/).filter(Boolean);
  if(parts.length===0) return '?';
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}

function openCustomerDetail(customerName, disambigFrame){
  const key = customerName.trim().toLowerCase();
  let custRecords = records.filter(r => r[2].trim().toLowerCase() === key);
  if(custRecords.length===0) return;

  // Many customers share the exact same name (common names repeat thousands of
  // times in this dataset). Grouping purely by name merges unrelated people's
  // purchases, phone numbers, and addresses into one profile. When we know which
  // exact record was clicked, use that record's phone number to narrow the group
  // down to purchases that plausibly belong to the same real person.
  if(custRecords.length>1 && disambigFrame){
    const clickedRecord = custRecords.find(r => r[3] === disambigFrame) ||
                           records.find(r => r[3] === disambigFrame);
    const clickedPhone = clickedRecord ? clickedRecord[8] : '';
    if(clickedPhone){
      const samePhone = custRecords.filter(r => r[8] === clickedPhone);
      if(samePhone.length>0) custRecords = samePhone;
    }
  }

  document.getElementById('custAvatar').textContent = initials(customerName);
  document.getElementById('custName').textContent = customerName;

  const address = custRecords.map(r=>r[7]).find(a=>a && a.length>0) || '';
  const phone = custRecords.map(r=>r[8]).find(p=>p && p.length>0) || '';
  const pincode = custRecords.map(r=>r[6]).find(p=>p && p.length>0) || '';

  const addrEl = document.getElementById('custAddress');
  addrEl.textContent = address || 'Not available';
  addrEl.classList.toggle('empty', !address);

  const phoneEl = document.getElementById('custPhone');
  phoneEl.textContent = phone || 'Not available';
  phoneEl.classList.toggle('empty', !phone);

  const pinEl = document.getElementById('custPincode');
  pinEl.textContent = pincode || 'Not available';
  pinEl.classList.toggle('empty', !pincode);

  const sorted = custRecords.slice().sort((a,b)=>b[0]-a[0]);
  const yrs = custRecords.map(r=>r[0]);
  const minY = Math.min(...yrs), maxY = Math.max(...yrs);
  let statsHtml = `<div class="cust-stat"><div class="cs-num">${fmt(custRecords.length)}</div><div class="cs-label">Vehicle${custRecords.length===1?'':'s'} Owned</div></div>`;
  if(minY === maxY){
    statsHtml += `<div class="cust-stat"><div class="cs-num">${minY}</div><div class="cs-label">Purchase Year</div></div>`;
  } else {
    statsHtml += `<div class="cust-stat"><div class="cs-num">${minY}</div><div class="cs-label">First Purchase</div></div>`;
    statsHtml += `<div class="cust-stat"><div class="cs-num">${maxY}</div><div class="cs-label">Latest Purchase</div></div>`;
  }
  document.getElementById('custStatStrip').innerHTML = statsHtml;

  document.getElementById('custVehicleList').innerHTML = sorted.map((r,i)=>{
    const [year, model, , frame, regis, status] = r;
    const monthNum = r[9];
    const invDate = r[10];
    const monthLabel = (monthNum>=1 && monthNum<=12) ? MONTH_NAMES[monthNum-1] : null;
    const dateLabel = invDate ? formatDisplayDate(invDate) : (monthLabel ? `${monthLabel} ${year}` : `${year}`);
    const cls = status==='Lost Customer'?'status-lost':status==='Recovered Customer'?'status-recovered':'status-other';
    return `<div class="cust-vehicle-card">
      <div>
        <div class="cv-model">${esc(model)}</div>
        <div class="cv-meta">${esc(frame)} \u00b7 ${esc(regis)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="status-chip ${cls}">${status}</span>
        <span class="cv-year">${dateLabel}</span>
        <button class="cv-delete-btn manager-only" type="button" data-idx="${i}" title="Delete this entry" aria-label="Delete this entry">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"></path><path d="M10 11v6M14 11v6"></path></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('custVehicleList').querySelectorAll('.cv-delete-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const rec = sorted[parseInt(btn.dataset.idx, 10)];
      deleteRecordEntry(rec, customerName, disambigFrame);
    });
  });

  const deleteAllBtn = document.getElementById('custDeleteAllBtn');
  deleteAllBtn.onclick = ()=> deleteAllCustomerRecords(custRecords, customerName);

  document.getElementById('overlay').classList.add('open');
  document.getElementById('custModal').classList.add('open');
  document.getElementById('drawer').classList.remove('open');
  requestAnimationFrame(()=>document.getElementById('overlay').classList.add('show'));
}

/* ---------- Delete wrongly entered records ---------- */
/* Removes a single record (identified by array reference) from the master
   `records` list, fully rebuilds every derived data structure so KPIs,
   the model grid, search and the year-wise report stay in sync, then
   refreshes whichever panels were open. */
function deleteRecordEntry(rec, customerName, disambigFrame){
  if(!isManager()){ showToast('Managers only', 'You need manager or admin access to delete records.', true); return; }
  if(!rec) return;
  const ok = confirm(`Delete this record?\n\n${rec[2]} \u00b7 ${rec[1]} (${rec[0]})\nFrame: ${rec[3]||'\u2014'}\n\nThis cannot be undone.`);
  if(!ok) return;

  const idx = records.indexOf(rec);
  if(idx === -1) return;
  const deletedModel = rec[1];
  const remaining = records.slice();
  remaining.splice(idx, 1);

  rebuildFromRecords(remaining);
  rerenderAll();
  persistState();
  showToast('Record deleted', `Removed ${rec[2]} \u00b7 ${rec[1]} (${rec[0]}).`, false);

  const key = customerName.trim().toLowerCase();
  const stillHasCustomer = records.some(r => r[2].trim().toLowerCase() === key);

  if(stillHasCustomer){
    openCustomerDetail(customerName, disambigFrame);
  } else {
    document.getElementById('custModal').classList.remove('open');
    if(currentDrawerModel && models.includes(currentDrawerModel)){
      openDrawer(currentDrawerModel);
    } else {
      closeDrawer();
    }
  }
}

/* Removes every record for the currently open customer profile in one go —
   useful when an entire customer entry (not just one vehicle) was entered
   by mistake. */
function deleteAllCustomerRecords(custRecords, customerName){
  if(!isManager()){ showToast('Managers only', 'You need manager or admin access to delete records.', true); return; }
  if(!custRecords || custRecords.length===0) return;
  const ok = confirm(`Delete ALL ${custRecords.length} record${custRecords.length===1?'':'s'} for "${customerName}"?\n\nThis cannot be undone.`);
  if(!ok) return;

  const toRemove = new Set(custRecords);
  const remaining = records.filter(r => !toRemove.has(r));

  rebuildFromRecords(remaining);
  rerenderAll();
  persistState();
  showToast('Customer deleted', `Removed ${custRecords.length} record${custRecords.length===1?'':'s'} for ${customerName}.`, false);

  document.getElementById('custModal').classList.remove('open');
  if(currentDrawerModel && models.includes(currentDrawerModel)){
    openDrawer(currentDrawerModel);
  } else {
    closeDrawer();
  }
}

/* ---------- Global search ---------- */
const gs = document.getElementById('globalSearch');
const srBox = document.getElementById('searchResults');
const searchBox = document.getElementById('searchBox');
const searchClear = document.getElementById('searchClear');

function runSearch(q){
  q = q.trim().toLowerCase();
  searchBox.classList.toggle('has-text', q.length>0);
  if(q.length<2){ srBox.classList.remove('open'); return; }

  const modelMatches = models.filter(m => m.toLowerCase().includes(q));

  const matches = [];
  for(const r of records){
    const [year, model, customer, frame, regis] = r;
    if(customer.toLowerCase().includes(q) || frame.toLowerCase().includes(q) || regis.toLowerCase().includes(q)){
      matches.push(r);
      if(matches.length>=40) break;
    }
  }

  let html = '';

  if(modelMatches.length>0){
    html += `<div class="sr-count">Matching model${modelMatches.length===1?'':'s'} \u00b7 tap to see every buyer</div>` +
      modelMatches.map(mm=>{
        const total = modelTotals[mm];
        const sd = statusByModel[mm]||{};
        const recN = sd['Recovered Customer']||0, lostN = sd['Lost Customer']||0;
        return `<div class="sr-item sr-model-item" data-model="${esc(mm)}">
          <div>
            <div class="sr-name">${esc(mm)}</div>
            <div class="sr-meta">${fmt(total)} units sold \u00b7 ${fmt(recN)} recovered \u00b7 ${fmt(lostN)} lost</div>
          </div>
          <div class="sr-model">View all \u2192</div>
        </div>`;
      }).join('');
  }

  if(matches.length===0 && modelMatches.length===0){
    html = `<div class="sr-empty">No matches for "${esc(q)}"</div>`;
  } else if(matches.length>0){
    html += `<div class="sr-count">${matches.length}${matches.length>=40?'+':''} customer match${matches.length===1?'':'es'} \u00b7 tap for full details</div>` +
      matches.map(r=>{
        const [year, model, customer, frame, regis, status, pincode, address] = r;
        const addrBit = address ? ` \u00b7 ${esc(address.length>38?address.slice(0,38)+'\u2026':address)}` : '';
        return `<div class="sr-item" data-customer="${esc(customer)}" data-model="${esc(model)}" data-year="${year}" data-frame="${esc(frame)}">
          <div>
            <div class="sr-name">${esc(customer)}</div>
            <div class="sr-meta">${esc(frame)} \u00b7 ${esc(regis)} \u00b7 ${year}${addrBit}</div>
          </div>
          <div class="sr-model">${esc(model)}</div>
        </div>`;
      }).join('');
  }

  srBox.innerHTML = html;
  srBox.classList.add('open');
  srBox.querySelectorAll('.sr-model-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      openDrawer(el.dataset.model);
      srBox.classList.remove('open');
      gs.blur();
    });
  });
  srBox.querySelectorAll('.sr-item:not(.sr-model-item)').forEach(el=>{
    el.addEventListener('click', ()=>{
      openCustomerDetail(el.dataset.customer, el.dataset.frame);
      srBox.classList.remove('open');
      gs.blur();
    });
  });
}
gs.addEventListener('input', e=>runSearch(e.target.value));
gs.addEventListener('focus', e=>{ if(e.target.value.trim().length>=2) srBox.classList.add('open'); });
searchClear.addEventListener('click', ()=>{ gs.value=''; searchBox.classList.remove('has-text'); srBox.classList.remove('open'); gs.focus(); });
document.addEventListener('click', e=>{
  if(!e.target.closest('.search-wrap')) srBox.classList.remove('open');
});

/* ===================== ADD SALE RECORD ===================== */
const addModal = document.getElementById('addModal');
const addRecordForm = document.getElementById('addRecordForm');
const addSuccessBanner = document.getElementById('addSuccessBanner');
const addSuccessText = document.getElementById('addSuccessText');
const modelOptionsList = document.getElementById('modelOptions');

function populateModelDatalist(){
  modelOptionsList.innerHTML = models.slice().sort((a,b)=>a.localeCompare(b))
    .map(m=>`<option value="${esc(m)}"></option>`).join('');
}
populateModelDatalist();

/* ===================== AUTO-SAVE / PERSISTENCE (SHARED CLOUD STORAGE) =====================
   Remembers uploaded / added records so every device viewing this dashboard sees the
   same data — Admin uploads once, and it shows up for every User automatically.
   Uses Anthropic's shared artifact storage (window.storage, shared=true) so the data
   lives in the cloud rather than in one browser. Falls back to this-browser-only
   IndexedDB storage if shared storage isn't available (e.g. the file was downloaded
   and opened outside Claude.ai). */
const DB_NAME='tvsDashboardDB', DB_STORE='state', DB_KEY='records';
const SHARED_RECORDS_KEY='records';
function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ req.result.createObjectStore(DB_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function idbSet(val){ return idbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).put(val,DB_KEY); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); })); }
function idbGet(){ return idbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,'readonly'); const r=tx.objectStore(DB_STORE).get(DB_KEY); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
function idbClear(){ return idbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).delete(DB_KEY); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); })); }

function hasSharedStorage(){ return (typeof window!=='undefined' && !!window.storage); }

// Returns undefined if nothing has ever been saved (dashboard stays empty),
// or an array (possibly empty, left behind by Reset) if an explicit state exists.
async function loadRecordsRemote(){
  if(!hasSharedStorage()) return idbGet();
  try{
    const res = await window.storage.get(SHARED_RECORDS_KEY, true);
    if(!res || res.value===undefined || res.value===null) return undefined;
    return JSON.parse(res.value);
  }catch(e){
    return undefined; // key not found yet -> nothing saved so far
  }
}
async function saveRecordsRemote(recs){
  if(!hasSharedStorage()) return idbSet(recs);
  await window.storage.set(SHARED_RECORDS_KEY, JSON.stringify(recs), true);
}

let _saveTimer=null;
let _lastSyncSignature = null;
function persistState(){
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>{
    const payload = records.map(r=>r.slice());
    saveRecordsRemote(payload)
      .then(()=>{ _lastSyncSignature = JSON.stringify(payload); })
      .catch(err=>console.warn('auto-save failed',err));
  },300);
}

/* ===== LIVE SYNC =====
   Periodically checks shared storage for changes (e.g. an Admin uploaded new data
   from a different device) and refreshes the dashboard automatically. Skipped while
   a drawer/modal is open so it never interrupts something someone is doing. */
function isAnyOverlayOpen(){
  const ov = document.getElementById('overlay');
  return !!(ov && ov.classList.contains('open'));
}
async function pollForRemoteUpdates(){
  if(!hasSharedStorage() || isAnyOverlayOpen()) return;
  try{
    const res = await window.storage.get(SHARED_RECORDS_KEY, true);
    if(res && res.value!==undefined && res.value!==null && res.value !== _lastSyncSignature){
      const saved = JSON.parse(res.value);
      _lastSyncSignature = res.value;
      rebuildFromRecords(saved);
      rerenderAll();
      showToast('Live update', `Dashboard refreshed with the latest data (${fmt(records.length)} records).`, false);
    }
  }catch(e){ /* nothing saved remotely yet */ }
  // Also pick up accounts created/edited on other devices — but never while
  // someone is mid-login (a disabled button means a sync is already running).
  if(document.getElementById('loginSubmit') && !document.getElementById('loginSubmit').disabled){
    try{
      const remoteUsers = await loadUsersRemote();
      if(remoteUsers && JSON.stringify(remoteUsers) !== JSON.stringify(USERS)){
        USERS = remoteUsers;
        try{ localStorage.setItem(USERS_KEY, JSON.stringify(USERS)); }catch(e){}
        renderAccountsListSafe();
      }
    }catch(e){ /* ignore */ }
  }
}
setInterval(pollForRemoteUpdates, 20000);
function clearAllData(){
  years.length=0; models.length=0; records.length=0;
  [modelData,modelTotals,statusByModel,yearTotals,statusTotals,modelYearStatus,yearStatusTotals]
    .forEach(o=>{ for(const k in o) delete o[k]; });
}
function rebuildFromRecords(recs){ clearAllData(); recs.forEach(r=>addNewRecord(r)); }
function rerenderAll(){ renderKPI(); renderGrid(); populateModelDatalist(); populateYearReportModelOptions(); renderYearReport(); }

// Restore any previously-saved state on load. `saved` is:
//  - undefined/null -> nothing has ever been uploaded/saved yet, so the
//    dashboard simply stays empty (there is no baseline dataset to fall back to).
//  - an array (even an empty one, left behind by Reset) -> use it exactly,
//    including "empty" after a reset. Whatever gets uploaded stays here
//    (persisted to shared storage) until Reset is used.
loadRecordsRemote().then(saved=>{
  if(saved === undefined || saved === null) return;
  _lastSyncSignature = JSON.stringify(saved);
  rebuildFromRecords(saved);
  rerenderAll();
  if(saved.length){
    showToast('Data restored', `Loaded ${fmt(records.length)} saved record${records.length===1?'':'s'} from shared storage.`, false);
  } else {
    showToast('Dashboard reset', 'The dashboard is empty. Add or upload records to start again.', false);
  }
}).catch(err=>console.warn('restore failed',err));

// Reset button: the only action that clears all uploaded/added data. Saves an
// explicit empty state so a plain reload stays empty rather than restoring
// anything previously uploaded.
document.getElementById('resetBtn').addEventListener('click', ()=>{
  if(!isManager()){ showToast('Managers only', 'You need manager or admin access to reset data.', true); return; }
  if(!confirm('Clear ALL data for EVERYONE viewing this dashboard and start empty? This cannot be undone.')) return;
  saveRecordsRemote([]).then(()=>location.reload()).catch(err=>showToast('Reset failed', String(err.message||err), true));
});

// Export current data as a .xlsx file (uses the SheetJS library already loaded).
document.getElementById('exportXlsxBtn').addEventListener('click', ()=>{
  try {
    if(!records.length){ showToast('Nothing to export', 'There are no records to export yet.', true); return; }
    // records: [year, model, customer, frame, regis, status, pincode, address, phone, month, invDate]
    const header = ['Sale_Year','Frame_No','Model_Variant','Customer_Name','Customer_Number_1','Pincode','Regis_No','Lost_Customer_Filter','Address','Sale_Month','inv_dt'];
    const aoa = [header].concat(records.map(r => [
      r[0], r[3], r[1], r[2], r[8], r[6], r[4], r[5], r[7], (r[9]==null?'':r[9]), (r[10]||'')
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Merged Data');
    const stamp = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `TVS_Sales_Data_${stamp}.xlsx`);
    showToast('Excel exported', `Saved ${fmt(records.length)} records to an .xlsx file.`, false);
  } catch(err){
    showToast('Export failed', String(err.message||err), true);
  }
});

// Function to export data to Excel
function exportToExcel(recordsToExport, fileName) {
  try {
    if(!recordsToExport.length) {
      showToast('No data to export', 'There are no records matching your filters.', true);
      return;
    }
    
    // records: [year, model, customer, frame, regis, status, pincode, address, phone, month, invDate]
    const header = ['Sale_Year','Frame_No','Model_Variant','Customer_Name','Customer_Number_1','Pincode','Regis_No','Lost_Customer_Filter','Address','Sale_Month','inv_dt'];
    const aoa = [header].concat(recordsToExport.map(r => [
      r[0], r[3], r[1], r[2], r[8], r[6], r[4], r[5], r[7], (r[9]==null?'':r[9]), (r[10]||'')
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Data');
    const stamp = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `${fileName}_${stamp}.xlsx`);
    showToast('Excel exported', `Saved ${fmt(recordsToExport.length)} records to an .xlsx file.`, false);
  } catch(err){
    showToast('Export failed', String(err.message||err), true);
  }
}

function currentMonthValue(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

/* ===================== CUSTOM MONTH-YEAR PICKER =====================
   Styled replacement for the native month input; still writes a "YYYY-MM"
   value into the hidden #fldSaleDate that the rest of the form reads. */
const MP_ABBR=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MP_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
const mpEl=document.getElementById('mp');
const mpPanel=document.getElementById('mpPanel');
const mpTrigger=document.getElementById('mpTrigger');
const mpYearEl=document.getElementById('mpYear');
const mpGrid=document.getElementById('mpGrid');
const mpLabel=document.getElementById('mpLabel');
const fldSaleDate=document.getElementById('fldSaleDate');
let mpViewYear=new Date().getFullYear();
let mpSelected=null; // {y, m}

function mpRender(){
  mpYearEl.textContent=mpViewYear;
  mpGrid.innerHTML=MP_ABBR.map((m,i)=>{
    const sel=mpSelected && mpSelected.y===mpViewYear && mpSelected.m===i+1;
    return `<button type="button" class="mp-month${sel?' selected':''}" data-m="${i+1}">${m}</button>`;
  }).join('');
}
function setSaleDate(val){
  if(val && /^\d{4}-\d{2}$/.test(val)){
    const y=+val.slice(0,4), m=+val.slice(5,7);
    mpSelected={y,m}; mpViewYear=y;
    mpLabel.textContent=`${MP_FULL[m-1]} ${y}`;
    fldSaleDate.value=`${y}-${String(m).padStart(2,'0')}`;
  } else {
    mpSelected=null; mpLabel.textContent='Select month'; fldSaleDate.value='';
  }
  mpRender();
}
function mpClose(){ mpPanel.classList.remove('open'); mpTrigger.setAttribute('aria-expanded','false'); }
function mpOpen(){ if(mpSelected) mpViewYear=mpSelected.y; mpRender(); mpPanel.classList.add('open'); mpTrigger.setAttribute('aria-expanded','true'); }
mpTrigger.addEventListener('click', e=>{ e.stopPropagation(); mpPanel.classList.contains('open')?mpClose():mpOpen(); });
document.getElementById('mpPrev').addEventListener('click', e=>{ e.stopPropagation(); mpViewYear=Math.max(2000,mpViewYear-1); mpRender(); });
document.getElementById('mpNext').addEventListener('click', e=>{ e.stopPropagation(); mpViewYear=Math.min(2100,mpViewYear+1); mpRender(); });
mpGrid.addEventListener('click', e=>{
  const btn=e.target.closest('.mp-month'); if(!btn) return;
  const m=+btn.getAttribute('data-m');
  setSaleDate(`${mpViewYear}-${String(m).padStart(2,'0')}`);
  document.getElementById('fldYear').value=mpViewYear;
  setFieldError('fg-year', false); setFieldError('fg-saledate', false);
  mpClose();
});
document.addEventListener('click', e=>{ if(mpPanel.classList.contains('open') && !mpEl.contains(e.target)) mpClose(); });
mpRender();

function openAddModal(){
  if(!isManager()){ showToast('Managers only', 'You need manager or admin access to add records.', true); return; }
  addSuccessBanner.classList.remove('show');
  document.getElementById('fldYear').value = new Date().getFullYear();
  setSaleDate(currentMonthValue());
  document.getElementById('overlay').classList.add('open');
  requestAnimationFrame(()=>document.getElementById('overlay').classList.add('show'));
  addModal.classList.add('open');
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('custModal').classList.remove('open');
  setTimeout(()=>document.getElementById('fldYear').focus(), 300);
}
document.getElementById('addRecordBtn').addEventListener('click', openAddModal);
document.getElementById('addClose').addEventListener('click', closeDrawer);

function setFieldError(id, hasError){
  document.getElementById(id).classList.toggle('has-error', hasError);
}

/* Merge one new record into every derived data structure the dashboard reads from,
   so KPIs, the model grid, the year-wise report and search all pick it up correctly. */
function addNewRecord(rec){
  const [year, model, customer, frame, regis, status, pincode, address, phone] = rec;

  records.push(rec);

  if(!years.includes(year)){ years.push(year); years.sort((a,b)=>a-b); }
  if(!models.includes(model)){ models.push(model); }

  modelData[model] = modelData[model] || {};
  modelData[model][year] = (modelData[model][year]||0) + 1;

  modelTotals[model] = (modelTotals[model]||0) + 1;

  statusByModel[model] = statusByModel[model] || {};
  statusByModel[model][status] = (statusByModel[model][status]||0) + 1;

  yearTotals[year] = (yearTotals[year]||0) + 1;
  statusTotals[status] = (statusTotals[status]||0) + 1;

  modelYearStatus[model] = modelYearStatus[model] || {};
  modelYearStatus[model][year] = modelYearStatus[model][year] || {};
  modelYearStatus[model][year][status] = (modelYearStatus[model][year][status]||0) + 1;

  yearStatusTotals[year] = yearStatusTotals[year] || {};
  yearStatusTotals[year][status] = (yearStatusTotals[year][status]||0) + 1;
}

/* Upsert new/updated records against the existing dataset using the pair
   of Frame Number (VIN) + Registration Number as the unique key. If an
   uploaded row's frame number AND registration number both match an
   existing record, that OLD record is fully removed and REPLACED with the
   newly uploaded row -- every field (customer, model, status, pincode,
   address, phone, sale date, etc.) comes from the new upload, nothing from
   the old record is kept. Rows where the frame number or registration
   number is blank can't be reliably matched, so they're always added as
   new records. Returns {imported, replaced} counts. Rebuilds all derived
   KPI/report data once at the end (cheap even for tens of thousands of
   rows). */
function upsertRecords(newRecs){
  const working = records.slice();
  const keyFor = r => {
    const f = String(r[3]||'').trim().toLowerCase();
    const g = String(r[4]||'').trim().toLowerCase();
    return (f && g) ? (f + '||' + g) : '';
  };
  const keyIndex = new Map();
  working.forEach((r,i)=>{
    const k = keyFor(r);
    if(k) keyIndex.set(k, i);
  });

  let imported = 0, replaced = 0;
  for(const rec of newRecs){
    const key = keyFor(rec);
    if(key && keyIndex.has(key)){
      const idx = keyIndex.get(key);
      // Full replace: drop the old record entirely, keep only the new one.
      working[idx] = rec.slice();
      replaced++;
    } else {
      working.push(rec);
      if(key) keyIndex.set(key, working.length - 1);
      imported++;
    }
  }

  rebuildFromRecords(working);
  return { imported, replaced };
}

addRecordForm.addEventListener('submit', e=>{
  e.preventDefault();
  if(!isManager()){ showToast('Managers only', 'You need manager or admin access to add records.', true); return; }

  const yearVal = parseInt(document.getElementById('fldYear').value, 10);
  const modelVal = document.getElementById('fldModel').value.trim().toUpperCase();
  const customerVal = document.getElementById('fldCustomer').value.trim();
  const frameVal = document.getElementById('fldFrame').value.trim();
  const regisVal = document.getElementById('fldRegis').value.trim();
  const statusVal = (document.querySelector('input[name="status"]:checked')||{}).value;
  const pincodeVal = document.getElementById('fldPincode').value.trim();
  const phoneVal = document.getElementById('fldPhone').value.trim();
  const addressVal = document.getElementById('fldAddress').value.trim();
  const saleDateVal = document.getElementById('fldSaleDate').value; // "YYYY-MM" or ""
  const invDateVal = document.getElementById('fldInvDate').value; // "YYYY-MM-DD" or ""

  let ok = true;
  setFieldError('fg-year', !(yearVal >= 2000 && yearVal <= 2100)); if(!(yearVal>=2000 && yearVal<=2100)) ok=false;
  setFieldError('fg-model', modelVal.length===0); if(modelVal.length===0) ok=false;
  setFieldError('fg-customer', customerVal.length===0); if(customerVal.length===0) ok=false;
  setFieldError('fg-status', !statusVal); if(!statusVal) ok=false;
  const saleMonthNum = saleDateVal ? parseInt(saleDateVal.split('-')[1], 10) : undefined;
  setFieldError('fg-saledate', !!saleDateVal && !(saleMonthNum>=1 && saleMonthNum<=12));
  if(!ok) return;

  const newRecord = [yearVal, modelVal, customerVal, frameVal, regisVal, statusVal, pincodeVal, addressVal, phoneVal, saleMonthNum, invDateVal||''];
  const { imported, replaced } = upsertRecords([newRecord]);

  /* Re-render every part of the dashboard that depends on this data */
  renderKPI();
  renderGrid();
  populateModelDatalist();
  populateYearReportModelOptions();
  renderYearReport();
  if(currentDrawerModel === modelVal){ openDrawer(modelVal); }
  persistState();

  addSuccessText.textContent = replaced
    ? `Existing record with the same Frame No. + Regis No. was found \u2014 it was replaced with this new entry for ${customerVal} \u00b7 ${modelVal} (${yearVal}).`
    : `Added ${customerVal} \u00b7 ${modelVal} (${yearVal}) to the dashboard.`;
  addSuccessBanner.classList.add('show');
  addRecordForm.reset();
  document.getElementById('fldYear').value = new Date().getFullYear();
  document.getElementById('fldInvDate').value = '';
  setSaleDate(currentMonthValue());
  ['fg-year','fg-model','fg-customer','fg-status','fg-saledate'].forEach(id=>setFieldError(id, false));
  document.getElementById('statusRecovered').checked = true;
});

/* ===================== UPLOAD FILE (CSV / EXCEL IMPORT) ===================== */
const uploadBtn = document.getElementById('uploadBtn');
const fileUploadInput = document.getElementById('fileUploadInput');
const toastStack = document.getElementById('uploadToastStack');

function showToast(title, body, isError){
  const el = document.createElement('div');
  el.className = 'upload-toast' + (isError ? ' toast-error' : '');
  const icon = isError
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/></svg>';
  el.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div>
      <div class="toast-title">${esc(title)}</div>
      <div class="toast-body">${esc(body)}</div>
    </div>
    <button class="toast-close" aria-label="Dismiss">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>`;
  toastStack.appendChild(el);
  const remove = () => {
    el.classList.add('toast-leaving');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, 7000);
}

uploadBtn.addEventListener('click', () => fileUploadInput.click());

/* Recognise a wide range of header spellings so real-world exports (any column
   order, case, or naming) still map onto the record shape the dashboard uses. */
const HEADER_ALIASES = {
  year:      ['year', 'sale year', 'yr'],
  model:     ['model', 'vehicle model', 'product', 'model variant', 'variant'],
  customer:  ['customer', 'customer name', 'name', 'buyer'],
  frame:     ['frame', 'frame no', 'chassis', 'chassis no'],
  regis:     ['regis', 'regis no', 'registration', 'registration no', 'reg no', 'reg number'],
  status:    ['status', 'customer status', 'lost customer filter', 'customer filter'],
  pincode:   ['pincode', 'pin code', 'pin'],
  address:   ['address'],
  phone:     ['phone', 'mobile', 'contact', 'phone number', 'mobile number', 'customer number 1', 'customer number', 'customer no'],
  month:     ['month', 'sale month', 'month of sale'],
  invdate:   ['inv dt', 'invoice date', 'sale date', 'date of sale', 'purchase date', 'invdt', 'inv date'],
};

/* Parse a wide range of real-world date spellings (ISO, DD-MM-YYYY, DD/MM/YYYY,
   Excel-exported text, JS Date objects) into a plain Date, or null if unparseable. */
function parseDateFlexible(v){
  if(v===undefined || v===null || v==='') return null;
  if(v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  if(!s) return null;
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  // 2-digit year, month-first (mm-dd-yy) — how these sheets export dates.
  // Handled explicitly so Firefox/Safari (which reject "04-06-15") keep the exact day.
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
  if(m){ const yy = +m[3]; return new Date(yy + (yy < 70 ? 2000 : 1900), +m[1]-1, +m[2]); }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function toISODate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDisplayDate(iso){
  if(!iso) return '\u2014';
  const [y,m,d] = iso.split('-');
  return `${d}-${MONTH_NAMES_SHORT[+m-1]}-${y}`;
}

function normalizeHeader(h){ return String(h||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

function buildFieldIndex(headerRow){
  const idx = {};
  const normalized = headerRow.map(normalizeHeader);
  for(const field in HEADER_ALIASES){
    for(const alias of HEADER_ALIASES[field]){
      const pos = normalized.indexOf(alias);
      if(pos !== -1){ idx[field] = pos; break; }
    }
  }
  return idx;
}

const STATUS_ALIASES = {
  'lost': 'Lost Customer', 'lost customer': 'Lost Customer',
  'recovered': 'Recovered Customer', 'recovered customer': 'Recovered Customer',
  'other': 'Other',
};
function normalizeStatus(s){
  const key = String(s||'').trim().toLowerCase();
  return STATUS_ALIASES[key] || (String(s||'').trim() || 'Other');
}

/* Rows are either plain arrays (no header matched) or objects keyed by the
   detected header index; this turns either shape into a validated record
   in the same [year, model, customer, frame, regis, status, pincode, address, phone, month]
   order that addNewRecord expects. */
function rowToRecord(row, fieldIndex, hasHeader){
  const get = (field, fallbackPos) => {
    if(hasHeader && fieldIndex[field] !== undefined) return row[fieldIndex[field]];
    if(!hasHeader && fallbackPos !== undefined) return row[fallbackPos];
    return undefined;
  };
  const yearRaw = get('year', 0);
  const model = String(get('model', 1) || '').trim().toUpperCase();
  const customer = String(get('customer', 2) || '').trim();
  const frame = String(get('frame', 3) || '').trim();
  const regis = String(get('regis', 4) || '').trim();
  const status = normalizeStatus(get('status', 5));
  const pincode = String(get('pincode', 6) || '').trim();
  const address = String(get('address', 7) || '').trim();
  const phone = String(get('phone', 8) || '').trim();
  const monthRaw = get('month', 9);
  const invDateRaw = get('invdate', 10);

  let year = parseInt(yearRaw, 10);
  let month = monthRaw !== undefined && monthRaw !== '' ? parseInt(monthRaw, 10) : undefined;

  const parsedInvDate = parseDateFlexible(invDateRaw);
  const invDate = parsedInvDate ? toISODate(parsedInvDate) : '';
  if(parsedInvDate){
    if(!(year >= 2000 && year <= 2100)) year = parsedInvDate.getFullYear();
    if(!(month>=1 && month<=12)) month = parsedInvDate.getMonth()+1;
  }

  if(!(year >= 2000 && year <= 2100)) return null;
  if(!model || !customer) return null;

  return [year, model, customer, frame, regis, status, pincode, address, phone, (month>=1 && month<=12) ? month : undefined, invDate];
}

function importRows(rawRows){
  if(rawRows.length === 0){
    showToast('Nothing to import', 'The file appears to be empty.', true);
    return;
  }

  const firstRow = rawRows[0];
  const looksLikeHeader = firstRow.some(cell => {
    const n = normalizeHeader(cell);
    return Object.values(HEADER_ALIASES).some(list => list.includes(n));
  });
  const fieldIndex = looksLikeHeader ? buildFieldIndex(firstRow) : {};
  const dataRows = looksLikeHeader ? rawRows.slice(1) : rawRows;

  const validRecs = [];
  let skipped = 0;
  for(const row of dataRows){
    if(!row || row.every(c => c === '' || c === undefined || c === null)) continue;
    const rec = rowToRecord(row, fieldIndex, looksLikeHeader);
    if(rec) validRecs.push(rec);
    else skipped++;
  }

  if(validRecs.length === 0){
    showToast('Import failed', `No valid rows found${skipped ? ` (${skipped} skipped)` : ''}. Check that Year, Model and Customer columns are present.`, true);
    return;
  }

  const { imported, replaced } = upsertRecords(validRecs);

  renderKPI();
  renderGrid();
  populateModelDatalist();
  populateYearReportModelOptions();
  renderYearReport();
  if(currentDrawerModel) openDrawer(currentDrawerModel);
  persistState();

  const parts = [];
  if(imported) parts.push(`${fmt(imported)} new`);
  if(replaced) parts.push(`${fmt(replaced)} replaced (matched by Frame No. + Regis No.)`);
  if(skipped) parts.push(`${fmt(skipped)} skipped`);
  showToast('Upload complete', parts.join(' \u00b7 ') + '.', false);
}

function setUploadBusy(busy){
  uploadBtn.classList.toggle('is-busy', busy);
}

fileUploadInput.addEventListener('change', () => {
  const file = fileUploadInput.files[0];
  if(!file) return;
  if(!canUpload()){ showToast('Access required', 'You need manager or admin access to upload files.', true); fileUploadInput.value=''; return; }
  setUploadBusy(true);

  const finish = () => { setUploadBusy(false); fileUploadInput.value = ''; };
  const ext = file.name.split('.').pop().toLowerCase();

  if(ext === 'csv'){
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => {
        try { importRows(res.data); }
        catch(err){ showToast('Import failed', String(err.message||err), true); }
        finish();
      },
      error: (err) => { showToast('Import failed', String(err.message||err), true); finish(); },
    });
  } else if(ext === 'xlsx' || ext === 'xls'){
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        importRows(rows);
      } catch(err){ showToast('Import failed', String(err.message||err), true); }
      finish();
    };
    reader.onerror = () => { showToast('Import failed', 'Could not read the file.', true); finish(); };
    reader.readAsArrayBuffer(file);
  } else {
    showToast('Unsupported file', 'Please upload a .csv, .xlsx or .xls file.', true);
    finish();
  }
});

/* ===== Auto-hide header on scroll ===== */
(function(){
  const header = document.getElementById('mainHeader');
  if(!header) return;
  let ticking = false;
  const TOP_THRESHOLD = 10; // px — must scroll back to (near) the very top to reveal

  function onScroll(){
    const curY = window.pageYOffset || document.documentElement.scrollTop;
    if(curY <= TOP_THRESHOLD){
      header.classList.remove('header-hidden');
    } else {
      header.classList.add('header-hidden');
    }
    ticking = false;
  }

  window.addEventListener('scroll', function(){
    if(!ticking){
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
})();
