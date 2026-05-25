const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── CURRENCIES ──
const CURRENCIES = [
  { code:'EUR', symbol:'€',  name:'Euro' },
  { code:'USD', symbol:'$',  name:'US Dollar' },
  { code:'THB', symbol:'฿',  name:'Thai Baht' },
  { code:'IDR', symbol:'Rp', name:'Indonesian Rupiah' },
  { code:'GBP', symbol:'£',  name:'British Pound' },
  { code:'SGD', symbol:'S$', name:'Singapore Dollar' },
  { code:'AUD', symbol:'A$', name:'Australian Dollar' },
  { code:'JPY', symbol:'¥',  name:'Japanese Yen' },
];

// ── DATA STORE ──
let db = {
  clients: [],
  invoices: [],
  settings: {
    fromName:'', fromAddr1:'', fromAddr2:'', fromAddr3:'', fromEmail:'', fromPhone:'',
    bankAccount:'', bankHolder:'', bankHolderAddr:'', bankName:'', bankSwift:'', bankAddr:'', bankType:'IBAN',
    currencyCode:'EUR', currencySymbol:'€', currencyCustom:'', decimalSep:'.', invoiceStartNumber: 1
  }
};
let lines = [{ desc:'', qty:1, price:0 }];
let editingInvoiceId = null;
let clientModalCallback = null;

