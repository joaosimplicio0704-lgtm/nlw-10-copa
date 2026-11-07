# AUDITORIA.md — o que este código faz e o que ele NÃO faz

Você não deve acreditar em mim: olhe o código, ou rode os comandos abaixo. Este
arquivo existe para você conseguir verificar sozinho, em máquina limpa, sem
depender de antivírus nem de reputação de repositório.

## 1. O que está no repositório

34 arquivos rastreados. Os únicos executáveis são scripts:

| arquivo | linguagem | o que é |
|---|---|---|
| `fortnite-external/fortnite_external_single.cpp` | C++17 | o programa inteiro, um arquivo |
| `fortnite-external/fortnite_external.cpp` | C++17 | o mesmo, com `#include "offsets_gen.hpp"` |
| `fortnite-external/offsets_gen.hpp` | C++ | tabela de offsets gerada |
| `fortnite-external/build.bat`, `run.bat` | batch | compilar / rodar |
| `tools/*.py` | Python | gerar offsets, montar o single file, testes |

**Não existe** `.exe`, `.dll`, `.sys`, `.scr`, `.js`, `.ps1`, `.vbs`, `.lnk`,
instalador ou qualquer binário compilado no repositório. Se você baixou um `.exe`
de um zip/link, ele foi compilado por **você** (`build.bat`) ou por outra pessoa —
esse arquivo não vem do repositório.

## 2. O que o programa chama (contagem real de chamadas)

| API | chamadas | para quê |
|---|---|---|
| `OpenProcess` | 1 (linha 416) | abrir o jogo com `PROCESS_VM_READ \| PROCESS_QUERY_INFORMATION` (só leitura) |
| `ReadProcessMemory` | 2 (linhas 466, 482) | ler os offsets do jogo |
| `WriteProcessMemory` | **0** | nunca escreve no jogo |
| `VirtualAllocEx` / `CreateRemoteThread` | **0** | nunca injeta nada |
| `LoadLibrary` / `GetProcAddress` | **0** | não carrega código de fora |
| `SendInput` | 1 (linha 556) | mover o mouse (aimbot), só com tecla segurada |
| `GetAsyncKeyState` | 4 | ler a tecla do aimbot e INSERT/END |
| `GetDC` | 1 | criar a fonte (GDI), **não** ler a tela |
| `BitBlt` / `PrintWindow` / `GetDIBits` | **0** | **não captura imagem da tela** |
| `SetWindowsHookEx` / teclado global | **0** | não instala hook nenhum |
| `WinHttp` / `WinInet` / `socket` / `connect` | **0** | **não faz rede — zero conexões** |
| `RegSetValue` / `schtasks` / `CreateService` | **0** | não persiste, não agenda, não cria serviço |

Para conferir você mesmo, no seu PC, com o arquivo na mão:

```powershell
# 1) o que ele chama (strings de API dentro do fonte)
Select-String -Path fortnite_external_single.cpp -Pattern "BitBlt|PrintWindow|GetDIBits|SetWindowsHookEx|WinHttp|WinInet|socket|WriteProcessMemory|CreateRemoteThread|RegSetValue|schtasks" 

# 2) nenhuma dessas linhas deve aparecer
```

## 3. A confusão mais provável: clique-para-atravessar

O programa cria uma **janela transparente, sempre no topo, que ignora o mouse**
(`WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TRANSPARENT`). Isso é *exatamente* o que
um overlay de FPS faz — e é também o que alguns malwares fazem para "flutuar" na
tela. A diferença está no que a janela **contém**:

- ela só desenha caixas, texto e o menu que está no código (`draw::rect`, `draw::text`);
- **nenhum pixel da tela é lido** (`BitBlt`/`PrintWindow` = 0 chamadas);
- **nada é enviado para lugar nenhum** (rede = 0 chamadas);
- ela desaparece quando o processo fecha: não tem `Run`, não tem serviço, não tem
  DLL no `AppData`.

Se você viu uma janela ou ícone estranho **com o programa fechado**, isso não é
este código — ele não deixa nada instalado. Confira:

