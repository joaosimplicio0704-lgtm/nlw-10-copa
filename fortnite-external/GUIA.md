# GUIA — como compilar e usar

Tudo que você precisa está em **um arquivo**: `fortnite_external_single.cpp`.
Ele traz o overlay, o leitor de memória (user mode) e os offsets da v43.00 embutidos.

**Não existe mais driver.** O programa é um external comum: `OpenProcess` +
`ReadProcessMemory` para ler, `SendInput` para o mouse, janela D3D9Ex por cima.
Nada é escrito na memória do jogo, nada é injetado.

---

## 0. Onde colocar as coisas

**Não** coloque o `.exe` dentro de
`C:\Program Files\Epic Games\Fortnite\FortniteGame\Binaries\Win64`.
Aquela pasta é do jogo: o updater da Epic pode limpar, e é justamente onde o
anti-cheat olha. A sua tool fica em qualquer pasta sua, por exemplo:

```
C:\tools\fn\
    fortnite_external_single.cpp
    fortnite_external.exe          <- sai do build
```

A tool não precisa de arquivo nenhum ao lado do jogo — ela abre o processo
`FortniteClient-Win64-Shipping.exe` de fora (é o que aparece na sua lista de
tarefas, PID 25184).

---

## 1. Compilar no Visual Studio (passo a passo)

Você tem duas opções. A **A** é a mais simples e usa o `.sln` que já está aqui.

### Opção A — abrir o `fortnite_external.sln` (recomendado)

1. Instale o **Visual Studio 2022** marcando a carga *Desenvolvimento para desktop com C++*.
   Se já instalou e não marcou, abra o **Visual Studio Installer** → *Modificar* → marque essa carga.
2. Copie a pasta `fortnite-external` inteira pro seu PC, por exemplo em `C:\tools\fn`.
   Dentro dela tem que estar:
   ```
   C:\tools\fn\fortnite_external_single.cpp
   C:\tools\fn\fortnite_external.vcxproj
   C:\tools\fn\fortnite_external.sln
   ```
3. Dê **duplo clique** em `fortnite_external.sln`. O Visual Studio abre.
4. Na barra do topo, troque as caixinhas de **Debug** para **Release** e de **x86/x64** para **x64**.
   (se aparecer "Any CPU", não serve — tem que ser **x64**.)
5. Menu **Compilar → Compilar Solução** (ou `Ctrl+Shift+B`).
6. Embaixo, na aba *Saída*, tem que terminar com:
   ```
   ========== Compilar: 1 com êxito, 0 com falha ==========
   ```
   O `.exe` sai em `C:\tools\fn\bin\x64\Release\fortnite_external.exe`.

### Opção B — criar o projeto na mão

Se não quiser usar o `.sln`, dá pra criar do zero (útil se for mexer muito no código):

1. Visual Studio → **Criar novo projeto** → **Aplicativo de Console** (C++) → *Avançar*.
2. Nome: `fortnite_external`. Marque **Colocar solução e projeto no mesmo diretório**.
3. Quando aparecer o `fortnite_external.cpp` gerado, **apague** ele (clique direito → *Remover* → *Excluir*).
4. Clique direito em **Arquivos de Origem** → *Adicionar* → *Item Existente…* → escolha
   `fortnite_external_single.cpp`.
5. Clique direito no **nome do projeto** (negrito no Solution Explorer) → *Propriedades*.
   Confira/corrija:
   - **Configuração:** `Todos as Configurações`
   - *Propriedades de Configuração → Avançado → Padrão da Linguagem C++*: **ISO C++17 (/std:c++17)**
   - *Propriedades de Configuração → Vinculador → Sistema → Subsistema*: **Console (/SUBSYSTEM:CONSOLE)**
   - *Propriedades de Configuração → Vinculador → Manifest Tool → Nível de Execução de UAC*: **requireAdministrator**
     (isso faz o `.exe` já pedir admin sozinho — é o que permite o `OpenProcess`)
   - *Propriedades de Configuração → C/C++ → Pré-processador → Definições de Pré-processador*:
     adicione `_CRT_SECURE_NO_WARNINGS`
