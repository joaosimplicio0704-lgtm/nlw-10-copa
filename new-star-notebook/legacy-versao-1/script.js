// ==================== 1. GERENCIAMENTO DE ESTADO E BANCO LOCAL ====================
let dados = JSON.parse(localStorage.getItem('newStarData')) || {
    servicos: [],
    telefones: [],
    financeiro: [],
    pecas: [],
    osProntas: [],
    notebooksLoja: []
};

if (!dados.notebooksLoja) {
    dados.notebooksLoja = [];
}

function salvarBanco() {
    localStorage.setItem('newStarData', JSON.stringify(dados));
}

// Carrega os dados do servidor SQLite se disponível sem travar o LocalStorage
async function carregarDadosServidor() {
    try {
        const res = await fetch('/api/dados');
        if (res.ok) {
            const dataServidor = await res.json();
            if (dataServidor.notebooksLoja && dataServidor.notebooksLoja.length > 0) {
                dados.notebooksLoja = dataServidor.notebooksLoja;
                salvarBanco();
            }
        }
    } catch (err) {
        console.log("Modo offline ou sem servidor Node rodando. Usando LocalStorage.");
    }
    renderizarTabelas();
}

// ==================== 2. CONTROLE DE ABAS ====================
function switchTab(evt, tabName) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const targetContent = document.getElementById(tabName);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    } else {
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabName)) {
                btn.classList.add('active');
            }
        });
    }
}

// ==================== 3. UTILITÁRIOS (DATAS E STATUS) ====================
function obterClasseStatus(status, dataEntrada) {
    if (status === 'Em andamento' && dataEntrada) {
        const hoje = new Date();
        const entrada = new Date(dataEntrada);
        const diffDias = Math.ceil((hoje - entrada) / (1000 * 60 * 60 * 24));
        if (diffDias > 5) return 'badge-alerta';
    }
    switch(status) {
        case 'Em andamento': return 'badge-em-andamento';
        case 'Pronto': return 'badge-pronto';
        case 'Entregue': return 'badge-entregue';
        case 'DEVENDO': return 'badge-devendo';
        case 'PAGO': return 'badge-pago';
        case 'Devolvido': return 'badge-pago';
        case 'Não devolvido': return 'badge-devendo';
        default: return 'badge-em-andamento';
    }
}

function formatarData(dataString) {
    if (!dataString) return '-';
    const partes = dataString.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataString;
}

