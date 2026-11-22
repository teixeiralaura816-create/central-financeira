mport { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBu1hRG2tXqnpZC0aMwADIeHDI4CdOEDCc",
  authDomain: "raspadinha-atualizada.firebaseapp.com",
  projectId: "raspadinha-atualizada",
  storageBucket: "raspadinha-atualizada.firebasestorage.app",
  messagingSenderId: "287257624054",
  appId: "1:287257624054:web:79639f835cff59bdb51bd7",
  measurementId: "G-29CLHSR79B"
};

const app = initializeApp(firebaseConfig);
const dbFS = getFirestore(app);
let META_DIARIA = 350;
let MARGEM_ESTIMADA = 35;
const OLD_STORAGE_KEY = "acaiistel_caixa_diario_v1";
const produtos = {
  copo:["Açaí 250ml","Açaí 300ml","Açaí 400ml","Açaí 500ml","Açaí 700ml"],
  garrafa:["Açaí garrafa 300ml","Açaí garrafa 500ml"],
  bebidas:["Refri lata","Refri litro"],
  pasteis:["Pastel","Pastel T"],
  combos:["Combo 500 + 300","Açaí promocional 300ml","Açaí promocional 500ml","Açaí promocional 700ml"]
};
const estoqueCompras = ["Reposição de açaí","Complementos","Embalagens de estoque","Outros estoque"];
const operacional = ["Motoboy","Gás","Gasolina","Manutenção","Outros operacionais"];
const pessoal = ["Casa","Mercado","Pessoal 1","Pessoal 2","Outros pessoais"];
const contas = ["Aluguel","ÃƒÂgua","Energia","Internet","Moto","Mapec","Outros"];
let cloudHistory = {};
let activeMonth = "";