6. **Compilar → Compilar Solução** (`Ctrl+Shift+B`).
7. Ache o `.exe`: clique direito no projeto → *Abrir Pasta em Explorador de Arquivos* →
   vá em `x64\Release\` (ou `Debug\`).

> Se der erro `C1010: fim de arquivo inesperado ao procurar cabeçalho pré-compilado`,
> é porque o projeto novo vem com `pch.h` ligado: em *Propriedades → C/C++ → Cabeçalhos Pré-compilados*,
> mude de **Usar** para **Não Usar Cabeçalhos Pré-compilados**.

### "Não é possível iniciar o programa ... bin\x64\Release\fortnite_external.exe"

Isso é **erro de compilação, não do programa**: o `MSB8020` logo acima da caixa
significa que o MSBuild não achou o compilador, então o `.exe` nunca foi gerado e o
Visual Studio reclama que não existe. Três saídas, da mais rápida pra mais completa:

1. **`build.bat`** — clique duas vezes. Ele acha o `vcvars64.bat`, compila e deixa o
   `fortnite_external.exe` **na pasta do projeto** (não em `bin\x64\Release`). Depois
   é só rodar `run.bat` (pede admin sozinho) ou o `.exe` como administrador.
2. **Abrir o projeto com o toolset certo** — botão direito no projeto →
   *Propriedades* → *Conjunto de Ferramentas da Plataforma*: escolha `Visual Studio 2022 (v143)`
   e confirme em *Diretórios de VC++* que `Ferramentas de Build do MSVC para x64/x86`
   aparece. O `.vcxproj` já vem com `<PlatformToolset>v143</PlatformToolset>` fixo,
   justamente pra não herdar um toolset que você não tem instalado.
3. **Instalar o compilador** — Visual Studio Installer → *Modificar* → marque
   *Desenvolvimento para desktop com C++* com o *MSVC v143*.

Depois de qualquer uma delas, confirme que o arquivo existe antes de rodar:

```
dir fortnite_external.exe
```

### Erro `MSB8020` (não é possível encontrar as ferramentas v143)

Três saídas, da mais rápida pra mais completa:

**1. Redirecionar (30 segundos).** No Solution Explorer, botão direito em cima da
**solução** `fortnite_external` (a linha de cima, com o ícone de solução) →
**Redirecionar Solução…** → escolhe a versão do toolset que aparecer na lista → OK → compila de novo.

**2. Instalar o toolset (melhor se for usar muito).** Visual Studio Installer →
*Modificar* → aba **Componentes individuais** → marca
**MSVC v143 – Ferramentas de build C++ x64/x86 da Versão mais Recente** → *Modificar*.
Depois recompila.

**3. Trocar o toolset no projeto, à mão.** Abre `fortnite_external.vcxproj` no
Bloco de Notas e troca as duas linhas `<PlatformToolset>v143</PlatformToolset>` por
`<PlatformToolset>$(DefaultPlatformToolset)</PlatformToolset>`. Assim ele usa o que
estiver instalado, seja 2022, 2019 ou o preview.
(o `.vcxproj` que veio no zip do repo novo já vem assim.)

### O erro `MSB8020` insiste mesmo depois de instalar o v143

O `.vcxproj` que veio do repo antigo **exigia** `v143` fixo. A versão nova do projeto
não tem mais essa linha: sem `PlatformToolset`, o VS/MSBuild usa o toolset mais novo
que estiver instalado, e o erro não tem como acontecer.

Se ainda estiver vendo `MSB8020`, você está com o `.vcxproj` antigo na pasta:

1. fecha o Visual Studio
2. baixa de novo `fortnite_external.vcxproj` (ou o zip novo) e **substitui** o arquivo
3. abre o `.sln` de novo
4. confere: no Bloco de Notas, o `.vcxproj` **não** deve ter nenhuma linha `PlatformToolset`

### Opção D — `build.bat` (sem Visual Studio aberto)

Na pasta tem um `build.bat`. Ele acha o `vcvars64.bat` do seu VS (2022/2019/2017,
qualquer edição), compila e deixa o `.exe` ao lado:

1. duplo clique em **`build.bat`**
2. se aparecer `[1/3] ... usando: C:\Program Files\...\vcvars64.bat` está no caminho certo
3. no fim: `[3/3] pronto: ...\fortnite_external.exe`

Se ele disser que não achou o Visual Studio, o componente C++ não está instalado
de verdade (Visual Studio Installer → Modificar → *Desenvolvimento para desktop com C++*).

### Opção C — linha de comando (sem IDE)

Menu Iniciar → **x64 Native Tools Command Prompt for VS 2022** (tem que ser esse, não o `cmd`):

```
cd C:\tools\fn
cl /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS fortnite_external_single.cpp /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe
```

---

## 2. Como executar (Windows)

Ordem de execução:

1. abre o Fortnite e **entra numa partida** (criativo/offline serve). O programa
   precisa de um pawn vivo pra descobrir se as posições são float ou double; no
   lobby ele fica com `layout: UNRESOLVED` e não mira nem desenha
2. clica com o botão direito no `fortnite_external.exe` → **Executar como administrador**
   (sem admin, o `OpenProcess` falha)
3. uma janela de console abre e escreve, e um **painel no canto da tela** mostra
   a mesma coisa com uma barra de progresso:

```
[*] fortnite external - user mode, no injection, no driver
[*] keys: INSERT menu, END unload, aim key HELD to aim
[*] waiting for game       (0.0s)
[*] attaching             (1.0s)
[*] attached: pid 25184  base 0x7FF6XXXXXXXX
[*] waiting for uworld    (0.0s)
[*] scanning for uworld   (0.2s)
[*] UWorld scan prepared: 6 writable section(s), 41.3 MiB total
[*] UWorld resolved by scan: base+0x10AEC0B8 -> 0x1F2A...
[*] waiting for match     (0.5s)
[*] probing layout        (0.4s)
[*] relative block: float32 (3 floats + 4 pad per 0x18 slot)
[*] ready                 (0.4s)
```

A cadeia é sempre a mesma, e cada etapa tem um nome fixo — se travar, o painel diz
em qual delas:

| etapa | % | esperando por |
|---|---|---|
| `waiting for game` | 10 | o processo do jogo existir |
| `attaching` | 25 | `OpenProcess` + `EnumProcessModules` (precisa de admin) |
| `waiting for uworld` | 40 | o estático GWorld (offset validado, depois `--uworld`) |
| `scanning for uworld` | 40 → 80 | a varredura limitada, proporcional às seções já lidas |
| `waiting for match` | 85 | um pawn local (lobby / tela de carregamento) |
| `probing layout` | 92 | float32 vs float64 no root component do pawn |
| `ready` | 100 | aim e ESP liberados |

O programa **não trava** esperando o jogo: você pode abrir antes do Fortnite, o
overlay já aparece mostrando a etapa atual, e ele tenta o `OpenProcess` de novo a
cada 1 s. Quando a cadeia chega em `ready`, o painel se esconde sozinho (dá pra
religar em *Misc* → `show startup panel`). Se o jogo fechar, ele percebe em até
500 ms, fecha o handle, descarta todos os ponteiros em cache e volta pra
`waiting for game`.

a linha `relative block` é a que resolve o dúvida que estava no código: o dump dá
o espaçamento (0x18) mas não diz se são 3 floats ou 3 doubles. Agora ele testa
nos dois formatos em cima do pawn local e usa o que der um transform coerente.
se aparecer `UNRESOLVED`, você está no lobby — entra na partida que ele resolve
sozinho em ~1 s.

**Novo:** o dump agora traz o GWorld direto (`Class.UWORLD = 0x1C8E1578`), então ele
já vem preenchido no `offsets_gen.hpp` — não precisa mais passar `--uworld` nem
esperar a varredura. O offset é validado do jeito forte antes de ser usado: o
programa confere que a cadeia chega numa câmera ou que o seu pawn está dentro do
`GameState.PlayerArray`. Se não passar (menu, lobby de transição, ou patch novo com
offset velho), ele **rejeita** e cai na varredura sozinho — ou seja, offset errado
vira "mais lento", nunca "ESP desenhado em cima da coisa errada".

No painel/console você vê qual dos dois casos é:

| mensagem | significa |
|---|---|
| `offset readable but not validated` | o offset aponta para algo legível mas que não é o mundo desta partida (menu/lobby/patch diferente) |
| `scanning for uworld` | a varredura limitada está procurando sozinha |
| `uworld 0x...` + `ready` | validado, mira e ESP liberados |

Se você tem o offset do GWorld de outro lugar, pode passar na linha de comando — ele
passa pela mesma validação:

```
fortnite_external.exe --diag              (testa overlay/device/fonte e sai)
fortnite_external.exe --uworld 0x1C8E1578
```

`accepted` = bateu na validação; `rejected` = não é o GWorld dessa build (número de
outro patch/fórum). Sem argumento ele varre sozinho, 1 MiB a cada 500 ms, e continua
tentando em segundo plano enquanto o menu já está aberto. `--scan` faz essa varredura
na hora, antes de abrir o overlay. Se aparecer `UWorld not found`, veja a seção 5.

5. o overlay aparece; **clique uma vez dentro do jogo** (pra ele ter o foco) e aperte
   **INSERT** pra abrir o menu. Com o menu aberto o mouse volta a funcionar na tela;
   fechando, ele volta a ser click-through.

---

## 3. Teclas

| tecla | o que faz |
|---|---|
| `INSERT` | abre/fecha o menu (com o menu aberto o overlay deixa de ser click-through) |
| `END` | fecha a tool |
| botão direito do mouse | **segurar** para mirar (padrão) — dá pra trocar pra esquerdo na aba *Aimbot* |

Nada dispara ao abrir: aimbot e ESP começam **desligados**. Ligue dentro do menu.

Guias rápidos dentro do menu:

- **Aimbot** → `enable aimbot`, `fov (px)` = raio em pixels na tela, `smoothness`
  baixo = puxa rápido, alto = suave.
- **Visuals** → `enable visuals`, depois `box`, `snaplines`, `distance`, `health bar`.
  Branco = visível, vermelho = atrás de parede.
- **Misc** → mostra se o input está no modo *spoofed* e tem o botão de unload.

---

## 3.1. "Abriu e fechou na hora"

Antes de qualquer coisa: **teste o overlay sem o jogo**, em 5 segundos.

```
fortnite_external.exe --diag
```

Ele cria a janela, o device D3D9Ex e a fonte, desenha uma linha de texto,
imprime cada passo com `[diag] ... ok` e sai sozinho depois de 10 s. Se aparecer
texto no canto da tela, o problema **não é** overlay — é o jogo/offset. Se o
`--diag` falhar, a mensagem diz exatamente qual etapa:

| última linha | causa provável |
|---|---|
| `[!] overlay window creation failed` | outro overlay/DWM bloqueando, ou sessão sem desktop |
| `[!] D3D9Ex device creation failed` | sem D3D9 (driver/VM/remote desktop), jogo em fullscreen exclusivo |
| `[!] font atlas creation failed` | Consolas ausente, ou GDI sem acesso |

Agora, se a janela fechar sozinha depois disso, o programa deixa rastro —
sempre. Procure em `fortnite_fault.txt`, na mesma pasta do `.exe`:

```
=== 2026-11-06 23:12:44 ===
what      : unhandled exception
detail    : exception 0xC0000005 at 0x00007FF6...
process   : pid 0  base 0x0  alive 0
...
```

| o que está no arquivo | o que aconteceu |
|---|---|
| `unhandled exception` | crash (access violation) — é bug, mande o arquivo |
| `main loop stalled` + código de saída 2 | travou por 8 s; o watchdog encerra pra não parecer freeze |
| `console window closed` | alguém fechou o console / Alt+F4 |
| `fatal error ...` | falha de inicialização, com o motivo na linha `what` |

E o console agora **não fecha no sucesso**: se o programa foi aberto por duplo
clique (janela própria), ele espera ENTER no fim e imprime o código de saída.


Ordem de investigação, porque quase sempre é uma das três coisas:

1. **O `.exe` não foi compilado.** Se você deu F5 no Visual Studio e apareceu
   `MSB8020` / "não é possível iniciar o programa", não é crash: não existe binário.
   Veja a seção 1 (`build.bat`).
2. **Abriu sem admin.** O `OpenProcess` é negado e o programa precisa reportar isso —
   agora ele reporta e **segura a janela**: qualquer falha fatal imprime o motivo e
   escreve `press ENTER to close this window`. Se a janela fechar sem essa mensagem,
   veja o item 3.
3. **Crash de verdade.** Aí rode pelo `run.bat`/console: o código de saída aparece no
   final (`terminou com codigo ...`). Um `--help` também confirma que o binário
   executa:

```
fortnite_external.exe --help
```

Se o console mostrar a etapa (`waiting for game`, `attaching`, ...) e a janela do
painel não aparecer na tela, o problema é de overlay, não do processo: confira se o
jogo está em *janela sem bordas* no monitor principal e se o Windows não está
redirecionando o D3D9 (jogos em fullscreen exclusivo não deixam overlay por cima).

## 4. O que foi removido (e por quê)

O repo original tinha duas metades: um driver WDM que trocava o callback do
`win32k.sys` para ler memória física, e o overlay rodando com token duplicado do
`winlogon` na banda UIAccess. Nada disso está aqui:

| removido | por quê |
|---|---|
| driver + hook de callback | não é necessário para ler um processo externo |
| leitura de memória física / walk de page tables | `ReadProcessMemory` faz o mesmo, sem ring 0 |
| `WriteProcessMemory` | o programa não escreve no jogo; mira só com `SendInput` |
| cópia do stub de `NtUserSendInput` | `SendInput` direto |
| duplicação de token do winlogon / UIAccess | exigia `SeTcbPrivilege` e binário assinado |

O overlay agora é uma janela `WS_EX_LAYERED | WS_EX_TOPMOST` comum: fica por cima,
é click-through quando o menu está fechado e volta a aceitar clique quando o menu abre.

## 5. Se não funcionar

| sintoma | causa provável | o que fazer |
|---|---|---|
| console fica em `waiting for Fortnite...` | jogo não está aberto, ou nome do processo diferente | confira no Gerenciador de Tarefas: tem que ser `FortniteClient-Win64-Shipping.exe` |
| `UWorld not found` | scan não achou / jogo em outro mapa | entre numa partida (o lobby às vezes não tem GameState) e rode de novo com `--scan`; ou passe `--uworld 0x...` |
| `OpenProcess` falha / base 0x0 | não rodou como admin | executa como administrador |
| nada aparece na tela, console ok | jogo em **fullscreen exclusivo** | troque pra *Janela sem bordas* (borderless) nas opções do Fortnite |
| overlay aparece mas ESP vazio | você está no lobby / espectador | entre na partida |
| menu abre mas não clica | overlay com `WS_EX_TRANSPARENT` | feche e abra o menu com `INSERT` (ele troca o estilo) |
| box desenhada no lugar errado | offsets de patch novo | regenere o header (seção 6) |
| `--uworld ... rejected` | o offset não é o GWorld dessa build | use `--scan` e copie o `base+0x...` que ele imprimir |
| tudo some quando você clica fora | é o comportamento esperado | mouse só se move com o jogo em foco e o menu fechado |

---

## 6. Quando sair patch novo

`UWorld` não está no dump e é resolvido em runtime, então só quebra se algum
**outro** offset mudar. Para atualizar:

1. baixe o dump novo (OffsetDeck ou um SDK Dump da season)
2. `python3 tools/gen_offsets.py dump_novo.json > fortnite-external/offsets_gen.hpp`
3. `python3 tools/build_single.py` (recria o arquivo único)
4. recompile

Antes de confiar no build, os dois gates (não precisam do jogo nem do Windows):

```
python3 tools/check_math.py      # matemática da projeção (basis ortonormal, W2S)
python3 tools/syntax_check.py    # compila de verdade pra x86_64-windows
```

Se o `syntax_check` disser `SKIPPED`, não houve compilação nenhuma — não é "passou".

Se `tools/` não estiver na sua máquina (você copiou só o `.cpp`), dá pra editar à
mão: o `off::` está logo no começo do arquivo, cada linha tem o `Struct::Campo`
de origem no comentário. O bloco `off_layout` no fim do header é a checagem de
layout derivada do dump (vetores e rotators de 3 doubles, FOV float, TeamIndex
1 byte) — se um dump novo tiver outro layout, corrija ali antes de confiar.

---

## 7. Detalhe honesto

Três coisas vêm **desligadas** de propósito porque o dump não as fecha:

- `kVisibleOnly` / bit de `bRecentlyRendered` — o dump dá o byte (0x7E1), não o bit.
  Chutar o bit faria o ESP mentir sobre quem está visível.
- `bIsSpectator` / `bIsDBNO` — mesma história (bytes 0x282 / 0x892). Não são lidos.
- `kBoneWorldLocations` — mira por osso. O dump não diz se
  `CachedBoneSpaceTransforms` é bone-space ou component-space, nem se o elemento é
  `FTransform` (0x60) ou `FTransform3f` (0x30). Sem isso, a mira usa o centro da
  cápsula + `BaseEyeHeight - CapsuleHalfHeightFortPawn`, que são valores validados.

Para ligar a mira por osso: meça o stride e o espaço em jogo (receita no bloco
`BoneArray` do `offsets_gen.hpp`), preencha `kTransformStride` e
`kBoneTransformsAreFloat`, e vire `kBoneWorldLocations = true`.

E o de sempre: rode elevado, jogo em *janela sem bordas*, e teste primeiro num modo
offline/criativo ou servidor de prática.