// ==================== 4. RENDERIZAÇÃO DE TABELAS ====================
function renderizarTabelas() {
    // 4.1. Serviços
    const tbodyServicos = document.getElementById('tabela-servicos-body');
    if (tbodyServicos) {
        tbodyServicos.innerHTML = '';
        dados.servicos.forEach((s, index) => {
            const classeStatus = obterClasseStatus(s.status, s.data);
            const avisoAtraso = classeStatus === 'badge-alerta' ? ' ⚠️ Atrasado' : '';
            tbodyServicos.innerHTML += `
                <tr>
                    <td>${s.nome}</td>
                    <td>${s.num}</td>
                    <td>
                        <span class="badge ${classeStatus}" onclick="ativarEdicaoStatus(${index}, this)">${s.status}${avisoAtraso}</span>
                    </td>
                    <td>${s.notebook}</td>
                    <td>${s.cfont}</td>
                    <td>${s.cmaleta || 'Não'}</td>
                    <td>${formatarData(s.data)}</td>
                    <td>${s.desc || '-'}</td>
                    <td onclick="ativarEdicaoLocal(${index}, this)" style="cursor: pointer; background-color: #f8fafc;">${s.local || '-'}</td>
                    <td style="display: flex; gap: 5px;">
                        <button class="btn-success" onclick="abrirOSClienteLoja(${index})">OS</button>
                        <button class="btn-danger" onclick="removerItem('servicos', ${index})">Excluir</button>
                    </td>
                </tr>`;
        });
    }

    // 4.2. Telefones
    const tbodyTelefones = document.getElementById('tabela-telefones-body');
    if (tbodyTelefones) {
        tbodyTelefones.innerHTML = '';
        dados.telefones.forEach((t, index) => {
            tbodyTelefones.innerHTML += `
                <tr>
                    <td>${t.nome}</td><td>${t.tel1}</td><td>${t.tel2}</td>
                    <td><button class="btn-danger" onclick="removerItem('telefones', ${index})">Excluir</button></td>
                </tr>`;
        });
    }

    // 4.3. Financeiro & Dashboard
    const tbodyFinanceiro = document.getElementById('tabela-financeiro-body');
    if (tbodyFinanceiro) {
        tbodyFinanceiro.innerHTML = '';
        let totalDevendo = 0;
        let totalPago = 0;

        dados.financeiro.forEach((f, index) => {
            const valNum = parseFloat(f.valor) || 0;
            if (f.status === 'DEVENDO') totalDevendo += valNum;
            if (f.status === 'PAGO') totalPago += valNum;

            tbodyFinanceiro.innerHTML += `
                <tr>
                    <td>${f.nome}</td>
                    <td>
                        <span class="badge ${obterClasseStatus(f.status)}" onclick="ativarEdicaoStatusFinanceiro(${index}, this)">${f.status}</span>
                    </td>
                    <td>R$ ${valNum.toFixed(2)}</td>
                    <td>${f.notebook}</td>
                    <td>${f.referente}</td>
                    <td><button class="btn-danger" onclick="removerItem('financeiro', ${index})">Excluir</button></td>
                </tr>`;
        });

        const devElem = document.getElementById('total-devendo');
        const pagElem = document.getElementById('total-pago');
        if (devElem) devElem.innerText = `R$ ${totalDevendo.toFixed(2)}`;
        if (pagElem) pagElem.innerText = `R$ ${totalPago.toFixed(2)}`;
    }

    // 4.4. Peças
    const tbodyPecas = document.getElementById('tabela-pecas-body');
    if (tbodyPecas) {
        tbodyPecas.innerHTML = '';
        dados.pecas.forEach((p, index) => {
            tbodyPecas.innerHTML += `
                <tr>
                    <td>${p.cliente}</td>
                    <td>${p.item}</td>
                    <td>${formatarData(p.data)}</td>
                    <td>
                        <span class="badge ${obterClasseStatus(p.status)}" onclick="ativarEdicaoStatusPeca(${index}, this)">${p.status}</span>
                    </td>
                    <td><button class="btn-danger" onclick="removerItem('pecas', ${index})">Excluir</button></td>
                </tr>`;
        });
    }

    // 4.5. OS Prontas
    renderizarOSProntas();

    // 4.6. Notebooks Loja
    renderizarNotebooksLoja();
}

function renderizarOSProntas() {
    const tbodyOS = document.getElementById('tabela-os-prontas-body');
    if (tbodyOS) {
        tbodyOS.innerHTML = '';
        dados.osProntas.forEach((os, index) => {
            tbodyOS.innerHTML += `
                <tr>
                    <td>${os.cliente}</td>
                    <td>${os.numero}</td>
                    <td>${os.equipamento}</td>
                    <td>${formatarData(os.data)}</td>
                    <td>${os.detalhes ? os.detalhes.servicoExec || '-' : '-'}</td>
                    <td>${os.detalhes ? os.detalhes.itens || '-' : '-'}</td>
                    <td style="display: flex; gap: 5px;">
                        <button class="btn-success" onclick="carregarEBaixarPDF(${index})">📥 PDF</button>
                        <button class="btn-primary" onclick="visualizarOS(${index})">👁️ Ver</button>
                        <button class="btn-danger" onclick="removerItem('osProntas', ${index})">Excluir</button>
                    </td>
                </tr>`;
        });
    }
}

function renderizarNotebooksLoja() {
    const tbodyNB = document.getElementById('tabela-notebooks-body');
    const tbodyRelatorio = document.getElementById('tabela-relatorio-estoque-body');

    if (tbodyNB) {
        tbodyNB.innerHTML = '';
        dados.notebooksLoja.forEach((nb, index) => {
            let armaz = [nb.nvme ? `NVME: ${nb.nvme}` : '', nb.ssd ? `SSD: ${nb.ssd}` : ''].filter(Boolean).join(' / ') || '-';
            tbodyNB.innerHTML += `
                <tr>
                    <td><strong>${nb.notebook}</strong></td>
                    <td>${nb.modelo}</td>
                    <td>${nb.processador}</td>
                    <td>${nb.memoria}</td>
                    <td>${armaz}</td>
                    <td>${nb.preco || '-'}</td>
                    <td class="no-print" style="display: flex; gap: 5px;">
                        <button class="btn-primary" onclick="editarNotebookLoja(${index})">✏️ Editar</button>
                        <button class="btn-success" onclick="imprimirEtiquetaNotebook(${index})">🖨️ Cartão</button>
                        <button class="btn-danger" onclick="removerItem('notebooksLoja', ${index})">Excluir</button>
                    </td>
                </tr>`;
        });
    }

    if (tbodyRelatorio) {
        tbodyRelatorio.innerHTML = '';
        dados.notebooksLoja.forEach((nb) => {
            let armaz = [nb.nvme ? `NVME: ${nb.nvme}` : '', nb.ssd ? `SSD: ${nb.ssd}` : ''].filter(Boolean).join(' / ') || '-';
            tbodyRelatorio.innerHTML += `
                <tr>
                    <td style="border: 1px solid #000; padding: 6px;"><strong>${nb.notebook}</strong></td>
                    <td style="border: 1px solid #000; padding: 6px;">${nb.modelo}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${nb.processador}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${nb.memoria}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${nb.tela || '-'}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${armaz}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${nb.preco || '-'}</td>
                </tr>`;
        });
    }
}

