# Contribuindo

Obrigado por querer ajudar. Issues e pull requests são bem-vindos.

## Antes de começar

- Abra uma issue descrevendo o bug ou a ideia antes de uma mudança grande.
- Mudanças pequenas (correção, texto, teste) podem ir direto num pull request.

## Ambiente

```bash
npm install
npm run electron:dev
```

O modo `npm run dev` abre só a interface no navegador com dados de exemplo, útil para mexer em visual.

## Antes de abrir o pull request

```bash
npm run build   # tipos + build
npm test
```

- Escreva testes para regras novas (detecção, Radinho, adaptadores de sistema).
- Mantenha o estilo do código ao redor. Comentários explicam o *porquê* (decisão, contorno de limitação), não repetem a linha seguinte.
- Textos da interface em português do Brasil.
- Nunca inclua tokens, URLs internas ou dados reais de projetos em código, testes ou prints.

## Novo sistema (Jira, GitHub…)

Implemente a interface `GitlabClient` em `src/services/providers/`, devolvendo o `Snapshot` neutro, registre-o em `providers/index.ts` e cubra com testes usando respostas simuladas, como em `azure.test.ts`.

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a [MIT](LICENSE).
