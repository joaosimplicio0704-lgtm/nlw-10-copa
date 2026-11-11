# Build — assistente local de programação

A Build é uma interface de trabalho para desenvolver com IA: converse em português, peça ajuda para planejar e gerar código, acompanhe o arquivo no editor e abra uma prévia HTML isolada no navegador. O projeto é leve e roda no seu computador, sem conta ou chave de API.

## Executar no computador

1. Instale o [Ollama](https://ollama.com/download) para Windows, macOS ou Linux.
2. Baixe o modelo de programação (aprox. 4,7 GB):
   ```bash
   ollama pull qwen2.5-coder:7b
   ```
3. Inicie o Ollama (normalmente ele fica em execução em segundo plano).
4. Abra `index.html` no navegador. Se o navegador bloquear a conexão local ao abrir um arquivo, rode um servidor simples nesta pasta:
   ```bash
   python -m http.server 8000
   ```
   Acesse `http://localhost:8000`.
5. Clique em **Configurar conexão** para ver as instruções e peça à Build para criar uma página. Use **Executar** para abrir a prévia.

A interface chama a API do Ollama em `http://localhost:11434`. O modelo e os arquivos ficam no seu computador. A prévia é renderizada em um iframe com sandbox; o app **não executa comandos arbitrários no terminal nem altera arquivos do seu disco**. O editor da versão atual mostra o HTML gerado, e a execução serve para pré-visualizar esse HTML. Revise sempre o código produzido pela IA.

## Funcionalidades

- Interface responsiva com conversa, projeto, editor, prévia e terminal de status.
- Integração opcional com Ollama local e `qwen2.5-coder:7b`.
- Geração de páginas autocontidas em HTML a partir de pedidos em português.
- Prévia isolada no navegador; sem conexão local disponível, sugestões de demonstração informam o próximo passo.

## Tecnologias

HTML, CSS e JavaScript sem dependências de build. Basta servir os arquivos estáticos localmente.

## Licença

MIT. Consulte `LICENSE` (a adicionar antes de distribuição formal). Esta interface é uma implementação independente; a referência indicada pelo usuário inspirou a ideia geral de um espaço de desenvolvimento assistido por IA.
