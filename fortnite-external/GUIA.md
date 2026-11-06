# GUIA — como compilar e usar

Tudo que você precisa está em **um arquivo**: `fortnite_external_single.cpp`.
Ele já traz o driver (metade `_KERNEL_MODE`), o overlay e os offsets da v43.00 embutidos.

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

### Opção C — linha de comando (sem IDE)

Menu Iniciar → **x64 Native Tools Command Prompt for VS 2022** (tem que ser esse, não o `cmd`):

```
cd C:\tools\fn
cl /std:c++17 /O2 /EHsc /W3 /D_CRT_SECURE_NO_WARNINGS fortnite_external_single.cpp /link /SUBSYSTEM:CONSOLE /OUT:fortnite_external.exe
```

---

## 2. Como executar (Windows)

Antes de mexer com driver, teste o caminho simples. Abra o `.cpp` no editor e
troque **uma linha** no bloco `namespace cfg` (fica no topo):

```cpp
constexpr bool  kUseCallbackDriver = false;   // <- era true
```

Compile de novo. Agora ele usa `OpenProcess` + `ReadProcessMemory` em vez do driver.

Ordem de execução:

1. abre o Fortnite e chega no **lobby** (ou num modo offline/criativo)
2. clica com o botão direito no `fortnite_external.exe` → **Executar como administrador**
   (sem admin, o `OpenProcess` falha)
3. uma janela de console abre e escreve:

```
[*] waiting for Fortnite...
[*] base 0x7FF6XXXXXXXX  pid 25184
[*] UWorld resolved by scan: base+0x10AEC0B8 -> 0x1F2A...
[*] UWorld ready
```

`UWorld resolved by scan` = ele achou o ponteiro sozinho, você **não precisa** do
número que faltava no dump. Se aparecer `UWorld not found`, veja a seção 5.

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

## 4. Driver (opcional, é o que o repo original usava)

O driver faz leitura por memória física, então não aparece como `ReadProcessMemory`.
Para usar:

1. Instale o **WDK** (Windows Driver Kit) junto com o Visual Studio.
2. Crie um projeto **Empty WDM Driver** (x64/Release).
3. Adicione o **mesmo** `fortnite_external_single.cpp`.
4. Em *Propriedades → C/C++ → Pré-processador → Definições*, adicione `_KERNEL_MODE`.
5. Build → sai um `.sys`.
6. Mapeie o `.sys` com **kdmapper** (`kdmapper.exe fortnite_external.sys`) — o driver
   não é assinado, então não dá pra instalar por serviço.
7. Volte `kUseCallbackDriver = true` no `.cpp` e recompile o `.exe`.

Se algo aqui der errado, volte pro passo 2 — o caminho sem driver funciona igual,
só é mais detectável.

---

## 5. Se não funcionar

| sintoma | causa provável | o que fazer |
|---|---|---|
| console fica em `waiting for Fortnite...` | jogo não está aberto, ou nome do processo diferente | confira no Gerenciador de Tarefas: tem que ser `FortniteClient-Win64-Shipping.exe` |
| `UWorld not found` | scan não achou / jogo em outro mapa | entre numa partida (lobby às vezes não tem GameState) e aperte o botão de reload no menu; ou ponha o número em `kUWorldFallback` |
| `OpenProcess` falha / base 0x0 | não rodou como admin | executa como administrador |
| nada aparece na tela, console ok | jogo em **fullscreen exclusivo** | troque pra *Janela sem bordas* (borderless) nas opções do Fortnite |
| overlay aparece mas ESP vazio | você está no lobby / espectador | entre na partida |
| menu abre mas não clica | overlay com `WS_EX_TRANSPARENT` | feche e abra o menu com `INSERT` (ele troca o estilo) |
| box desenhada no lugar errado | offsets de patch novo | regenere o header (seção 6) |

---

## 6. Quando sair patch novo

`off::UWorld` muda todo update — mas agora ele é resolvido em runtime, então só
quebra se algum **outro** offset mudar. Para atualizar:

1. baixe o dump novo (OffsetDeck ou um SDK Dump da season)
2. `python3 tools/gen_offsets.py dump_novo.json > fortnite-external/offsets_gen.hpp`
3. `python3 tools/build_single.py` (recria o arquivo único)
4. recompile

Se `tools/` não estiver na sua máquina (você copiou só o `.cpp`), dá pra editar à
mão: o `off::` está logo no começo do arquivo, cada linha tem o `Struct::Campo`
de origem no comentário.

---

## 7. Detalhe honesto

`kVisibleOnly`, `kSkipSpectators` e `kMarkDowned` vêm **desligados** de propósito:
o dump dá o byte dos bitfields mas não o índice do bit, e chutar isso deixaria o
ESP mentindo. Se quiser ligar, leia o byte em dois estados conhecidos (visível vs
atrás de parede) e ajuste o `constexpr uint8_t kRecentlyRenderedBit = 0x01;`.

E o de sempre: teste em VM, e exclua a pasta do build no Defender antes de compilar —
o driver mexe em callback do win32k e o Defender come o `.sys` no meio do build.