// ==================== 5. OS CLIENTES LOJA ====================
function abrirOSClienteLoja(index) {
    const s = dados.servicos[index];
    if (!s) return;

    document.getElementById('form-os-cliente-loja').reset();

    document.getElementById('oscl-nome').value = s.nome || '';
    document.getElementById('oscl-num').value = s.num || '';
    document.getElementById('oscl-status').value = s.status || 'Em andamento';
    document.getElementById('oscl-notebook').value = s.notebook || '';
    document.getElementById('oscl-cfont').value = s.cfont || 'Sim';
    document.getElementById('oscl-cmaleta').value = s.cmaleta || 'Não';
    document.getElementById('oscl-desc').value = s.desc || '';
    document.getElementById('oscl-data').value = s.data || '';
    document.getElementById('oscl-local').value = s.local || '';

    const contatoEncontrado = dados.telefones.find(t => 
        t.nome.toLowerCase().trim() === (s.nome || '').toLowerCase().trim()
    );

    if (contatoEncontrado) {
        document.getElementById('oscl-telefone').value = contatoEncontrado.tel1 || contatoEncontrado.tel2 || '';
    } else {
        document.getElementById('oscl-telefone').value = '';
    }

    switchTab(null, 'os-clientes-loja');
}

function imprimirOSClienteLoja() {
    document.body.classList.add('imprimindo-os-cliente');
    window.print();
    document.body.classList.remove('imprimindo-os-cliente');
}

