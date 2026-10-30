# Radar

Utilitário de bandeja do Windows que avisa o que mudou no **GitLab** ou no **Azure DevOps** sem você precisar abrir o navegador: issues novas, merge requests esperando review, pipelines que falharam, menções e atribuições, e issues que foram fechadas.

Feito com Electron, React, TypeScript e Tailwind. Roda só no Windows 10/11.

## O que ele faz

- **Issues / work items** novos nos projetos que você escolher monitorar.
- **MRs / pull requests** esperando o seu review.
- **Pipelines / builds** que falharam, com o job que quebrou e a última linha do erro (GitLab também permite rodar o job de novo).
- **Menções e atribuições** (To-Dos no GitLab; work items atribuídos a você no Azure DevOps).
- **Issues fechadas** que você criou, que estão com você ou em que você foi mencionado.
- **Histórico** das últimas 50 notificações, para rever depois que o toast some.
- **Não perturbe** com horário e dias configuráveis.
- **Radinho**, o mascote: aparece se você passa horas sem abrir o app com pendências, ou se um MR seu fica 24 h sem review.
- **Atualização automática** a partir das releases do GitHub.

Um número no ícone da bandeja mostra as pendências. Clique para abrir o painel com as abas Issues, MRs, Pipelines e Menções e filtros por projeto, milestone e label.

## Instalação

Baixe o instalador `.exe` da página de [releases](https://github.com/GabrielRenovato/Radar-releases/releases/latest) e execute. A instalação é por usuário e não pede administrador.

O instalador **não é assinado**, então o SmartScreen avisa na primeira vez. Clique em *Mais informações* → *Executar assim mesmo*, ou clique com o botão direito no arquivo → *Propriedades* → *Desbloquear*.

## Configuração

Abra o ícone da bandeja → engrenagem → **Conexão**: escolha o sistema, informe o endereço do servidor e cole um token de leitura.

| Sistema | Endereço do servidor | Token |
| --- | --- | --- |
| GitLab | `https://gitlab.exemplo.com` | Personal access token com escopo `read_api` (e `api` se quiser concluir menções e rodar jobs de novo) |
| Azure DevOps | `https://dev.azure.com/sua-organizacao` | PAT com **Read** em Work Items, Code, Build e Project and Team |

Depois, em *Projetos monitorados*, adicione os projetos que quiser acompanhar.

### Privacidade

- O app só **lê** do servidor que você configurou e não envia dados a terceiros.
- O token fica cifrado no seu computador com a proteção do Windows (DPAPI/`safeStorage`) e nunca vai para arquivos do app.
- O resumo por IA é opcional e só funciona se você informar um endpoint `https` próprio.

### Diferenças entre os sistemas

- No Azure DevOps não há "To-Do": a aba Menções mostra work items atribuídos a você por outra pessoa, sem menções em comentários.
- PRs do Azure só têm data de criação; commits novos num PR antigo não geram novo aviso.
- "Rodar job de novo" existe só no GitLab.

## Desenvolvimento

Requisitos: Node 20+ e npm.

```bash
npm install
npm run electron:dev   # app Electron com recarga
npm run dev            # só a interface no navegador (modo demonstração, dados de exemplo)
npm test               # testes (vitest)
npm run build          # checagem de tipos e build da interface
npm run dist           # gera o instalador em release/
```

### Estrutura

- `electron/`: processo principal (janelas, bandeja, atualização, cofre do token) e preload.
- `src/services/`: estado (`store.ts`), detecção de mudanças, regras do Radinho e os clientes de cada sistema em `gitlab/` e `providers/`.
- `src/features/`: popup, toasts, mascote, configurações.

Para suportar outro sistema, implemente a interface `GitlabClient` (`src/services/gitlab/client.ts`) devolvendo o `Snapshot` neutro e registre-o em `src/services/providers/index.ts`.

### Publicar uma versão

1. Suba `version` no `package.json` (o updater só aceita número maior que o instalado).
2. `npm run release` gera o instalador e publica no repositório definido em `build.publish` (precisa do `gh` logado). Ou crie uma tag `vX.Y.Z` e deixe o workflow `release.yml` fazer isso no GitHub Actions.

## Créditos

Inspirado em uma aplicação da dev Karolyne Martins Rodrigues de Lima. O Radinho e o restante do código são próprios deste projeto.

Ícones: [Material Symbols](https://fonts.google.com/icons) (Apache-2.0). Veja [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licença

[MIT](LICENSE)