```powershell
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location
Get-ScheduledTask | Where-Object {$_.State -eq 'Ready'} | Select-Object TaskName, TaskPath
```

## 4. Por que o Windows/antivírus reclama (e vai reclamar)

Isto é honesto e não é um defeito a corrigir:

1. **Ele abre um processo de jogo e lê memória.** Comportamento de trapaça,
   assinatura de "cheat", e às vezes de "stealer" para heurística genérica.
2. **Ele usa `SendInput` para mover o mouse** — automação de entrada.
3. **Ele cria janela topmost transparente** — heurística clássica de overlay.
4. **Binário compilado por você, sem assinatura digital.** Arquivo não assinado,
   recém-compilado, com essas APIs: Windows Defender/SmartScreen vão desconfiar
   mesmo estando limpo. Isso é reputação, não detecção real.

O que o código **não** tem, e que caracterizaria malware de verdade: rede,
persistência, esconder-se, captura de tela, hook de teclado, injeção em outros
processos, escrita em disco fora da própria pasta (só o `fortnite_external.cfg.json`
e o `fortnite_fault.txt`, ao lado do `.exe`).

## 5. Se você quiser garantia de máquina limpa

Rode o teste em um ambiente isolado, sem valor nenhum dentro:

```powershell
# 1. Windows Sandbox (Windows 10/11 Pro) ou uma VM
# 2. copie só a pasta fortnite-external
# 3. build.bat, depois:
fortnite_external.exe --diag
```

`--diag` cria janela + D3D9Ex + fonte, desenha uma linha e sai em 10 s. Se nesse
ambiente isolado nada vazar (sem conexões, sem arquivos fora da pasta), você tem
prova empírica, não promessa.

Para observar conexões em tempo real, no PC normal:

```powershell
# outra janela, enquanto o programa roda: não deve aparecer nenhum PID dele
Get-NetTCPConnection | Where-Object {$_.OwningProcess -eq (Get-Process fortnite_external).Id}
```

Se essa linha não devolver nada, ele não está falando com a internet.

## 6. Regra prática

- Baixou `.exe` de terceiro para "rodar o cheat"? **Não confie.** Compile o seu
  com `build.bat` a partir deste fonte, que é o que dá para auditar.
- Seu antivírus apagou o `.exe` compilado? Normal, veja a seção 4. Adicione a
  pasta à exclusão **só se** você compilou o binário do fonte que leu.
- Viu atividade suspeita **sem** este programa aberto? É outro programa: use
  `Autoruns` (Sysinternals) para ver o que inicia com o Windows.

## 7. Hashes (sha256) do código desta entrega

Para conferir que o arquivo que chegou é o que eu auditei:

```
378c8ae7f8044eeb845792d8c0a1e66799dec46c8c1058afe2a03cbb631d24c4  fortnite-external/fortnite_external_single.cpp
bb4a7d5e40438413b5e139fcec1e718cc78d16a00a00a825390b206961004528  fortnite-external/fortnite_external.cpp
038dbc34c10776fc2705cfaf132db86c3f3c1c4d6b3346e64c3749cffb4e09bd  fortnite-external/build.bat
f4bdfd666942d29763a54a61301dc2c490340ddefe9002c1329201bcc28de3db  fortnite-external/run.bat
c44afbabc7fb89cfb989c243df17312c8f5d9bae7062101bb743caae018c6d59  tools/build_single.py
230010ab63a18674ce3f4c54cbad4b6d0dca59cfc963b8e5e7bba144829fb281  tools/fuzz_math.py
670d687db0e2a3365ddf1f64029bf2ca7b28f93a08e4cd1ef25935f77580a5da  tools/syntax_check.py
6d8984286656e2b8bf743557875146912e702b2ee57bc63f514ce89da9f0b365  tools/gen_offsets.py
da61aa7b228da0528315ac09f87052ec951afddf987418827dff7a897452cc8b  tools/check_math.py
```

No Windows:

```powershell
Get-FileHash fortnite-external\fortnite_external_single.cpp -Algorithm SHA256
```

Se o hash bater, o arquivo na sua máquina é byte a byte o mesmo que eu analisei.