// ==================== 6. GERADOR DE NOTEBOOKS LOJA & IMPRESSÃO ====================
function salvarNotebookLoja(e) {
    e.preventDefault();
    const indexInput = document.getElementById('nb-index');
    const index = parseInt(indexInput ? indexInput.value : '-1');

    const notebookItem = {
        notebook: document.getElementById('nb-notebook').value,
        modelo: document.getElementById('nb-modelo').value,
        processador: document.getElementById('nb-processador').value,
        memoria: document.getElementById('nb-memoria').value,
        tela: document.getElementById('nb-tela').value,
        bateria: document.getElementById('nb-bateria').value,
        nvme: document.getElementById('nb-nvme').value,
        ssd: document.getElementById('nb-ssd').value,
        video: document.getElementById('nb-video').value,
        preco: document.getElementById('nb-preco').value
    };

    if (index >= 0 && index < dados.notebooksLoja.length) {
        const nbExistente = dados.notebooksLoja[index];
        dados.notebooksLoja[index] = { ...nbExistente, ...notebookItem };

        if (nbExistente && nbExistente.id) {
            fetch(`/api/notebooks_loja/${nbExistente.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notebookItem)
            }).catch(err => console.log("Salvo localmente."));
        }
    } else {
        dados.notebooksLoja.push(notebookItem);

        fetch('/api/notebooks_loja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notebookItem)
        })
        .then(res => res.json())
        .then(resData => {
            if (resData && resData.id) {
                notebookItem.id = resData.id;
                salvarBanco();
            }
        })
        .catch(err => console.log("Salvo localmente."));
    }

    salvarBanco();
    cancelarEdicaoNotebook();
    renderizarTabelas();
}

function editarNotebookLoja(index) {
    const nb = dados.notebooksLoja[index];
    if (!nb) return;

    document.getElementById('nb-index').value = index;
    document.getElementById('nb-notebook').value = nb.notebook || '';
    document.getElementById('nb-modelo').value = nb.modelo || '';
    document.getElementById('nb-processador').value = nb.processador || '';
    document.getElementById('nb-memoria').value = nb.memoria || '';
    document.getElementById('nb-tela').value = nb.tela || '';
    document.getElementById('nb-bateria').value = nb.bateria || '';
    document.getElementById('nb-nvme').value = nb.nvme || '';
    document.getElementById('nb-ssd').value = nb.ssd || '';
    document.getElementById('nb-video').value = nb.video || '';
    document.getElementById('nb-preco').value = nb.preco || '';

    document.getElementById('titulo-form-notebook').innerText = 'Editar Notebook da Loja';
    document.getElementById('btn-salvar-nb').innerText = 'Atualizar Notebook';
    document.getElementById('btn-cancelar-nb').style.display = 'inline-block';
}

function cancelarEdicaoNotebook() {
    document.getElementById('form-notebooks-loja').reset();
    document.getElementById('nb-index').value = '-1';
    document.getElementById('titulo-form-notebook').innerText = 'Cadastrar Notebook para Loja';
    document.getElementById('btn-salvar-nb').innerText = 'Salvar Notebook';
    document.getElementById('btn-cancelar-nb').style.display = 'none';
}

function imprimirEtiquetaNotebook(index) {
    const nb = dados.notebooksLoja[index];
    if (!nb) return;

    const areaImp = document.getElementById('area-impressao-etiqueta');

    const svgIcone = `
        <svg class="icon-laptop" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
            <rect x="25" y="8" width="150" height="85" rx="6" ry="6" fill="none" stroke="#000000" stroke-width="8"/>
            <rect x="35" y="16" width="130" height="68" fill="#ffffff"/>
            <path d="M 5 102 L 195 102 C 198 102 200 104 198 108 L 188 116 C 186 118 180 119 175 119 L 25 119 C 20 119 14 118 12 116 L 2 108 C 0 104 2 102 5 102 Z" fill="#000000"/>
            <path d="M 80 102 L 120 102 L 115 109 L 85 109 Z" fill="#ffffff"/>
        </svg>
    `;

    let armazText = '';
    if (nb.nvme && nb.ssd) armazText = `NVME/SSD ${nb.nvme} + ${nb.ssd}`;
    else if (nb.nvme) armazText = nb.nvme.toUpperCase().includes('NVME') ? nb.nvme : `NVME ${nb.nvme}`;
    else if (nb.ssd) armazText = nb.ssd.toUpperCase().includes('SSD') ? nb.ssd : `SSD ${nb.ssd}`;

    let htmlEtiqueta = `
        <div class="etiqueta-card">
            ${svgIcone}
            <div class="titulo-config">configurações</div>
            <div class="linha-item">${nb.notebook} ${nb.modelo ? nb.modelo : ''}</div>
            ${nb.processador ? `<div class="linha-item">${nb.processador}</div>` : ''}
            ${nb.memoria ? `<div class="linha-item">${nb.memoria.toUpperCase().includes('RAM') ? nb.memoria : nb.memoria + ' RAM'}</div>` : ''}
            ${armazText ? `<div class="linha-item">${armazText}</div>` : ''}
            ${nb.tela ? `<div class="linha-item">TELA ${nb.tela}</div>` : ''}
            ${nb.bateria ? `<div class="linha-item">BATERIA ${nb.bateria}</div>` : ''}
            ${nb.video ? `<div class="linha-item">${nb.video}</div>` : ''}
            ${nb.preco ? `<div class="linha-preco">${nb.preco}</div>` : ''}
        </div>
    `;

    areaImp.innerHTML = htmlEtiqueta;

    document.body.classList.add('imprimindo-etiqueta');
    window.print();
    document.body.classList.remove('imprimindo-etiqueta');
}

function imprimirListaEstoqueLoja() {
    renderizarNotebooksLoja();
    document.body.classList.add('imprimindo-relatorio-estoque');
    window.print();
    document.body.classList.remove('imprimindo-relatorio-estoque');
}

// ==================== 7. GERADOR DE PDF E OS ====================
function salvarEBaixarPDFOS() {
    const numOS = document.getElementById('os-numero').value;
    const cliente = document.getElementById('os-cliente-nome').value;

    if (!numOS || !cliente) {
        alert('Preencha pelo menos o Número da OS e o Nome do Cliente!');
        return;
    }

    const novaOS = {
        numero: numOS,
        cliente: cliente,
        equipamento: document.getElementById('os-equipamento').value,
        data: document.getElementById('os-data-entrada').value,
        detalhes: {
            prestadorNome: document.getElementById('os-prestador-nome').value,
            prestadorDoc: document.getElementById('os-prestador-doc').value,
            prestadorTel: document.getElementById('os-prestador-tel').value,
            prestadorEmail: document.getElementById('os-prestador-email').value,
            clienteTel: document.getElementById('os-cliente-tel').value,
            clienteEnd: document.getElementById('os-cliente-end').value,
            dataPrevisao: document.getElementById('os-data-previsao').value,
            garantia: document.getElementById('os-garantia').value,
            problema: document.getElementById('os-problema').value,
            servicoExec: document.getElementById('os-servico-exec').value,
            itens: document.getElementById('os-itens').value,
            obs: document.getElementById('os-obs').value
        }
    };

    dados.osProntas.push(novaOS);
    salvarBanco();
    renderizarTabelas();

    gerarPDF(cliente, numOS);
}

function gerarPDF(cliente, numOS) {
    const elemento = document.getElementById('area-impressao-os');
    const opcoes = {
        margin: 10,
        filename: `OS_${numOS}_${cliente.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opcoes).from(elemento).save();
}

function carregarEBaixarPDF(index) {
    visualizarOS(index);
    setTimeout(() => {
        const os = dados.osProntas[index];
        gerarPDF(os.cliente, os.numero);
    }, 400);
}

function visualizarOS(index) {
    const os = dados.osProntas[index];
    if (!os) return;

    document.getElementById('os-numero').value = os.numero || '';
    document.getElementById('os-cliente-nome').value = os.cliente || '';
    document.getElementById('os-equipamento').value = os.equipamento || '';
    document.getElementById('os-data-entrada').value = os.data || '';

    if (os.detalhes) {
        document.getElementById('os-prestador-nome').value = os.detalhes.prestadorNome || '';
        document.getElementById('os-prestador-doc').value = os.detalhes.prestadorDoc || '';
        document.getElementById('os-prestador-tel').value = os.detalhes.prestadorTel || '';
        document.getElementById('os-prestador-email').value = os.detalhes.prestadorEmail || '';
        document.getElementById('os-cliente-tel').value = os.detalhes.clienteTel || '';
        document.getElementById('os-cliente-end').value = os.detalhes.clienteEnd || '';
        document.getElementById('os-data-previsao').value = os.detalhes.dataPrevisao || '';
        document.getElementById('os-garantia').value = os.detalhes.garantia || '30 dias';
        document.getElementById('os-problema').value = os.detalhes.problema || '';
        document.getElementById('os-servico-exec').value = os.detalhes.servicoExec || '';
        document.getElementById('os-itens').value = os.detalhes.itens || '';
        document.getElementById('os-obs').value = os.detalhes.obs || '';
    }

    switchTab(null, 'gerador-os');
}

// ==================== 8. FILTROS DE PESQUISA ====================
function filtrarServicos() {
    const termo = document.getElementById('busca-servicos').value.toLowerCase();
    const linhas = document.querySelectorAll('#tabela-servicos-body tr');
    linhas.forEach(linha => {
        const texto = linha.innerText.toLowerCase();
        linha.style.display = texto.includes(termo) ? '' : 'none';
    });
}

function filtrarOSProntas() {
    const termo = document.getElementById('busca-os').value.toLowerCase();
    const linhas = document.querySelectorAll('#tabela-os-prontas-body tr');
    linhas.forEach(linha => {
        const texto = linha.innerText.toLowerCase();
        linha.style.display = texto.includes(termo) ? '' : 'none';
    });
}

function filtrarNotebooksLoja() {
    const termo = document.getElementById('busca-notebooks').value.toLowerCase();
    const linhas = document.querySelectorAll('#tabela-notebooks-body tr');
    linhas.forEach(linha => {
        const texto = linha.innerText.toLowerCase();
        linha.style.display = texto.includes(termo) ? '' : 'none';
    });
}

// ==================== 9. EDIÇÕES RÁPIDAS NA TABELA ====================
function ativarEdicaoStatus(index, elemento) {
    const statusAtual = dados.servicos[index].status;
    elemento.outerHTML = `
        <select class="status-select" onchange="atualizarStatus(${index}, this.value)">
            <option value="Em andamento" ${statusAtual === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
            <option value="Pronto" ${statusAtual === 'Pronto' ? 'selected' : ''}>Pronto</option>
            <option value="Entregue" ${statusAtual === 'Entregue' ? 'selected' : ''}>Entregue</option>
        </select>
    `;
}
function atualizarStatus(index, novoStatus) {
    dados.servicos[index].status = novoStatus;
    salvarBanco();
    renderizarTabelas();
}

function ativarEdicaoLocal(index, elemento) {
    const localAtual = dados.servicos[index].local || '';
    elemento.innerHTML = `<input type="text" id="input-local-${index}" value="${localAtual}" style="width: 100%; padding: 4px;" onblur="salvarLocal(${index}, this.value)" onkeypress="if(event.key === 'Enter') this.blur();">`;
    const input = document.getElementById(`input-local-${index}`);
    if (input) {
        input.focus();
        input.select();
    }
}
function salvarLocal(index, novoLocal) {
    dados.servicos[index].local = novoLocal;
    salvarBanco();
    renderizarTabelas();
}

function ativarEdicaoStatusFinanceiro(index, elemento) {
    const statusAtual = dados.financeiro[index].status;
    elemento.outerHTML = `
        <select class="status-select" onchange="atualizarStatusFinanceiro(${index}, this.value)">
            <option value="DEVENDO" ${statusAtual === 'DEVENDO' ? 'selected' : ''}>DEVENDO</option>
            <option value="PAGO" ${statusAtual === 'PAGO' ? 'selected' : ''}>PAGO</option>
        </select>
    `;
}
function atualizarStatusFinanceiro(index, novoStatus) {
    dados.financeiro[index].status = novoStatus;
    salvarBanco();
    renderizarTabelas();
}

function ativarEdicaoStatusPeca(index, elemento) {
    const statusAtual = dados.pecas[index].status;
    elemento.outerHTML = `
        <select class="status-select" onchange="atualizarStatusPeca(${index}, this.value)">
            <option value="Não devolvido" ${statusAtual === 'Não devolvido' ? 'selected' : ''}>Não devolvido</option>
            <option value="Devolvido" ${statusAtual === 'Devolvido' ? 'selected' : ''}>Devolvido</option>
        </select>
    `;
}
function atualizarStatusPeca(index, novoStatus) {
    dados.pecas[index].status = novoStatus;
    salvarBanco();
    renderizarTabelas();
}

// ==================== 10. CADASTRO E EXCLUSÃO GERAL ====================
function adicionarItem(e, tipo) {
    e.preventDefault();
    if (tipo === 'servicos') {
        dados.servicos.push({
            nome: document.getElementById('srv-nome').value,
            num: document.getElementById('srv-num').value,
            status: document.getElementById('srv-status').value,
            notebook: document.getElementById('srv-notebook').value,
            cfont: document.getElementById('srv-cfont').value,
            cmaleta: document.getElementById('srv-cmaleta').value,
            desc: document.getElementById('srv-desc').value,
            data: document.getElementById('srv-data').value,
            local: document.getElementById('srv-local').value
        });
        document.getElementById('form-servico').reset();
    } else if (tipo === 'telefones') {
        dados.telefones.push({
            nome: document.getElementById('tel-nome').value,
            tel1: document.getElementById('tel-1').value,
            tel2: document.getElementById('tel-2').value || '-'
        });
        document.getElementById('form-telefone').reset();
    } else if (tipo === 'financeiro') {
        dados.financeiro.push({
            nome: document.getElementById('fin-nome').value,
            status: document.getElementById('fin-status').value,
            valor: document.getElementById('fin-valor').value,
            notebook: document.getElementById('fin-notebook').value,
            referente: document.getElementById('fin-referente').value
        });
        document.getElementById('form-financeiro').reset();
    } else if (tipo === 'pecas') {
        dados.pecas.push({
            cliente: document.getElementById('pec-cliente').value,
            item: document.getElementById('pec-item').value,
            data: document.getElementById('pec-data').value,
            status: document.getElementById('pec-status').value
        });
        document.getElementById('form-pecas').reset();
    }

    salvarBanco();
    renderizarTabelas();
}

function removerItem(tipo, index) {
    if (confirm('Deseja realmente excluir este item?')) {
        const itemRemovido = dados[tipo][index];
        dados[tipo].splice(index, 1);
        salvarBanco();

        if (tipo === 'notebooksLoja' && itemRemovido && itemRemovido.id) {
            fetch(`/api/notebooks_loja/${itemRemovido.id}`, { method: 'DELETE' }).catch(err => {});
        }

        renderizarTabelas();
    }
}

// Inicialização ao carregar a página
carregarDadosServidor();