function br(v){ return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function hojeISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function isoToBr(iso){ if(!iso||!iso.includes("-")) return iso; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; }
function normalizeText(t){ return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function parseDay(v){
  const n = Number(v || 30);
  return Math.min(31, Math.max(1, n || 20));
}
function cycleRangeFrom(refIso, fechamentoDia){
  const ref = new Date(refIso + 'T12:00:00');
  const day = parseDay(fechamentoDia);
  let start;
  if(ref.getDate() >= day){
    start = new Date(ref.getFullYear(), ref.getMonth(), day);
  }else{
    start = new Date(ref.getFullYear(), ref.getMonth()-1, day);
  }
  let end = new Date(start.getFullYear(), start.getMonth()+1, day-1);
  if(day === 1) end = new Date(start.getFullYear(), start.getMonth()+1, 0);
  const toIso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {inicio: toIso(start), fim: toIso(end), label: `${isoToBr(toIso(start))} até ${isoToBr(toIso(end))}`};
}
function sumDailyRows(rows){
  return rows.reduce((acc, item) => {
    acc.totalRecebido += Number(item.totalRecebido || item.totalVendido || 0);
    acc.totalEstoque += Number(item.totalEstoque || 0);
    acc.totalOperacional += Number(item.totalOperacional || item.totalDespesas || 0);
    acc.totalPessoal += Number(item.totalPessoal || 0);
    acc.totalContas += Number(item.totalContas || 0);
    acc.saldoDia += Number(item.saldoDia || 0);
    return acc;
  }, {totalRecebido:0,totalEstoque:0,totalOperacional:0,totalPessoal:0,totalContas:0,saldoDia:0});
}

function monthRange(monthStr){
  const [y,m] = String(monthStr || hojeISO().slice(0,7)).split('-').map(Number);
  const start = new Date(y, (m||1)-1, 1);
  const end = new Date(y, (m||1), 0);
  const toIso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {inicio: toIso(start), fim: toIso(end), label: `${String(m).padStart(2,'0')}/${y}`};
}
function selectedMonth(){ return document.getElementById('mesAtual').value || hojeISO().slice(0,7); }
function updateMonthInputs(){
  const range = monthRange(selectedMonth());
  document.getElementById('periodoInicio').value = range.inicio;
  document.getElementById('periodoFim').value = range.fim;
  document.getElementById('cicloInfo').textContent = 'mês atual: ' + range.label;
}
function collectCurrentMonthSummary(){
  const range = monthRange(selectedMonth());
  const ids = Object.keys(cloudHistory).filter(d => d >= range.inicio && d <= range.fim).sort();
  const rows = ids.map(d => cloudHistory[d]);
  const sum = sumDailyRows(rows);
  return {...sum, ids, ...range};
}
async function gerarRelatorioMensal(){
  const resumo = collectCurrentMonthSummary();
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Fechamento mensal ${resumo.label}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#fff;color:#222;margin:24px}
    h1,h2{margin:0 0 10px}
    .muted{color:#666}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}
    .box{border:1px solid #ddd;border-radius:12px;padding:14px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #ddd;padding:8px;text-align:left}
    th{background:#f7f7f7}
    .num{text-align:right}
    @media print{body{margin:10mm}.no-print{display:none}}
  </style></head><body>
  <h1>Balanço mensal do caixa</h1>
  <div class="muted">mês: ${resumo.label}</div>
  <div class="grid">
    <div class="box"><b>Total recebido</b><br>${br(resumo.totalRecebido)}</div>
    <div class="box"><b>Estoque</b><br>${br(resumo.totalEstoque)}</div>
    <div class="box"><b>Operacional</b><br>${br(resumo.totalOperacional)}</div>
    <div class="box"><b>Pessoal</b><br>${br(resumo.totalPessoal)}</div>
    <div class="box"><b>Contas</b><br>${br(resumo.totalContas)}</div>
    <div class="box"><b>Saldo acumulado do mês</b><br>${br(resumo.saldoDia)}</div>
  </div>
  <h2>Movimento diário do mês</h2>
  <table><thead><tr><th>Data</th><th class="num">Recebido</th><th class="num">Estoque</th><th class="num">Operacional</th><th class="num">Pessoal</th><th class="num">Contas</th><th class="num">Saldo</th></tr></thead>
  <tbody>${resumo.ids.map(d => {
    const item = cloudHistory[d] || {};
    return `<tr><td>${isoToBr(d)}</td><td class="num">${br(item.totalRecebido || 0)}</td><td class="num">${br(item.totalEstoque || 0)}</td><td class="num">${br(item.totalOperacional || 0)}</td><td class="num">${br(item.totalPessoal || 0)}</td><td class="num">${br(item.totalContas || 0)}</td><td class="num">${br(item.saldoDia || 0)}</td></tr>`;
  }).join('') || '<tr><td colspan="7">Sem dias fechados nesse mês.</td></tr>'}</tbody></table>
  <div class="no-print" style="margin-top:18px"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
  </body></html>`;
  const w = window.open('', '_blank');
  if(!w) return alert('Seu navegador bloqueou a abertura do relatório. Libere pop-ups.');
  w.document.open(); w.document.write(html); w.document.close();
}
function resetVisualMes(){
  clearForm(false);
  document.getElementById('pVendido').textContent = br(0);
  document.getElementById('pEstoque').textContent = br(0);
  document.getElementById('pOperacional').textContent = br(0);
  document.getElementById('pPessoal').textContent = br(0);
  document.getElementById('pContas').textContent = br(0);
  document.getElementById('pSaldo').textContent = br(0);
}
async function mudarMes(){
  const novoMes = document.getElementById('mesAtual').value;
  if(!novoMes) return alert('Escolha um mês.');
  if(activeMonth && activeMonth !== novoMes){
    const querPdf = confirm(`Antes de mudar de mês, deseja abrir o PDF de balanço de ${monthRange(activeMonth).label}?`);
    if(querPdf){
      document.getElementById('mesAtual').value = activeMonth;
      await gerarRelatorioMensal();
      document.getElementById('mesAtual').value = novoMes;
    }
  }
  activeMonth = novoMes;
  updateMonthInputs();
  const range = monthRange(activeMonth);
  document.getElementById('data').value = range.inicio;
  resetVisualMes();
  renderHistorico();
  calcularPeriodo();
}
async function loadConfig(){
  try{
    const snap = await getDoc(doc(dbFS,'configuracoes','painel_admin_v1'));
    if(snap.exists()){ META_DIARIA = Number(snap.data().metaDiaria || 350); MARGEM_ESTIMADA = Number(snap.data().margemEstimada ?? 35); }
  }catch(e){ console.error(e); }
}

function createRows(list, tbodyId, prefix){
  document.getElementById(tbodyId).innerHTML = list.map((nome,i)=>`
    <tr><td>${nome}</td><td><input class="small-input" type="number" min="0" step="1" id="${prefix}_q_${i}" /></td><td><input class="small-input" type="number" min="0" step="0.01" id="${prefix}_v_${i}" /></td><td><span class="total-cell" id="${prefix}_t_${i}">R$ 0,00</span></td></tr>
  `).join('');
}
function createMoneyRows(list, tbodyId, prefix){
  document.getElementById(tbodyId).innerHTML = list.map((nome,i)=>`<tr><td>${nome}</td><td><input class="small-input" type="number" min="0" step="0.01" id="${prefix}_m_${i}" /></td></tr>`).join('');
}

createRows(produtos.copo,"produtosCopo","copo");
createRows(produtos.garrafa,"produtosGarrafa","garrafa");
createRows(produtos.bebidas,"produtosBebidas","bebida");
createRows(produtos.pasteis,"produtosPasteis","pastel");
createRows(produtos.combos,"produtosCombos","combo");
createMoneyRows(estoqueCompras,"estoqueTable","estoque");
createMoneyRows(operacional,"operacionalTable","op");
createMoneyRows(pessoal,"pessoalTable","pessoal");
createMoneyRows(contas,"contasTable","conta");
document.getElementById("data").value = hojeISO();
document.getElementById("mesAtual").value = hojeISO().slice(0,7);
activeMonth = document.getElementById("mesAtual").value;
updateMonthInputs();

function calcGrupo(list,prefix){
  let total=0;
  list.forEach((_,i)=>{
    const q=parseFloat(document.getElementById(`${prefix}_q_${i}`).value)||0;
    const v=parseFloat(document.getElementById(`${prefix}_v_${i}`).value)||0;
    const t=q*v;
    total+=t;
    document.getElementById(`${prefix}_t_${i}`).textContent=br(t);
  });
  return total;
}
function calcMoneyGrupo(list,prefix){
  let total=0;
  list.forEach((_,i)=> total += parseFloat(document.getElementById(`${prefix}_m_${i}`).value)||0);
  return total;
}
function totalPeriodoAll(){ const r = monthRange(selectedMonth()); return Object.entries(cloudHistory).reduce((acc,[d,item])=> (d>=r.inicio && d<=r.fim) ? acc+Number(item.totalRecebido||item.totalVendido||0) : acc,0); }

function calcularTudo(){
  const totalProdutos = calcGrupo(produtos.copo,"copo")+calcGrupo(produtos.garrafa,"garrafa")+calcGrupo(produtos.bebidas,"bebida")+calcGrupo(produtos.pasteis,"pastel")+calcGrupo(produtos.combos,"combo");
  const totalEntregas = Number(document.getElementById('entregaPedidosView').dataset.valor || 0);
  const totalRecebido = totalProdutos + totalEntregas;
  const totalEstoque = calcMoneyGrupo(estoqueCompras,"estoque");
  const totalOperacional = calcMoneyGrupo(operacional,"op");
  const totalPessoal = calcMoneyGrupo(pessoal,"pessoal");
  const totalContas = calcMoneyGrupo(contas,"conta");
  const lucroOperacional = totalRecebido - totalOperacional - totalContas;
  const lucroEstimado = (totalRecebido * (Number(MARGEM_ESTIMADA || 0)/100)) - totalOperacional - totalContas;
  const saldoDia = totalRecebido - totalEstoque - totalOperacional - totalPessoal - totalContas;

  const dataAtual = document.getElementById("data").value;
  const rangeMes = monthRange(selectedMonth());
  let saldoAcumulado=0;
  Object.keys(cloudHistory).sort().forEach(data=>{
    if(data < rangeMes.inicio || data > rangeMes.fim) return;
    if(data!==dataAtual) saldoAcumulado += Number(cloudHistory[data].saldoDia||0);
  });
  saldoAcumulado += saldoDia;

  document.getElementById("totalProdutos").textContent=br(totalProdutos);
  document.getElementById("totalEntregas").textContent=br(totalEntregas);
  document.getElementById("totalRecebido").textContent=br(totalRecebido);
  document.getElementById("totalEstoque").textContent=br(totalEstoque);
  document.getElementById("totalOperacional").textContent=br(totalOperacional);
  document.getElementById("totalPessoal").textContent=br(totalPessoal);
  document.getElementById("totalContas").textContent=br(totalContas);
  document.getElementById("saldoDia").textContent=br(saldoDia);
  document.getElementById("lucroOperacional").textContent=br(lucroOperacional);
  document.getElementById("lucroEstimado").textContent=br(lucroEstimado);
  document.getElementById("saldoAcumulado").textContent=br(saldoAcumulado);
  document.getElementById("totalPeriodo").textContent=br(totalPeriodoAll());
  document.getElementById("pedidosImportadosResumo").textContent = String(document.getElementById("pedidosImportadosView").textContent || 0);

  const metaBox=document.getElementById("metaBox");
  if(totalRecebido>=META_DIARIA){ metaBox.textContent=`Meta batida • ${br(META_DIARIA)}`; metaBox.className="meta-box meta-ok"; } 
  else { metaBox.textContent=`Meta não batida • meta ${br(META_DIARIA)}`; metaBox.className="meta-box meta-bad"; }

  return {totalProdutos,totalEntregas,totalRecebido,totalEstoque,totalOperacional,totalPessoal,totalContas,lucroOperacional,lucroEstimado,saldoDia,metaBatida: totalRecebido>=META_DIARIA};
}
document.body.addEventListener("input", calcularTudo);

function collectGroup(list,prefix){
  return list.map((nome,i)=>({nome,quantidade:parseFloat(document.getElementById(`${prefix}_q_${i}`).value)||0,valor:parseFloat(document.getElementById(`${prefix}_v_${i}`).value)||0}));
}
function collectMoneyGroup(list,prefix){
  return list.map((nome,i)=>({nome,valor:parseFloat(document.getElementById(`${prefix}_m_${i}`).value)||0}));
}
function fillGroup(items,prefix){
  items.forEach((item,i)=>{
    const q=document.getElementById(`${prefix}_q_${i}`);
    const v=document.getElementById(`${prefix}_v_${i}`);
    if(q) q.value=item.quantidade??"";
    if(v) v.value=item.valor??"";
  });
}
function fillMoneyGroup(items,prefix){
  items.forEach((item,i)=>{
    const m=document.getElementById(`${prefix}_m_${i}`);
    if(m) m.value=item.valor??"";
  });
}
function clearForm(keepDate=true){
  document.querySelectorAll('input[type="number"]').forEach(inp=>inp.value="");
  document.getElementById('entregaPedidosView').dataset.valor = '0';
  document.getElementById('entregaPedidosView').textContent = br(0);
  document.getElementById('pedidosImportadosView').textContent = '0';
  document.getElementById('pedidosImportadosResumo').textContent = '0';
  if(!keepDate) document.getElementById("data").value=hojeISO();
  calcularTudo();
}
function subtractSnapshot(snapshot){
  if(!snapshot) return;
  Object.entries(snapshot).forEach(([key,val])=>{
    const q=document.getElementById(`${key}`);
    if(q) q.value = Math.max(0,(parseFloat(q.value)||0) - Number(val.qty||0));
  });
}
function applySnapshot(snapshot){
  Object.entries(snapshot).forEach(([key,val])=>{
    const q=document.getElementById(`${key}`);
    const vId = key.replace('_q_','_v_');
    const v=document.getElementById(vId);
    if(q) q.value = (parseFloat(q.value)||0) + Number(val.qty||0);
    if(v && !(parseFloat(v.value)>0)) v.value = Number(val.unit||0);
  });
}
function setEntregaImportada(valor, quantidadePedidos=0){
  document.getElementById('entregaPedidosView').dataset.valor = String(Number(valor||0));
  document.getElementById('entregaPedidosView').textContent = br(valor);
  document.getElementById('pedidosImportadosView').textContent = String(quantidadePedidos || 0);
  document.getElementById('pedidosImportadosResumo').textContent = String(quantidadePedidos || 0);
}
function parsePedido(pedido, valor, codigos=''){
  const codeLines = parseCodes(codigos);
  if(codeLines.length){
    if(codeLines.length === 1){
      return mapCodeNameToKey(codeLines[0].nome, codeLines[0].quantidade, codeLines[0].valorUnitario);
    }
    return null;
  }
  const t = normalizeText(pedido);
  const matchQty = t.match(/^\s*(\d+)\s+/);
  const qty = matchQty ? parseInt(matchQty[1],10) : 1;
  if (t.includes('combo') && t.includes('500') && t.includes('300')) return {key:'combo_q_0', qty, unit: Number(valor||0)/qty};
  if (t.includes('pastel')) return {key:'pastel_q_0', qty, unit: Number(valor||0)/qty};
  if (t.includes('garrafa') && t.includes('300')) return {key:'garrafa_q_0', qty, unit: Number(valor||0)/qty};
  if (t.includes('garrafa') && t.includes('500')) return {key:'garrafa_q_1', qty, unit: Number(valor||0)/qty};
  if (t.includes('1l')) return {key:'bebida_q_1', qty, unit: Number(valor||0)/qty};
  if (t.includes('refri') || t.includes('coca') || t.includes('lata')) return {key:'bebida_q_0', qty, unit: Number(valor||0)/qty};
  if (t.includes('250')) return {key:'copo_q_0', qty, unit: Number(valor||0)/qty};
  if (t.includes('300')) return {key:'copo_q_1', qty, unit: Number(valor||0)/qty};
  if (t.includes('400')) return {key:'copo_q_2', qty, unit: Number(valor||0)/qty};
  if (t.includes('500')) return {key:'copo_q_3', qty, unit: Number(valor||0)/qty};
  if (t.includes('700')) return {key:'copo_q_4', qty, unit: Number(valor||0)/qty};
  return null;
}
function parseCodes(str){
  const raw = String(str || '').trim();
  if(!raw) return [];
  const parts = raw.split(/[+,;\n]+/).map(s => s.trim()).filter(Boolean);
  const lines = [];
  parts.forEach(part => {
    let m = part.match(/^(\d+)\s*(?:x|\*)\s*(\d+)$/i);
    let qty = 1, code = '';
    if(m){ qty = Number(m[1]); code = m[2]; }
    else if(/^\d+$/.test(part)){ code = part; }
    if(!code) return;
    const map = {
      '1': {nome:'Açaí 300ml', unit:14},
      '2': {nome:'Açaí 400ml', unit:16},
      '3': {nome:'Açaí 500ml', unit:18},
      '4': {nome:'Açaí 700ml', unit:26},
      '5': {nome:'Pastel', unit:10},
      '6': {nome:'Refri lata', unit:5},
      '7': {nome:'Refri litro', unit:10},
      '8': {nome:'Açaí garrafa 300ml', unit:14},
      '9': {nome:'Açaí garrafa 500ml', unit:18},
      '10': {nome:'Combo 500 + 300', unit:29},
      '11': {nome:'Açaí 250ml', unit:12},
      '12': {nome:'Pastel T', unit:10},
      '13': {nome:'Açaí promocional 300ml', unit:12},
      '14': {nome:'Açaí promocional 500ml', unit:16},
      '15': {nome:'Açaí promocional 700ml', unit:24}
    };
    if(!map[code]) return;
    lines.push({codigo: code, quantidade: qty, nome: map[code].nome, valorUnitario: map[code].unit});
  });
  return lines;
}
function mapCodeNameToKey(nome, qty, unit){
  const t = normalizeText(nome);
  if (t.includes('combo') && t.includes('500') && t.includes('300')) return {key:'combo_q_0', qty, unit};
  if (t.includes('pastel')) return {key:'pastel_q_0', qty, unit};
  if (t.includes('garrafa') && t.includes('300')) return {key:'garrafa_q_0', qty, unit};
  if (t.includes('garrafa') && t.includes('500')) return {key:'garrafa_q_1', qty, unit};
  if (t.includes('1l')) return {key:'bebida_q_1', qty, unit};
  if (t.includes('refri') || t.includes('coca') || t.includes('lata')) return {key:'bebida_q_0', qty, unit};
  if (t.includes('250')) return {key:'copo_q_0', qty, unit};
  if (t.includes('300')) return {key:'copo_q_1', qty, unit};
  if (t.includes('400')) return {key:'copo_q_2', qty, unit};
  if (t.includes('500')) return {key:'copo_q_3', qty, unit};
  if (t.includes('700')) return {key:'copo_q_4', qty, unit};
  return null;
}

async function syncPedidosPagos(){
  const dataIso = document.getElementById("data").value;
  if(!dataIso) return alert("Escolha uma data.");

  try{
    const docRef = doc(dbFS,"caixa_fechamentos",dataIso);
    const snap = await getDoc(docRef);
    const current = snap.exists() ? snap.data() : null;
    const oldSnapshot = current?.importedSnapshot || null;

    clearForm(true);

    if(current){
      fillGroup(current.produtos?.copo || [], "copo");
      fillGroup(current.produtos?.garrafa || [], "garrafa");
      fillGroup(current.produtos?.bebidas || [], "bebida");
      fillGroup(current.produtos?.pasteis || [], "pastel");
      fillGroup(current.produtos?.combos || [], "combo");
      fillMoneyGroup(current.estoqueCompras || [], "estoque");
      fillMoneyGroup(current.despesasOperacionais || current.despesas || [], "op");
      fillMoneyGroup(current.despesasPessoais || [], "pessoal");
      fillMoneyGroup(current.contas || [], "conta");
      setEntregaImportada(Number(current.totalEntregas || 0), Number(current.pedidosImportados || 0));
    }

    if(oldSnapshot) subtractSnapshot(oldSnapshot);

    const dataBr = isoToBr(dataIso);
    const pedidosSnap = await getDocs(query(collection(dbFS,'pedidos')));
    const ativos = pedidosSnap.docs
      .map(d => ({id:d.id, ...d.data()}))
      .filter(p => {
        if(p.deleted) return false;
        const ativo = ['Pago','Preparando','Entregue'].includes(p.status);
        if(!ativo) return false;
        const ehFiado = p.pagamento === 'Fiado' || p.fiado;
        if(ehFiado){
          return (p.recebidoEmISO || '') === dataIso;
        }
        return p.data === dataBr;
      });

    const newSnapshot = {};
    let encontrados = 0;
    let entregaTotal = 0;

    ativos.forEach(p => {
      entregaTotal += Number(p.entrega || 0);
      const itens = Array.isArray(p.itensCodigo) && p.itensCodigo.length ? p.itensCodigo : null;
      if(itens && itens.length){
        itens.forEach(item => {
          const mapped = mapCodeNameToKey(item.nome, Number(item.quantidade||0), Number(item.valorUnitario||0));
          if(mapped){
            encontrados++;
            if(!newSnapshot[mapped.key]) newSnapshot[mapped.key] = {qty:0, unit: mapped.unit};
            newSnapshot[mapped.key].qty += mapped.qty;
            if(!(newSnapshot[mapped.key].unit > 0)) newSnapshot[mapped.key].unit = mapped.unit;
          }
        });
      }else{
        const parsed = parsePedido(p.pedido, Number(p.valorProdutos || p.valor || 0), p.codigos || '');
        if(parsed){
          encontrados++;
          if(!newSnapshot[parsed.key]) newSnapshot[parsed.key] = {qty:0, unit: parsed.unit};
          newSnapshot[parsed.key].qty += parsed.qty;
          if(!(newSnapshot[parsed.key].unit > 0)) newSnapshot[parsed.key].unit = parsed.unit;
        }
      }
    });

    applySnapshot(newSnapshot);
    setEntregaImportada(entregaTotal, ativos.length);

    const resumo = calcularTudo();
    const payload = {
      data: dataIso,
      produtos: {
        copo: collectGroup(produtos.copo,"copo"),
        garrafa: collectGroup(produtos.garrafa,"garrafa"),
        bebidas: collectGroup(produtos.bebidas,"bebida"),
        pasteis: collectGroup(produtos.pasteis,"pastel"),
        combos: collectGroup(produtos.combos,"combo")
      },
      estoqueCompras: collectMoneyGroup(estoqueCompras,"estoque"),
      despesasOperacionais: collectMoneyGroup(operacional,"op"),
      despesasPessoais: collectMoneyGroup(pessoal,"pessoal"),
      despesas: collectMoneyGroup(operacional,"op"),
      contas: collectMoneyGroup(contas,"conta"),
      totalProdutos: resumo.totalProdutos,
      totalEntregas: resumo.totalEntregas,
      totalRecebido: resumo.totalRecebido,
      totalEstoque: resumo.totalEstoque,
      totalOperacional: resumo.totalOperacional,
      totalPessoal: resumo.totalPessoal,
      totalContas: resumo.totalContas,
      saldoDia: resumo.saldoDia,
      lucroOperacional: resumo.lucroOperacional,
      metaBatida: resumo.metaBatida,
      pedidosImportados: ativos.length,
      importedSnapshot: newSnapshot,
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, payload, {merge:true});
    cloudHistory[dataIso] = { ...(cloudHistory[dataIso]||{}), ...payload };
    renderHistorico();
    calcularTudo();

    if(encontrados === 0 && ativos.length === 0){
      alert("Nenhum pedido recebido encontrado nessa data para sincronizar.");
    } else {
      alert(`${ativos.length} pedido(s) sincronizado(s) com o caixa.`);
    }
  }catch(e){
    console.error(e);
    alert("Não foi possível sincronizar os pedidos pagos.");
  }
}

async function salvarFechamento(){
  const data=document.getElementById("data").value;
  if(!data) return alert("Escolha uma data.");
  const atual = (await getDoc(doc(dbFS,"caixa_fechamentos",data)));
  const importedSnapshot = atual.exists() ? (atual.data().importedSnapshot || {}) : {};
  const pedidosImportados = atual.exists() ? Number(atual.data().pedidosImportados || 0) : Number(document.getElementById('pedidosImportadosView').textContent || 0);
  const resumo = calcularTudo();
  const payload = {
    data,
    produtos:{
      copo:collectGroup(produtos.copo,"copo"),
      garrafa:collectGroup(produtos.garrafa,"garrafa"),
      bebidas:collectGroup(produtos.bebidas,"bebida"),
      pasteis:collectGroup(produtos.pasteis,"pastel"),
      combos:collectGroup(produtos.combos,"combo")
    },
    estoqueCompras: collectMoneyGroup(estoqueCompras,"estoque"),
    despesasOperacionais: collectMoneyGroup(operacional,"op"),
    despesasPessoais: collectMoneyGroup(pessoal,"pessoal"),
    despesas: collectMoneyGroup(operacional,"op"),
    contas: collectMoneyGroup(contas,"conta"),
    totalProdutos:resumo.totalProdutos,
    totalEntregas:resumo.totalEntregas,
    totalRecebido:resumo.totalRecebido,
    totalEstoque:resumo.totalEstoque,
    totalOperacional:resumo.totalOperacional,
    totalPessoal:resumo.totalPessoal,
    totalContas:resumo.totalContas,
    lucroOperacional:resumo.lucroOperacional,
    saldoDia:resumo.saldoDia,
    metaBatida:resumo.metaBatida,
    pedidosImportados,
    importedSnapshot, 
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(dbFS,"caixa_fechamentos",data), payload, {merge:true});
  cloudHistory[data] = { ...(cloudHistory[data]||{}), ...payload };
  renderHistorico(); calcularTudo(); alert("Fechamento salvo na nuvem.");
}
async function buscarPorData(){
  const data=document.getElementById("data").value;
  if(!data) return alert("Escolha uma data.");
  const snap = await getDoc(doc(dbFS,"caixa_fechamentos",data));
  if(!snap.exists()) return alert("Nenhum fechamento encontrado nessa data.");
  const item = snap.data();
  clearForm(true);
  fillGroup(item.produtos?.copo || [], "copo");
  fillGroup(item.produtos?.garrafa || [], "garrafa");
  fillGroup(item.produtos?.bebidas || [], "bebida");
  fillGroup(item.produtos?.pasteis || [], "pastel");
  fillGroup(item.produtos?.combos || [], "combo");
  fillMoneyGroup(item.estoqueCompras || [], "estoque");
  fillMoneyGroup(item.despesasOperacionais || item.despesas || [], "op");
  fillMoneyGroup(item.despesasPessoais || [], "pessoal");
  fillMoneyGroup(item.contas || [], "conta");
  setEntregaImportada(Number(item.totalEntregas || 0), Number(item.pedidosImportados || 0));
  calcularTudo();
}
async function loadCloudHistory(){
  const snap = await getDocs(collection(dbFS,"caixa_fechamentos"));
  cloudHistory = {};
  snap.forEach(d => { cloudHistory[d.id] = d.data(); });
  const latestMonth = getLatestHistoryMonth();
  document.getElementById("mesAtual").value = latestMonth;
  activeMonth = latestMonth;
  updateMonthInputs();
  const range = monthRange(latestMonth);
  document.getElementById("data").value = range.fim <= hojeISO() ? range.fim : hojeISO();
  renderHistorico();
  calcularTudo();
  calcularPeriodo();
}
async function abrirHistorico(data){
  document.getElementById("data").value = data;
  document.getElementById("mesAtual").value = data.slice(0,7);
  activeMonth = data.slice(0,7);
  updateMonthInputs();
  calcularPeriodo();
  await buscarPorData();
}
function renderHistorico(){
  const body = document.getElementById("historicoBody");
  const range = monthRange(selectedMonth());
  const keys = Object.keys(cloudHistory).filter(data => data >= range.inicio && data <= range.fim).sort().reverse();
  if(!keys.length){ body.innerHTML = `<tr><td colspan="8" class="empty">Nenhum fechamento salvo neste mês.</td></tr>`; return; }
  body.innerHTML = keys.map(data => {
    const item = cloudHistory[data];
    const recebido = Number(item.totalRecebido || item.totalVendido || 0);
    return `<tr><td>${isoToBr(data)}</td><td>${br(recebido)}</td><td>${br(item.totalEstoque || 0)}</td><td>${br(item.totalOperacional || item.totalDespesas || 0)}</td><td>${br(item.totalPessoal || 0)}</td><td>${br(item.totalContas || 0)}</td><td>${br(item.saldoDia)}</td><td><span style="color:var(--gold);cursor:pointer;text-decoration:underline" onclick="abrirHistorico('${data}')">Abrir</span></td></tr>`;
  }).join("");
}
function calcularPeriodo(){
  const ini=document.getElementById("periodoInicio").value;
  const fim=document.getElementById("periodoFim").value;
  if(!ini || !fim) return;
  const rows = Object.keys(cloudHistory).filter(d => d>=ini && d<=fim).sort();
  let recebido=0,est=0,op=0,pes=0,cont=0,saldo=0;
  rows.forEach(d=>{
    const item=cloudHistory[d];
    recebido += Number(item.totalRecebido || item.totalVendido || 0);
    est += Number(item.totalEstoque || 0);
    op += Number(item.totalOperacional || item.totalDespesas || 0);
    pes += Number(item.totalPessoal || 0);
    cont += Number(item.totalContas || 0);
    saldo += Number(item.saldoDia || 0);
  });
  document.getElementById("pVendido").textContent=br(recebido);
  document.getElementById("pEstoque").textContent=br(est);
  document.getElementById("pOperacional").textContent=br(op);
  document.getElementById("pPessoal").textContent=br(pes);
  document.getElementById("pContas").textContent=br(cont);
  document.getElementById("pSaldo").textContent=br(saldo);
}

async function resumoPagamentosDoDia(dataIso){
  const dataBr = isoToBr(dataIso);
  const base = {Pix:0, Dinheiro:0, Cartão:0, Outros:0, FiadoRecebido:0, quantidade:0};
  try{
    const snap = await getDocs(collection(dbFS,'pedidos'));
    snap.docs.map(d => ({id:d.id, ...d.data()})).forEach(p => {
      if(p.deleted) return;
      const ativo = ['Pago','Preparando','Entregue'].includes(p.status);
      if(!ativo) return;
      const ehFiado = p.pagamento === 'Fiado' || p.fiado;
      const total = Number(p.valorProdutos || p.valor || 0) + Number(p.entrega || 0);
      if(ehFiado){
        if((p.recebidoEmISO || '') !== dataIso) return;
        const forma = String(p.pagamentoRecebido || 'Outros').trim();
        if(forma === 'Pix') base.Pix += total;
        else if(forma === 'Dinheiro') base.Dinheiro += total;
        else if(forma === 'Cartão') base.Cartão += total;
        else base.Outros += total;
        base.FiadoRecebido += total;
        base.quantidade += 1;
      }else{
        if(p.data !== dataBr) return;
        const forma = String(p.pagamento || 'Outros').trim();
        if(forma === 'Pix') base.Pix += total;
        else if(forma === 'Dinheiro') base.Dinheiro += total;
        else if(forma === 'Cartão') base.Cartão += total;
        else base.Outros += total;
        base.quantidade += 1;
      }
    });
  }catch(e){
    console.error(e);
  }
  return base;
}
function reportRowsMoney(items){
  return (items || []).filter(i => Number(i.valor || 0) > 0).map(i => `
    <tr>
      <td>${i.nome}</td>
      <td class="num">${br(i.valor)}</td>
    </tr>
  `).join('') || `<tr><td colspan="2">Sem lançamentos</td></tr>`;
}
function reportRowsProdutos(grupo){
  return (grupo || []).filter(i => Number(i.quantidade || 0) > 0 || Number(i.valor || 0) > 0).map(i => `
    <tr>
      <td>${i.nome}</td>
      <td class="num">${Number(i.quantidade || 0)}</td>
      <td class="num">${br(i.valor || 0)}</td>
      <td class="num">${br((Number(i.quantidade || 0) * Number(i.valor || 0)))}</td>
    </tr>
  `).join('') || `<tr><td colspan="4">Sem movimentação</td></tr>`;
}
async function gerarRelatorioDiario(){
  const data = document.getElementById("data").value;
  if(!data) return alert("Escolha uma data.");
  const snap = await getDoc(doc(dbFS,"caixa_fechamentos",data));
  const item = snap.exists() ? snap.data() : {
    data,
    produtos:{
      copo:collectGroup(produtos.copo,"copo"),
      garrafa:collectGroup(produtos.garrafa,"garrafa"),
      bebidas:collectGroup(produtos.bebidas,"bebida"),
      pasteis:collectGroup(produtos.pasteis,"pastel"),
      combos:collectGroup(produtos.combos,"combo")
    },
    estoqueCompras: collectMoneyGroup(estoqueCompras,"estoque"),
    despesasOperacionais: collectMoneyGroup(operacional,"op"),
    despesasPessoais: collectMoneyGroup(pessoal,"pessoal"),
    contas: collectMoneyGroup(contas,"conta"),
    ...calcularTudo()
  };
  const pagamentos = await resumoPagamentosDoDia(data);
  const html = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Relatório diário - ${isoToBr(data)}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#222;margin:24px;background:#fff}
      h1,h2{margin:0 0 10px}
      .muted{color:#666}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0 22px}
      .box{border:1px solid #ddd;border-radius:12px;padding:14px}
      table{width:100%;border-collapse:collapse;margin:8px 0 18px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f7f7f7}
      .num{text-align:right}
      .section{margin-top:18px}
      .footer{margin-top:24px;font-size:12px;color:#666}
      @media print{ body{margin:10mm} .no-print{display:none} }
    </style>
  </head>
  <body>
    <h1>Relatório diário de caixa</h1>
    <div class="muted">Data: ${isoToBr(data)} • Fechamento organizado para conferência interna e impressão</div>

    <div class="grid">
      <div class="box"><b>Produtos vendidos</b><br>${br(item.totalProdutos || 0)}</div>
      <div class="box"><b>Entregas</b><br>${br(item.totalEntregas || 0)}</div>
      <div class="box"><b>Total recebido</b><br>${br(item.totalRecebido || 0)}</div>
      <div class="box"><b>Compra de estoque</b><br>${br(item.totalEstoque || 0)}</div>
      <div class="box"><b>Operacional</b><br>${br(item.totalOperacional || 0)}</div>
      <div class="box"><b>Pessoal</b><br>${br(item.totalPessoal || 0)}</div>
      <div class="box"><b>Contas fixas</b><br>${br(item.totalContas || 0)}</div>
      <div class="box"><b>Lucro operacional</b><br>${br(item.lucroOperacional || 0)}</div>
      <div class="box"><b>Saldo do dia</b><br>${br(item.saldoDia || 0)}</div>
    </div>

    <div class="section">
      <h2>Recebimentos por forma</h2>
      <table>
        <thead><tr><th>Forma</th><th class="num">Valor</th></tr></thead>
        <tbody>
          <tr><td>Pix</td><td class="num">${br(pagamentos.Pix)}</td></tr>
          <tr><td>Dinheiro</td><td class="num">${br(pagamentos.Dinheiro)}</td></tr>
          <tr><td>Cartão</td><td class="num">${br(pagamentos.Cartão)}</td></tr>
          <tr><td>Outros</td><td class="num">${br(pagamentos.Outros)}</td></tr>
          <tr><td><b>Fiado recebido no dia</b></td><td class="num"><b>${br(pagamentos.FiadoRecebido)}</b></td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Produtos vendidos</h2>
      <h3>Açaí no copo</h3>
      <table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>${reportRowsProdutos(item.produtos?.copo)}</tbody></table>
      <h3>Açaí na garrafa</h3>
      <table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>${reportRowsProdutos(item.produtos?.garrafa)}</tbody></table>
      <h3>Bebidas</h3>
      <table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>${reportRowsProdutos(item.produtos?.bebidas)}</tbody></table>
      <h3>Pastéis</h3>
      <table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>${reportRowsProdutos(item.produtos?.pasteis)}</tbody></table>
      <h3>Combos</h3>
      <table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>${reportRowsProdutos(item.produtos?.combos)}</tbody></table>
    </div>

    <div class="section">
      <h2>Saídas separadas</h2>
      <h3>Compras de estoque</h3>
      <table><thead><tr><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>${reportRowsMoney(item.estoqueCompras)}</tbody></table>
      <h3>Despesas operacionais</h3>
      <table><thead><tr><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>${reportRowsMoney(item.despesasOperacionais || item.despesas)}</tbody></table>
      <h3>Despesas pessoais</h3>
      <table><thead><tr><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>${reportRowsMoney(item.despesasPessoais)}</tbody></table>
      <h3>Contas fixas do negócio</h3>
      <table><thead><tr><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>${reportRowsMoney(item.contas)}</tbody></table>
    </div>

    <div class="footer">
      Relatório gerado em ${new Date().toLocaleString('pt-BR')}. Use este fechamento para conferência interna. Para exigências fiscais formais, confirme com seu contador.
    </div>
    <div class="no-print" style="margin-top:18px">
      <button onclick="window.print()">Imprimir / Salvar em PDF</button>
    </div>
  </body>
  </html>`;
  const w = window.open('', '_blank');
  if(!w) return alert('Seu navegador bloqueou a abertura do relatório. Libere pop-ups e tente novamente.');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

async function migrarHistoricoLocal(){
  const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || "{}");
  const datas = Object.keys(old);
  if(!datas.length) return alert("Nenhum histórico local encontrado neste aparelho.");
  for(const data of datas){ await setDoc(doc(dbFS,"caixa_fechamentos",data), old[data], {merge:true}); }
  await loadCloudHistory();
  alert(`${datas.length} fechamento(s) local(is) migrado(s) para a nuvem.`);
}

document.getElementById("syncBtn").addEventListener("click", syncPedidosPagos);
document.getElementById("salvarBtn").addEventListener("click", salvarFechamento);
document.getElementById("relatorioBtn").addEventListener("click", gerarRelatorioDiario);
document.getElementById("relatorioMensalBtn").addEventListener("click", gerarRelatorioMensal);
document.getElementById("fecharMesBtn").addEventListener("click", mudarMes);
document.getElementById("controleBtn")?.addEventListener("click", ()=> location.href = "controle.html");
document.getElementById("comprasBtn")?.addEventListener("click", ()=> location.href = "compras.html");
document.getElementById("centralFinBtn")?.addEventListener("click", ()=> location.href = "central-financeira.html");
document.getElementById("buscarBtn").addEventListener("click", buscarPorData);
document.getElementById("migrateBtn").addEventListener("click", migrarHistoricoLocal);
document.getElementById("periodoBtn").addEventListener("click", calcularPeriodo);
window.abrirHistorico = abrirHistorico;
await loadConfig();
await loadCloudHistory();
document.getElementById("mesAtual").addEventListener("change", () => { activeMonth = document.getElementById("mesAtual").value; updateMonthInputs(); renderHistorico(); calcularPeriodo(); calcularTudo(); });
document.getElementById("data").addEventListener("change", async () => {
  const d = document.getElementById("data").value;
  if(!d) return;
  document.getElementById("mesAtual").value = d.slice(0,7);
  activeMonth = d.slice(0,7);
  updateMonthInputs();
  calcularPeriodo();
  const snap = await getDoc(doc(dbFS,"caixa_fechamentos",d));
  if(snap.exists()){
    await buscarPorData();
  }else{
    clearForm(true);
    renderHistorico();
  }
});
calcularPeriodo();
calcularTudo();