function loadDB() {
  const raw = localStorage.getItem('inv_db_v3');
  if (raw) { try { const parsed = JSON.parse(raw); db = { ...db, ...parsed }; if (!db.settings.currencyCode) db.settings.currencyCode='EUR'; if (!db.settings.currencySymbol) db.settings.currencySymbol='€'; } catch(e) {} }
}
function saveDB() { localStorage.setItem('inv_db_v3', JSON.stringify(db)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function getNextInvoiceNumber() {
  // Find the highest numeric invoice number across all saved invoices
  let max = null;
  db.invoices.forEach(inv => {
    const n = parseInt((inv.number||'').replace(/\D/g,''), 10);
    if (!isNaN(n) && (max === null || n > max)) max = n;
  });
  // If we found invoices with numbers, next = max + 1; otherwise use the setting
  const next = max !== null ? max + 1 : (parseInt(db.settings.invoiceStartNumber, 10) || 1);
  return String(next);
}

// ── FORMAT ──
function getCurrencySymbol() {
  const s = db.settings;
  return s.currencyCustom ? s.currencyCustom : (s.currencySymbol || '€');
}
function fmt(n) {
  const sym = getCurrencySymbol();
  const sep = db.settings.decimalSep || '.';
  const abs = Math.abs(n||0);
  const sign = (n||0) < 0 ? '-' : '';
  if (sep === ',') {
    // Format integer and decimal parts separately to avoid regex fragility
    const [intPart, decPart] = abs.toFixed(2).split('.');
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + sym + '\u00a0' + intFormatted + ',' + decPart;
  } else {
    const str = abs.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    return sign + sym + '\u00a0' + str;
  }
}
function fmtDate(val) {
  if (!val) return '—';
  const [y, m, d] = val.split('-');
  return `${String(parseInt(d,10)).padStart(2,'0')}-${String(parseInt(m,10)).padStart(2,'0')}-${y}`;
}

// ── THEME ──
const THEMES = [
  { key: 'light', label: '☀ Light' },
  { key: 'dim',   label: '◑ Dim'   },
  { key: 'dark',  label: '☾ Dark'  },
];
function applyTheme(key) {
  document.body.classList.remove('theme-dim','theme-dark');
  if (key === 'dim')  document.body.classList.add('theme-dim');
  if (key === 'dark') document.body.classList.add('theme-dark');
  const t = THEMES.find(t => t.key === key) || THEMES[0];
  const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = t.label + ' →';
  localStorage.setItem('inv_theme', key);
}
function cycleTheme() {
  const cur = localStorage.getItem('inv_theme') || 'light';
  const idx = THEMES.findIndex(t => t.key === cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next.key);
}

// ── TABS ──
function switchTab(tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab:not(.nav-tab-new)').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  const tabs = ['invoice','invoices','clients','monthly','yearly'];
  const allTabs = document.querySelectorAll('.nav-tab:not(.nav-tab-new)');
  allTabs[tabs.indexOf(tab)]?.classList.add('active');
  if (tab === 'invoices') renderInvoiceList();
  if (tab === 'clients') renderClientList();
  if (tab === 'monthly') { initMonthlyFilter(); renderMonthly(); }
  if (tab === 'yearly') { initYearlyFilter(); renderYearly(); }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── SETTINGS ──
function buildCurrencyGrid() {
  const grid = document.getElementById('currency-grid');
  const cur = db.settings.currencyCode;
  grid.innerHTML = CURRENCIES.map(c =>
    `<button class="currency-btn${c.code===cur&&!db.settings.currencyCustom?' active':''}" onclick="selectCurrency('${c.code}','${c.symbol}')" title="${c.name}">${c.symbol} ${c.code}</button>`
  ).join('');
}
function selectCurrency(code, symbol) {
  db.settings.currencyCode = code;
  db.settings.currencySymbol = symbol;
  db.settings.currencyCustom = '';
  document.getElementById('s-currency-custom').value = '';
  buildCurrencyGrid();
}
function updateCustomCurrency() {
  const val = document.getElementById('s-currency-custom').value.trim();
  db.settings.currencyCustom = val;
  // deselect preset buttons
  document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
}

function openSettings() {
  const s = db.settings;
  buildCurrencyGrid();
  document.getElementById('s-invoice-start').value = db.settings.invoiceStartNumber || 1;
  document.getElementById('s-currency-custom').value = s.currencyCustom || '';
  document.getElementById('s-decimal-sep').value = s.decimalSep || '.';
  document.getElementById('s-from-name').value = s.fromName || '';
  document.getElementById('s-from-addr1').value = s.fromAddr1 || '';
  document.getElementById('s-from-addr2').value = s.fromAddr2 || '';
  document.getElementById('s-from-addr3').value = s.fromAddr3 || '';
  document.getElementById('s-from-email').value = s.fromEmail || '';
  document.getElementById('s-from-phone').value = s.fromPhone || '';
  document.getElementById('s-bank-account').value = s.bankAccount || '';
  document.getElementById('s-bank-holder').value = s.bankHolder || '';
  document.getElementById('s-bank-holder-addr').value = s.bankHolderAddr || '';
  document.getElementById('s-bank-name').value = s.bankName || '';
  document.getElementById('s-bank-swift').value = s.bankSwift || '';
  document.getElementById('s-bank-addr').value = s.bankAddr || '';
  const bt = document.querySelector(`input[name="s-bank-type"][value="${s.bankType||'IBAN'}"]`);
  if (bt) bt.checked = true;
  document.getElementById('settings-modal').classList.add('open');
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('open'); }
function saveSettings() {
  const s = db.settings;
  s.invoiceStartNumber = parseInt(document.getElementById('s-invoice-start').value, 10) || 1;
  const custom = document.getElementById('s-currency-custom').value.trim();
  s.currencyCustom = custom;
  s.decimalSep = document.getElementById('s-decimal-sep').value;
  s.fromName = document.getElementById('s-from-name').value.trim();
  s.fromAddr1 = document.getElementById('s-from-addr1').value.trim();
  s.fromAddr2 = document.getElementById('s-from-addr2').value.trim();
  s.fromAddr3 = document.getElementById('s-from-addr3').value.trim();
  s.fromEmail = document.getElementById('s-from-email').value.trim();
  s.fromPhone = document.getElementById('s-from-phone').value.trim();
  s.bankAccount = document.getElementById('s-bank-account').value.trim();
  s.bankHolder = document.getElementById('s-bank-holder').value.trim();
  s.bankHolderAddr = document.getElementById('s-bank-holder-addr').value.trim();
  s.bankName = document.getElementById('s-bank-name').value.trim();
  s.bankSwift = document.getElementById('s-bank-swift').value.trim();
  s.bankAddr = document.getElementById('s-bank-addr').value.trim();
  const bt = document.querySelector('input[name="s-bank-type"]:checked');
  s.bankType = bt ? bt.value : 'IBAN';
  saveDB();
  closeSettings();
  applySettingsToInvoice();
  renderInvoice();
  showToast('Settings saved ✓');
}

function applySettingsToInvoice() {
  const s = db.settings;
  document.getElementById('from-name') && (document.getElementById('from-name').textContent = s.fromName);
  // Settings are pulled directly in renderInvoice() from db.settings
}

// ── CLIENT MODAL ──
function openClientModal(clientId = null, fromInvoice = false) {
  document.getElementById('modal-client-id').value = clientId || '';
  if (clientId) {
    const c = db.clients.find(x => x.id === clientId);
    document.getElementById('modal-title').textContent = 'Edit Client';
    document.getElementById('modal-name').value = c.name || '';
    document.getElementById('modal-addr1').value = c.addr1 || '';
    document.getElementById('modal-addr2').value = c.addr2 || '';
    document.getElementById('modal-country').value = c.country || '';
  } else {
    document.getElementById('modal-title').textContent = 'Add Client';
    ['modal-name','modal-addr1','modal-addr2','modal-country'].forEach(id => document.getElementById(id).value = '');
  }
  clientModalCallback = fromInvoice ? (newId) => { populateClientDropdown(); document.getElementById('client-select').value = newId; loadClient(); } : null;
  document.getElementById('client-modal').classList.add('open');
  setTimeout(() => document.getElementById('modal-name').focus(), 50);
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('open'); }
function saveClient() {
  const name = document.getElementById('modal-name').value.trim();
  if (!name) { alert('Client name is required.'); return; }
  const id = document.getElementById('modal-client-id').value;
  const obj = { id: id || uid(), name, addr1: document.getElementById('modal-addr1').value.trim(), addr2: document.getElementById('modal-addr2').value.trim(), country: document.getElementById('modal-country').value.trim() };
  if (id) { const idx = db.clients.findIndex(c => c.id === id); db.clients[idx] = obj; db.invoices.forEach(inv => { if (inv.clientId === id) inv.clientName = name; }); }
  else { db.clients.push(obj); }
  saveDB(); closeClientModal(); renderClientList(); populateClientDropdown();
  if (clientModalCallback) clientModalCallback(obj.id);
  showToast(id ? 'Client updated.' : 'Client saved.');
}
function deleteClient(id) {
  if (!confirm('Delete this client?')) return;
  db.clients = db.clients.filter(c => c.id !== id);
  saveDB(); renderClientList(); populateClientDropdown(); showToast('Client deleted.');
}
function renderClientList() {
  const q = document.getElementById('client-search').value.toLowerCase();
  const tbody = document.getElementById('client-list-body');
  const list = db.clients.filter(c => c.name.toLowerCase().includes(q));
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="5" class="no-data">${db.clients.length ? 'No results.' : 'No clients yet.'}</td></tr>`; return; }
  tbody.innerHTML = list.map(c => {
    const cnt = db.invoices.filter(i => i.clientId === c.id).length;
    return `<tr>
      <td><strong>${c.name}</strong></td>
      <td>${[c.addr1,c.addr2].filter(Boolean).join(', ')||'—'}</td>
      <td>${c.country||'—'}</td>
      <td>${cnt}</td>
      <td><div class="actions">
        <button class="btn" onclick="openClientModal('${c.id}')">Edit</button>
        <button class="btn danger" onclick="deleteClient('${c.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}
function populateClientDropdown() {
  const sel = document.getElementById('client-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select a client —</option>';
  db.clients.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => { const o = document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
  if (cur) sel.value = cur;
  const flt = document.getElementById('inv-filter-client');
  if (flt) {
    const curF = flt.value;
    flt.innerHTML = '<option value="">All Clients</option>';
    db.clients.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => { const o = document.createElement('option'); o.value=c.id; o.textContent=c.name; flt.appendChild(o); });
    flt.value = curF;
  }
}
function loadClient() {
  const id = document.getElementById('client-select').value;
  if (!id) return;
  const c = db.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('to-name').value = c.name;
  document.getElementById('to-addr1').value = c.addr1 || '';
  document.getElementById('to-addr2').value = c.addr2 || '';
  document.getElementById('to-country').value = c.country || '';
  renderInvoice();
}
function clearClient() {
  document.getElementById('client-select').value = '';
  ['to-name','to-addr1','to-addr2','to-country'].forEach(id => document.getElementById(id).value = '');
  renderInvoice();
}

// ── INVOICE EDITOR ──
function g(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function autoSubjectValue(dateVal) {
  if (!dateVal) return '';
  const [y, m] = dateVal.split('-');
  return `${MONTHS[parseInt(m,10)-1]} ${y}`;
}
function autofillSubject() {
  const subEl = document.getElementById('subject');
  const dateVal = document.getElementById('inv-date').value;
  const current = subEl.value.trim();
  // Only autofill if blank or if it still matches a previously auto-generated value
  if (!current || MONTHS.some(mn => current.startsWith(mn + ' '))) {
    subEl.value = autoSubjectValue(dateVal);
  }
}
function computeTotal() {
  const sub = lines.reduce((s,l) => s + (l.qty||0)*(l.price||0), 0);
  const vat = sub * (parseFloat(document.getElementById('vat-rate').value)||0) / 100;
  return { sub, vat, grand: sub+vat };
}
function renderLineEditor() {
  const el = document.getElementById('line-items-editor');
  el.innerHTML = '';
  lines.forEach((ln, i) => {
    const row = document.createElement('div');
    row.className = 'line-item';
    row.innerHTML = `
      <input type="text" placeholder="Description" value="${(ln.desc||'').replace(/"/g,'&quot;')}" oninput="lines[${i}].desc=this.value;renderInvoice()">
      <input type="number" placeholder="Qty" value="${ln.qty}" min="0" step="1" oninput="lines[${i}].qty=parseFloat(this.value)||0;renderInvoice()">
      <input type="number" placeholder="Price" value="${ln.price}" min="0" step="0.01" oninput="lines[${i}].price=parseFloat(this.value)||0;renderInvoice()">
      <button class="remove-btn" onclick="removeLine(${i})">&times;</button>
    `;
    el.appendChild(row);
  });
}
function addLine() { lines.push({desc:'',qty:1,price:0}); renderLineEditor(); renderInvoice(); }
function removeLine(i) { if (lines.length===1) return; lines.splice(i,1); renderLineEditor(); renderInvoice(); }

function renderInvoice() {
  const s = db.settings;
  document.getElementById('p-number').textContent = g('inv-number') || '—';
  document.getElementById('p-date').textContent = fmtDate(g('inv-date'));
  document.getElementById('p-to-name').textContent = g('to-name');
  document.getElementById('p-to-addr').innerHTML = [g('to-addr1'),g('to-addr2'),g('to-country')].filter(Boolean).join('<br>');
  document.getElementById('p-from-name').textContent = s.fromName || '';
  document.getElementById('p-from-addr').innerHTML = [s.fromAddr1,s.fromAddr2,s.fromAddr3,s.fromEmail,s.fromPhone].filter(Boolean).join('<br>');
  const subEl = document.getElementById('p-subject');
  const subVal = g('subject');
  subEl.textContent = subVal ? 'Re: '+subVal : '';
  subEl.style.display = subVal ? '' : 'none';

  const tbody = document.getElementById('p-lines');
  tbody.innerHTML = '';
  lines.forEach(ln => {
    const total = (ln.qty||0)*(ln.price||0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${ln.desc||''}</td><td class="center">${ln.qty}</td><td class="right">${fmt(ln.price||0)}</td><td class="right">${fmt(total)}</td>`;
    tbody.appendChild(tr);
  });

  const { sub, vat, grand } = computeTotal();
  const vatRate = parseFloat(document.getElementById('vat-rate').value)||0;
  document.getElementById('p-totals').innerHTML = `
    <div class="totals-row"><span>Subtotal (excl. VAT)</span><span>${fmt(sub)}</span></div>
    <div class="totals-row"><span>VAT (${vatRate}%)</span><span>${fmt(vat)}</span></div>
    <div class="totals-row total-final"><span>Total Due</span><span>${fmt(grand)}</span></div>
  `;

  const bankLabel = s.bankType || 'IBAN';
  const payRows = [
    ['Account Number', s.bankAccount],
    ['Account Name', s.bankHolder],
    ['Account Holder Address', s.bankHolderAddr],
    ['Bank', s.bankName],
    [bankLabel, s.bankSwift],
    ['Bank Address', s.bankAddr],
  ].filter(([,v]) => v);
  document.getElementById('p-payment').innerHTML = payRows.map(([k,v]) => `<span class="payment-key">${k}:</span><span class="payment-val">${v}</span>`).join('');

  const dateVal = g('inv-date');
  const invNum = (g('inv-number')||'').replace(/[^a-zA-Z0-9\-_]/g,'_');
  const clientSlug = (g('to-name')||'').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9\-_]/g,'');
  let monthSlug = '', yearSlug = '';
  if (dateVal) { const [y,m] = dateVal.split('-'); monthSlug = MONTHS[parseInt(m,10)-1]; yearSlug = y; }
  const previewParts = [invNum, clientSlug, monthSlug, yearSlug].filter(Boolean);
  document.getElementById('filename-preview').textContent = previewParts.length ? `Invoice_${previewParts.join('_')}.pdf` : 'invoice.pdf';
}

function saveInvoice() {
  const toName = g('to-name');
  const date = g('inv-date');
  if (!toName) { alert('Please fill in the client name.'); return; }
  if (!date) { alert('Please set the invoice date.'); return; }
  const { grand } = computeTotal();
  const s = db.settings;
  const invObj = {
    id: editingInvoiceId || uid(),
    number: g('inv-number'), date, clientId: document.getElementById('client-select').value,
    clientName: toName, toAddr1: g('to-addr1'), toAddr2: g('to-addr2'), toCountry: g('to-country'),
    subject: g('subject'), lines: JSON.parse(JSON.stringify(lines)),
    vatRate: parseFloat(document.getElementById('vat-rate').value)||0,
    grandTotal: grand,
    currencySymbol: getCurrencySymbol()
  };
  if (editingInvoiceId) {
    const idx = db.invoices.findIndex(i => i.id === editingInvoiceId);
    if (idx !== -1) {
      invObj.paid = db.invoices[idx].paid; // preserve existing paid status
      db.invoices[idx] = invObj;
    } else {
      invObj.paid = false;
      db.invoices.push(invObj);
    }
    editingInvoiceId = null;
    showToast('Invoice updated.');
  } else {
    invObj.paid = false;
    db.invoices.push(invObj);
    showToast('Invoice saved!');
  }
  saveDB();
  switchTab('invoices');
}

function hasUnsavedContent() {
  // Consider there's something worth saving if: client name is filled, OR any line has a description/price
  const clientName = g('to-name');
  const hasLines = lines.some(l => l.desc.trim() || l.price > 0);
  return !!(clientName || hasLines);
}

function maybeNewInvoice() {
  if (hasUnsavedContent()) {
    document.getElementById('unsaved-modal').classList.add('open');
  } else {
    newInvoice();
  }
}

function closeUnsavedModal() {
  document.getElementById('unsaved-modal').classList.remove('open');
}

function discardAndNew() {
  closeUnsavedModal();
  newInvoice();
}

function saveAndNew() {
  closeUnsavedModal();
  // Reuse saveInvoice logic but then start a new invoice instead of switching to list
  const toName = g('to-name');
  const date = g('inv-date');
  if (!toName) { alert('Please fill in the client name to save.'); return; }
  if (!date) { alert('Please set the invoice date to save.'); return; }
  const { grand } = computeTotal();
  const invObj = {
    id: editingInvoiceId || uid(),
    number: g('inv-number'), date, clientId: document.getElementById('client-select').value,
    clientName: toName, toAddr1: g('to-addr1'), toAddr2: g('to-addr2'), toCountry: g('to-country'),
    subject: g('subject'), lines: JSON.parse(JSON.stringify(lines)),
    vatRate: parseFloat(document.getElementById('vat-rate').value)||0,
    grandTotal: grand,
    currencySymbol: getCurrencySymbol()
  };
  if (editingInvoiceId) {
    const idx = db.invoices.findIndex(i => i.id === editingInvoiceId);
    if (idx !== -1) {
      invObj.paid = db.invoices[idx].paid;
      db.invoices[idx] = invObj;
    } else {
      invObj.paid = false;
      db.invoices.push(invObj);
    }
  } else {
    invObj.paid = false;
    db.invoices.push(invObj);
  }
  saveDB();
  showToast('Invoice saved ✓');
  newInvoice();
}

function newInvoice() {
  editingInvoiceId = null;
  document.getElementById('client-select').value = '';
  ['to-name','to-addr1','to-addr2','to-country','subject'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inv-number').value = getNextInvoiceNumber();
  document.getElementById('inv-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('vat-rate').value = '0';
  autofillSubject();
  lines = [{desc:'',qty:1,price:0}];
  renderLineEditor(); renderInvoice();
  switchTab('invoice');
}

function editInvoice(id) {
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) return;
  editingInvoiceId = id;
  document.getElementById('client-select').value = inv.clientId || '';
  document.getElementById('inv-number').value = inv.number || '';
  document.getElementById('inv-date').value = inv.date || '';
  document.getElementById('to-name').value = inv.clientName || '';
  document.getElementById('to-addr1').value = inv.toAddr1 || '';
  document.getElementById('to-addr2').value = inv.toAddr2 || '';
  document.getElementById('to-country').value = inv.toCountry || '';
  document.getElementById('subject').value = inv.subject || '';
  document.getElementById('vat-rate').value = inv.vatRate || 0;
  lines = JSON.parse(JSON.stringify(inv.lines));
  renderLineEditor(); renderInvoice();
  switchTab('invoice');
}

function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;
  db.invoices = db.invoices.filter(i => i.id !== id);
  saveDB(); renderInvoiceList(); showToast('Invoice deleted.');
}

function togglePaid(id, view='invoices') {
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) return;
  inv.paid = !inv.paid;
  saveDB();
  if (view === 'monthly') renderMonthly();
  else renderInvoiceList();
  showToast(inv.paid ? 'Marked as paid ✓' : 'Marked as unpaid');
}

function togglePaidMonthly(id) { togglePaid(id, 'monthly'); }

function printInvoice() {
  const s = db.settings;
  const dateVal = g('inv-date');
  const invNum = (g('inv-number')||'').replace(/[^a-zA-Z0-9\-_]/g,'_');
  const clientSlug = (g('to-name')||'').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9\-_]/g,'');
  let monthSlug = '', yearSlug = '';
  if (dateVal) { const [y,m] = dateVal.split('-'); monthSlug = MONTHS[parseInt(m,10)-1]; yearSlug = y; }
  const parts = [invNum, clientSlug, monthSlug, yearSlug].filter(Boolean);
  const fn = parts.length ? `Invoice_${parts.join('_')}.pdf` : 'invoice.pdf';
  const btns = document.querySelectorAll('.sidebar-actions button');
  const pdfBtn = document.querySelector('.sidebar-actions button.pdf-btn');
  btns.forEach(b => b.disabled = true);
  if (pdfBtn) pdfBtn.textContent = 'Generating…';
  html2pdf().set({
    margin:0, filename:fn, image:{type:'jpeg',quality:.98},
    html2canvas:{scale:2,useCORS:true}, jsPDF:{unit:'px',format:[794,1123],orientation:'portrait'}
  }).from(document.getElementById('invoice-sheet')).save().then(() => {
    btns.forEach(b => b.disabled = false);
    if (pdfBtn) pdfBtn.textContent = '↓ Export PDF';
  });
}

function exportInvoicePDF(id) {
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) return;

  // Build a temporary off-screen invoice sheet from saved data without touching the editor
  const s = db.settings;
  const sym = inv.currencySymbol || getCurrencySymbol();

  function fmtAmt(n) {
    const sep = s.decimalSep || '.';
    const abs = Math.abs(n||0);
    const sign = (n||0) < 0 ? '-' : '';
    if (sep === ',') {
      const [intPart, decPart] = abs.toFixed(2).split('.');
      const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return sign + sym + '\u00a0' + intFormatted + ',' + decPart;
    } else {
      const str = abs.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      return sign + sym + '\u00a0' + str;
    }
  }

  const sub = (inv.lines||[]).reduce((s,l) => s + (l.qty||0)*(l.price||0), 0);
  const vat = sub * (inv.vatRate||0) / 100;
  const grand = sub + vat;

  const addrLines = [inv.toAddr1, inv.toAddr2, inv.toCountry].filter(Boolean).join('<br>');
  const fromAddr = [s.fromAddr1, s.fromAddr2, s.fromAddr3, s.fromEmail, s.fromPhone].filter(Boolean).join('<br>');
  const subjectHtml = inv.subject
    ? `<div class="inv-subject">Re: ${inv.subject}</div>`
    : '';

  const linesHtml = (inv.lines||[]).map(ln => {
    const total = (ln.qty||0)*(ln.price||0);
    return `<tr><td>${ln.desc||''}</td><td class="center">${ln.qty}</td><td class="right">${fmtAmt(ln.price||0)}</td><td class="right">${fmtAmt(total)}</td></tr>`;
  }).join('');

  const bankLabel = s.bankType || 'IBAN';
  const payRows = [
    ['Account Number', s.bankAccount],
    ['Account Name', s.bankHolder],
    ['Account Holder Address', s.bankHolderAddr],
    ['Bank', s.bankName],
    [bankLabel, s.bankSwift],
    ['Bank Address', s.bankAddr],
  ].filter(([,v]) => v)
   .map(([k,v]) => `<span class="payment-key">${k}:</span><span class="payment-val">${v}</span>`)
   .join('');

  const invNum = (inv.number||'').replace(/[^a-zA-Z0-9\-_]/g,'_');
  const clientSlug = (inv.clientName||'').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9\-_]/g,'');
  let monthSlug = '', yearSlug = '';
  if (inv.date) { const [y,m] = inv.date.split('-'); monthSlug = MONTHS[parseInt(m,10)-1]; yearSlug = y; }
  const parts = [invNum, clientSlug, monthSlug, yearSlug].filter(Boolean);
  const fn = parts.length ? `Invoice_${parts.join('_')}.pdf` : 'invoice.pdf';

  const sheet = document.createElement('div');
  sheet.className = 'invoice-sheet';
  sheet.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
  sheet.innerHTML = `
    <div class="inv-header">
      <div class="inv-title">INVOICE</div>
      <div class="inv-meta">
        <div class="inv-meta-row"><span class="inv-meta-label">Invoice Number</span><span class="inv-meta-value">${inv.number||'—'}</span></div>
        <div class="inv-meta-row"><span class="inv-meta-label">Date</span><span class="inv-meta-value">${fmtDate(inv.date)}</span></div>
      </div>
    </div>
    <div class="inv-parties">
      <div>
        <div class="party-label">Invoice To</div>
        <div class="party-name">${inv.clientName||''}</div>
        <div class="party-line">${addrLines}</div>
      </div>
      <div>
        <div class="party-label">Invoice From</div>
        <div class="party-name">${s.fromName||''}</div>
        <div class="party-line">${fromAddr}</div>
      </div>
    </div>
    ${subjectHtml}
    <table class="inv-table">
      <thead><tr>
        <th>Description</th>
        <th class="center" style="width:80px">Qty</th>
        <th class="right" style="width:100px">Unit Price</th>
        <th class="right" style="width:110px">Total</th>
      </tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div><div class="inv-totals">
      <div class="totals-row"><span>Subtotal (excl. VAT)</span><span>${fmtAmt(sub)}</span></div>
      <div class="totals-row"><span>VAT (${inv.vatRate||0}%)</span><span>${fmtAmt(vat)}</span></div>
      <div class="totals-row total-final"><span>Total Due</span><span>${fmtAmt(grand)}</span></div>
    </div></div>
    <div class="inv-payment">
      <div class="payment-title">Payment Details</div>
      <div class="payment-grid">${payRows}</div>
    </div>
  `;
  document.body.appendChild(sheet);

  html2pdf().set({
    margin:0, filename:fn, image:{type:'jpeg',quality:.98},
    html2canvas:{scale:2,useCORS:true}, jsPDF:{unit:'px',format:[794,1123],orientation:'portrait'}
  }).from(sheet).save().then(() => {
    document.body.removeChild(sheet);
  });
}

// ── INVOICE LIST ──
function renderInvoiceList() {
  const q = document.getElementById('inv-search').value.toLowerCase();
  const fc = document.getElementById('inv-filter-client').value;
  const fs = document.getElementById('inv-filter-status').value;
  const fm = document.getElementById('inv-filter-month').value;
  let list = [...db.invoices].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if (q) list = list.filter(i => (i.clientName||'').toLowerCase().includes(q)||(i.number||'').toLowerCase().includes(q));
  if (fc) list = list.filter(i => i.clientId === fc);
  if (fs==='paid') list = list.filter(i => i.paid);
  if (fs==='unpaid') list = list.filter(i => !i.paid);
  if (fm) list = list.filter(i => (i.date||'').startsWith(fm));

  const tbody = document.getElementById('inv-list-body');
  const tfoot = document.getElementById('inv-list-foot');
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="7" class="no-data">${db.invoices.length?'No invoices match your filters.':'No invoices yet. Create your first one!'}</td></tr>`; tfoot.innerHTML=''; return; }
  tbody.innerHTML = list.map(inv => {
    const badge = inv.paid
      ? `<span class="status-badge paid" onclick="togglePaid('${inv.id}')" title="Click to mark unpaid">✓ Paid</span>`
      : `<span class="status-badge unpaid" onclick="togglePaid('${inv.id}')" title="Click to mark paid">⏳ Unpaid</span>`;
    return `<tr>
      <td><span style="font-family:var(--mono);font-size:12px">${inv.number||'—'}</span></td>
      <td><strong>${inv.clientName||'—'}</strong></td>
      <td>${fmtDate(inv.date)}</td>
      <td style="color:var(--ink-muted);font-size:12px">${inv.subject||'—'}</td>
      <td style="text-align:right"><span class="inv-amount">${fmt(inv.grandTotal)}</span></td>
      <td>${badge}</td>
      <td><div class="actions">
        <button class="btn" onclick="editInvoice('${inv.id}')">Edit</button>
        <button class="btn" onclick="exportInvoicePDF('${inv.id}')">PDF</button>
        <button class="btn danger" onclick="deleteInvoice('${inv.id}')">Del</button>
      </div></td>
    </tr>`;
  }).join('');
  const total = list.reduce((s,i) => s+(i.grandTotal||0), 0);
  const paid = list.filter(i=>i.paid).reduce((s,i) => s+(i.grandTotal||0), 0);
  const unpaid = total - paid;
  tfoot.innerHTML = `<tr>
    <td colspan="4" style="font-weight:600;font-size:12px">${list.length} invoice${list.length!==1?'s':''}</td>
    <td style="text-align:right;font-weight:600">${fmt(total)}</td>
    <td colspan="2" style="font-size:12px;color:var(--ink-muted)">
      <span style="color:var(--green)">✓ ${fmt(paid)}</span> &nbsp;
      <span style="color:var(--orange)">⏳ ${fmt(unpaid)}</span>
    </td>
  </tr>`;
}

// ── MONTHLY ──
function initMonthlyFilter() {
  const el = document.getElementById('monthly-filter');
  if (!el.value) el.value = new Date().toISOString().slice(0,7);
}
function renderMonthly() {
  const fm = document.getElementById('monthly-filter').value;
  let list = db.invoices.filter(i => fm ? (i.date||'').startsWith(fm) : true);
  list.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const total = list.reduce((s,i)=>s+(i.grandTotal||0),0);
  const paid = list.filter(i=>i.paid).reduce((s,i)=>s+(i.grandTotal||0),0);
  const unpaid = total-paid;
  document.getElementById('monthly-stats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Invoices</div><div class="stat-card-value">${list.length}</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Revenue</div><div class="stat-card-value mono">${fmt(total)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Paid (${list.filter(i=>i.paid).length})</div><div class="stat-card-value mono green">${fmt(paid)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Outstanding (${list.filter(i=>!i.paid).length})</div><div class="stat-card-value mono orange">${fmt(unpaid)}</div></div>
  `;
  const tbody = document.getElementById('monthly-body');
  const tfoot = document.getElementById('monthly-foot');
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="6" class="no-data">No invoices for this period.</td></tr>`; tfoot.innerHTML=''; return; }
  tbody.innerHTML = list.map(inv => {
    const badge = inv.paid
      ? `<span class="status-badge paid" onclick="togglePaidMonthly('${inv.id}')" title="Click to toggle">✓ Paid</span>`
      : `<span class="status-badge unpaid" onclick="togglePaidMonthly('${inv.id}')" title="Click to toggle">⏳ Unpaid</span>`;
    return `<tr>
      <td style="font-family:var(--mono);font-size:12px">${inv.number||'—'}</td>
      <td><strong>${inv.clientName||'—'}</strong></td>
      <td style="color:var(--ink-muted);font-size:12px">${inv.subject||'—'}</td>
      <td>${fmtDate(inv.date)}</td>
      <td class="right">${fmt(inv.grandTotal)}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
  tfoot.innerHTML = `<tr>
    <td colspan="4" style="font-weight:600">Total</td>
    <td class="right" style="font-weight:600">${fmt(total)}</td>
    <td style="font-size:12px"><span style="color:var(--green)">✓ ${fmt(paid)}</span></td>
  </tr>`;
}

// ── YEARLY ──
function initYearlyFilter() {
  const sel = document.getElementById('yearly-filter');
  const cur = sel.value || String(new Date().getFullYear());
  sel.innerHTML = '';
  const years = new Set(db.invoices.map(i=>(i.date||'').slice(0,4)).filter(Boolean));
  years.add(String(new Date().getFullYear()));
  [...years].sort((a,b)=>b-a).forEach(y => { const o=document.createElement('option'); o.value=y; o.textContent=y; sel.appendChild(o); });
  sel.value = cur || String(new Date().getFullYear());
}
function renderYearly() {
  const year = document.getElementById('yearly-filter').value;
  const list = db.invoices.filter(i=>(i.date||'').startsWith(year));
  const total = list.reduce((s,i)=>s+(i.grandTotal||0),0);
  const paid = list.filter(i=>i.paid).reduce((s,i)=>s+(i.grandTotal||0),0);
  const unpaid = total-paid;
  document.getElementById('yearly-stats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Invoices</div><div class="stat-card-value">${list.length}</div></div>
    <div class="stat-card"><div class="stat-card-label">Annual Revenue</div><div class="stat-card-value mono">${fmt(total)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Paid</div><div class="stat-card-value mono green">${fmt(paid)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Outstanding</div><div class="stat-card-value mono orange">${fmt(unpaid)}</div></div>
  `;
  const rows = MONTHS.map((mName,mi) => {
    const mStr = `${year}-${String(mi+1).padStart(2,'0')}`;
    const mList = list.filter(i=>(i.date||'').startsWith(mStr));
    const mT = mList.reduce((s,i)=>s+(i.grandTotal||0),0);
    const mP = mList.filter(i=>i.paid).reduce((s,i)=>s+(i.grandTotal||0),0);
    return {mName, count:mList.length, mT, mP, mO:mT-mP};
  });
  document.getElementById('yearly-body').innerHTML = rows.map(r => r.count===0
    ? `<tr style="opacity:.4"><td>${r.mName}</td><td class="right">—</td><td class="right">—</td><td class="right">—</td><td class="right">—</td></tr>`
    : `<tr><td><strong>${r.mName}</strong></td><td class="right">${r.count}</td><td class="right">${fmt(r.mT)}</td><td class="right" style="color:var(--green)">${fmt(r.mP)}</td><td class="right" style="color:var(--orange)">${r.mO>0?fmt(r.mO):'—'}</td></tr>`
  ).join('');
  document.getElementById('yearly-foot').innerHTML = `<tr>
    <td style="font-weight:600">Full Year ${year}</td>
    <td class="right" style="font-weight:600">${list.length}</td>
    <td class="right" style="font-weight:600">${fmt(total)}</td>
    <td class="right" style="font-weight:600;color:var(--green)">${fmt(paid)}</td>
    <td class="right" style="font-weight:600;color:var(--orange)">${unpaid>0?fmt(unpaid):'—'}</td>
  </tr>`;
}

// Close modals on overlay click
document.getElementById('client-modal').addEventListener('click', function(e){ if(e.target===this) closeClientModal(); });
document.getElementById('unsaved-modal').addEventListener('click', function(e){ if(e.target===this) closeUnsavedModal(); });

// ── INIT ──
(function init() {
  applyTheme(localStorage.getItem('inv_theme') || 'light');
  loadDB();
  populateClientDropdown();
  renderLineEditor();
  document.getElementById('inv-number').value = getNextInvoiceNumber();
  document.getElementById('inv-date').value = new Date().toISOString().slice(0,10);
  autofillSubject();
  renderInvoice();
})();
