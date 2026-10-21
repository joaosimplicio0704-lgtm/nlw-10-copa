const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa o Banco de Dados SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite com sucesso.');
    }
});

// Criação das Tabelas e do Sistema de Logs
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT, num TEXT, status TEXT, notebook TEXT, cfont TEXT, descricao TEXT, data TEXT, local TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS telefones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT, tel1 TEXT, tel2 TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS financeiro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT, status TEXT, valor TEXT, notebook TEXT, referente TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS pecas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT, item TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notebooks_loja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notebook TEXT, modelo TEXT, processador TEXT, memoria TEXT, tela TEXT, bateria TEXT, nvme TEXT, ssd TEXT, video TEXT, preco TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_hora TEXT,
        local_site TEXT,
        o_que_foi_alterado TEXT,
        o_que_saiu_da_lista TEXT
    )`);
});

// Função para gerar data e hora atual no formato exato brasileiro (DD/MM/YYYY HH:MM:SS)
function obterDataHoraAtual() {
    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${horas}:${minutos}:${segundos}`;
}

// Função auxiliar para registrar logs detalhados
function registrarLog(local, alteracao, saiu) {
    const dataHoraFormatada = obterDataHoraAtual();
    const stmt = db.prepare(`INSERT INTO logs (data_hora, local_site, o_que_foi_alterado, o_que_saiu_da_lista) VALUES (?, ?, ?, ?)`);
    stmt.run(dataHoraFormatada, local, alteracao, saiu || 'Nenhum item removido');
    stmt.finalize();
}

// --- ROTAS DA API ---

app.get('/api/dados', (req, res) => {
    db.serialize(() => {
        db.all("SELECT * FROM servicos", [], (err, servicos) => {
            db.all("SELECT * FROM telefones", [], (err, telefones) => {
                db.all("SELECT * FROM financeiro", [], (err, financeiro) => {
                    db.all("SELECT * FROM pecas", [], (err, pecas) => {
                        db.all("SELECT * FROM notebooks_loja", [], (err, notebooksLoja) => {
                            db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 100", [], (err, logs) => {
                                res.json({ servicos, telefones, financeiro, pecas, notebooksLoja, logs });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.post('/api/:tabela', (req, res) => {
    const tabela = req.params.tabela;
    const dados = req.body;
    let query = '';
    let params = [];
    let nomeTabelaLog = '';

    if (tabela === 'servicos') {
        query = `INSERT INTO servicos (nome, num, status, notebook, cfont, descricao, data, local) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        params = [dados.nome, dados.num, dados.status, dados.notebook, dados.cfont, dados.desc, dados.data, dados.local];
        nomeTabelaLog = 'Ordens de Serviço';
        registrarLog(nomeTabelaLog, `Cadastrou novo serviço para o cliente ${dados.nome} (OS nº ${dados.num})`, null);
    } else if (tabela === 'telefones') {
        query = `INSERT INTO telefones (nome, tel1, tel2) VALUES (?, ?, ?)`;
        params = [dados.nome, dados.tel1, dados.tel2];
        nomeTabelaLog = 'Contatos';
        registrarLog(nomeTabelaLog, `Adicionou o contato telefônico de ${dados.nome}`, null);
    } else if (tabela === 'financeiro') {
        query = `INSERT INTO financeiro (nome, status, valor, notebook, referente) VALUES (?, ?, ?, ?, ?)`;
        params = [dados.nome, dados.status, dados.valor, dados.notebook, dados.referente];
        nomeTabelaLog = 'Financeiro';
        registrarLog(nomeTabelaLog, `Adicionou lançamento para ${dados.nome} no valor de ${dados.valor}`, null);
    } else if (tabela === 'pecas') {
        query = `INSERT INTO pecas (cliente, item) VALUES (?, ?)`;
        params = [dados.cliente, dados.item];
        nomeTabelaLog = 'Peças e Fontes';
        registrarLog(nomeTabelaLog, `Cadastrou a peça/fonte "${dados.item}" para ${dados.cliente}`, null);
    } else if (tabela === 'notebooks_loja') {
        query = `INSERT INTO notebooks_loja (notebook, modelo, processador, memoria, tela, bateria, nvme, ssd, video, preco) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        params = [dados.notebook, dados.modelo, dados.processador, dados.memoria, dados.tela, dados.bateria, dados.nvme, dados.ssd, dados.video, dados.preco];
        nomeTabelaLog = 'Notebooks Loja';
        registrarLog(nomeTabelaLog, `Cadastrou o notebook "${dados.notebook} ${dados.modelo}" na loja`, null);
    } else {
        return res.status(400).json({ erro: 'Tabela inválida' });
    }

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ id: this.lastID, sucesso: true });
    });
});

app.put('/api/:tabela/:id', (req, res) => {
    const { tabela, id } = req.params;
    
    if (tabela === 'notebooks_loja') {
        const d = req.body;
        const query = `UPDATE notebooks_loja SET notebook=?, modelo=?, processador=?, memoria=?, tela=?, bateria=?, nvme=?, ssd=?, video=?, preco=? WHERE id=?`;
        const params = [d.notebook, d.modelo, d.processador, d.memoria, d.tela, d.bateria, d.nvme, d.ssd, d.video, d.preco, id];

        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ erro: err.message });
            registrarLog('Notebooks Loja', `Atualizou o notebook ID ${id}`, `Dados anteriores atualizados`);
            res.json({ sucesso: true });
        });
    } else {
        const { status } = req.body;
        const nomeLocal = tabela === 'servicos' ? 'Ordens de Serviço' : 'Financeiro';

        db.run(`UPDATE ${tabela} SET status = ? WHERE id = ?`, [status, id], function(err) {
            if (err) return res.status(500).json({ erro: err.message });
            registrarLog(nomeLocal, `Alterou o status do item ID ${id} para "${status}"`, `Status anterior substituído por atualização`);
            res.json({ sucesso: true });
        });
    }
});

app.delete('/api/:tabela/:id', (req, res) => {
    const { tabela, id } = req.params;
    const nomeLocal = tabela === 'servicos' ? 'Ordens de Serviço' : tabela === 'telefones' ? 'Contatos' : tabela === 'financeiro' ? 'Financeiro' : tabela === 'notebooks_loja' ? 'Notebooks Loja' : 'Peças e Fontes';

    db.get(`SELECT * FROM ${tabela} WHERE id = ?`, [id], (err, row) => {
        let descricaoItem = row ? JSON.stringify(row).replace(/["{}]/g, '').replace(/,/g, ' | ') : `ID ${id}`;

        db.run(`DELETE FROM ${tabela} WHERE id = ?`, [id], function(err) {
            if (err) return res.status(500).json({ erro: err.message });
            registrarLog(nomeLocal, `Excluiu um registro da lista`, `Saiu da lista: [ ${descricaoItem} ]`);
            res.json({ sucesso: true });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando perfeitamente em http://localhost:${PORT}`);
});