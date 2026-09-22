# Design system e especificação de UX/UI

- **Produto:** Pacaembu Orbit CRM
- **Versão:** 1.0
- **Status:** aprovado para o protótipo
- **Última referência visual:** commit `558e7fb` (`feat: publish approved CRM prototype`)

Este documento é a fonte de verdade para a experiência visual e para o comportamento da interface do CRM. Toda nova tela, componente ou alteração de fluxo deve seguir estas regras ou registrar uma decisão que explique a exceção.

## Objetivo de design

O CRM deve ajudar o supervisor e os corretores a tomar decisões comerciais rapidamente. A interface precisa mostrar o estado da operação, reduzir o trabalho repetitivo e deixar claro o que é informação, sugestão do Agent e ação executada.

A experiência combina:

- clareza operacional de um CRM;
- leitura rápida de indicadores;
- navegação simples para uma equipe que trabalha em volume;
- contexto persistente nas conversas com Agents;
- identidade visual inspirada na Pacaembu;
- linguagem de sessões e especialistas inspirada no Hermes Bot e no Grok Bot.

## Princípios

1. **A ação principal deve ser evidente.** Cada tela deve ter uma ação primária visível e uma hierarquia clara.
2. **O contexto deve permanecer próximo da decisão.** Leads, conversas, indicadores e informações do produto devem aparecer sem obrigar o usuário a trocar de tela desnecessariamente.
3. **O estado do sistema deve ser explícito.** Sempre informar quando algo está carregando, aguardando aprovação, conectado, desconectado, salvo ou com erro.
4. **O Agent orienta antes de executar.** Sugestões, rascunhos e ações pendentes precisam ser visualmente diferentes de ações já executadas.
5. **A interface respeita o escopo do corretor.** O usuário nunca deve receber a impressão de que está vendo dados de outro corretor.
6. **A densidade deve servir ao trabalho.** Usar cards, tabelas e listas compactas, com espaço suficiente para leitura e foco.
7. **A acessibilidade faz parte do componente.** Foco, teclado, contraste, texto alternativo e mensagens de erro são requisitos do design.

## Identidade visual

### Paleta de interface

Os valores abaixo são os tokens adotados no protótipo aprovado. Alterações devem ser feitas nos tokens antes de serem aplicadas em componentes isolados.

| Token | Valor | Uso principal |
|---|---|---|
| `navy` | `#003D4C` | Barra lateral, texto institucional e superfícies escuras |
| `navy-2` | `#002E3A` | Variação escura e contraste de superfícies |
| `blue-bright` | `#005568` | Interações e destaque secundário |
| `red` | `#E4002B` | Ações primárias, menus ativos e alertas de atenção |
| `red-bright` | `#C90027` | Hover e estado pressionado do vermelho |
| `yellow` | `#FFB81C` | Status, indicadores positivos e sinalização pontual |
| `green` | `#2EB67D` | Conectado, concluído e sucesso |
| `whatsapp` | `#00A811` | Identificação do canal WhatsApp |
| `purple` | `#7564EE` | Contexto de Agents e insights |
| `surface` | `#F7FAF9` | Fundo geral da aplicação |
| `card` | `#FFFFFF` | Cards, tabelas e superfícies de leitura |
| `line` | `#E5EBF3` | Bordas e separadores |
| `ink` | `#003D4C` | Texto principal |
| `muted` | `#718097` | Texto auxiliar |

Regras de cor:

- o vermelho é a cor principal dos menus e das ações primárias;
- o item ativo da navegação usa faixa lateral vermelha, fundo vermelho translúcido e texto claro;
- o hover de menu usa vermelho translúcido sem competir com o item ativo;
- o amarelo não deve substituir o vermelho nos menus; ele fica reservado para status e indicadores;
- vermelho de alerta deve sempre vir acompanhado de texto, ícone ou estado, nunca depender apenas da cor;
- o roxo identifica o contexto de Agents, mas não substitui o vermelho da navegação global;
- superfícies escuras usam texto claro com contraste suficiente e nunca texto cinza de baixa legibilidade.

### Tipografia

- **Display:** Dongle, para títulos, números de KPI e marca.
- **Interface:** Nunito Sans, para navegação, textos, tabelas, formulários e mensagens.
- Títulos devem ser curtos e usar peso forte.
- Textos auxiliares devem permanecer curtos, com line-height confortável.
- Números de KPI devem ter destaque visual maior que seus rótulos.
- Evitar caixa alta em frases; caixa alta fica restrita a rótulos curtos e categorias.

### Forma, espaçamento e elevação

- usar cantos arredondados entre `8px` e `18px`, conforme a importância do componente;
- usar bordas leves em vez de sombras fortes para separar conteúdo;
- reservar sombras maiores para modais, shells de Agents e elementos que ficam sobre a página;
- manter uma escala de espaçamento consistente baseada em múltiplos de `4px`;
- não usar efeitos decorativos que reduzam a leitura dos dados;
- animações devem ser curtas, discretas e respeitar `prefers-reduced-motion`.

## Estrutura da aplicação

### Shell desktop

O shell principal possui:

1. **Barra lateral:** navegação persistente, seletor de equipe, suporte e perfil do usuário.
2. **Barra superior:** breadcrumbs, busca global, notificações e estado do sistema.
3. **Área de conteúdo:** cabeçalho da página, ação primária e conteúdo do módulo.

Dimensões de referência:

- barra lateral: aproximadamente `260px`;
- barra superior: aproximadamente `75px`;
- conteúdo central com largura máxima de aproximadamente `1540px`;
- padding desktop entre `32px` e `36px`;
- cards alinhados por uma mesma grade horizontal.

### Navegação

- agrupar itens por contexto: `Workspace` e `Gestão`;
- manter os nomes em português e usar verbos ou substantivos conhecidos pela equipe;
- mostrar badge apenas quando houver informação acionável;
- destacar somente um item ativo por vez;
- manter `Agents` acessível na navegação principal;
- não esconder a identidade do corretor ou do supervisor;
- o seletor de ambiente deve indicar a equipe e o contexto atual.

### Responsividade

- acima de `1180px`: shell completo com painel de contexto dos Agents;
- abaixo de `1180px`: reduzir a barra lateral e ocultar o painel contextual secundário quando necessário;
- abaixo de `880px`: barra lateral recolhida, aberta por menu móvel;
- abaixo de `590px`: uma coluna, ações empilhadas e seleção móvel de Agent;
- nenhuma informação essencial pode depender apenas de hover;
- tabelas largas devem permitir rolagem horizontal sem quebrar a página.

## Componentes e estados

Todo componente interativo deve definir pelo menos os estados abaixo quando aplicável:

- padrão;
- hover;
- foco por teclado;
- pressionado;
- desabilitado;
- carregando;
- vazio;
- erro;
- sucesso;
- aguardando aprovação.

### Botões

- **Primário:** fundo `red`, texto branco, usado para a ação principal da tela.
- **Secundário:** fundo branco, borda `line`, usado para ações complementares.
- **Terciário:** sem borda ou fundo, usado para ações discretas.
- **Perigoso:** vermelho claro ou estado de confirmação, sempre acompanhado de texto explicativo.
- toda ação de envio deve indicar seu resultado com toast, mudança de estado ou atualização da lista;
- o foco deve permanecer visível em qualquer botão.

### Cards e KPIs

- rótulo curto no topo;
- valor principal com hierarquia forte;
- tendência ou comparação abaixo do valor;
- ícone deve reforçar o sentido, nunca ser a única explicação;
- gráficos devem ter legenda e texto alternativo quando forem relevantes para a decisão.

### Listas e tabelas

- permitir busca e filtros próximos do conteúdo;
- preservar o contexto ao atualizar uma linha;
- informar quantidade total e estado vazio;
- não usar cor como único indicador de etapa;
- ações de linha devem aparecer de forma previsível, com confirmação para operações destrutivas.

### Formulários

- label visível antes do campo;
- placeholder é exemplo, não substituto do label;
- validação próxima ao campo;
- mensagens de erro em linguagem objetiva;
- preservar valores preenchidos quando uma validação falhar;
- indicar campos obrigatórios antes do envio.

## Regras por módulo

### Visão geral

Deve responder rapidamente:

- quantos leads estão na carteira;
- quantos estão em atendimento;
- quantas visitas estão agendadas;
- qual é a conversão;
- quais são os próximos compromissos;
- onde o funil está acumulando oportunidades.

O botão `Novo lead` é a ação primária. O dashboard deve evitar excesso de gráficos sem uma decisão associada.

### Leads e clientes

- o Kanban representa etapas do funil e não apenas categorias visuais;
- cada card deve mostrar nome, origem, etapa, interesse e próximo passo;
- a ficha contextual deve permanecer disponível ao selecionar um lead;
- movimentações devem registrar etapa anterior, nova etapa e responsável;
- o corretor só vê sua própria carteira;
- o supervisor vê a visão permitida pela política de gestão.

### Agents

A experiência dos Agents usa três áreas:

1. **Rail de Agents:** especialistas disponíveis, status online e troca de Agent.
2. **Chat:** sessões, mensagens, composer e respostas.
3. **Contexto:** lead selecionado, capacidades ativas e informações relevantes do CRM.

Regras:

- Agents e Sessions são abas distintas;
- cada Agent pode ter várias sessões independentes;
- a sessão ativa deve mostrar título, horário e histórico;
- o contexto do corretor deve ser visível, mas sem expor segredos de integração;
- mensagens do usuário e do Agent devem ter tratamentos visuais diferentes;
- respostas geradas são identificadas como sugestão, rascunho ou ação concluída;
- quick prompts devem acelerar tarefas frequentes sem esconder o composer;
- o composer deve aceitar Enter para enviar e Shift+Enter para nova linha;
- streaming deve mostrar processamento sem simular uma mensagem concluída;
- falhas devem permitir tentar novamente sem apagar o histórico;
- o Agent não deve executar envio de WhatsApp ou alteração de CRM enquanto a política do workspace não permitir;
- qualquer ação executável deve mostrar o que será alterado, exigir a aprovação aplicável e gerar auditoria.

Agents previstos no produto:

- Atendimento de leads;
- Follow-up;
- Tráfego pago;
- Tráfego orgânico;
- Criativos de imagem;
- Criativos de vídeo;
- Análise de desempenho.

Cada Agent deve ter nome, descrição curta, capacidades visíveis e estado de disponibilidade. A cor do avatar pode variar por especialidade, mas os estados de menu seguem o padrão global vermelho.

### Performance

- destacar metas, realizado, tendência e período;
- permitir leitura individual e visão de equipe conforme a permissão;
- informar período, fonte e atualização dos dados;
- não apresentar ranking sem explicar métrica e período usados.

### Imóveis

- tratar o produto como fonte de informação comercial aprovada;
- organizar fotos, vídeos, características, condições e diferenciais;
- separar conteúdo aprovado de observações internas;
- preservar a hierarquia entre empreendimento, unidade e condição comercial.

### Documentos

- mostrar tipo, nome, proprietário, data e status do arquivo;
- diferenciar documentos, imagens, vídeos e materiais de campanha;
- indicar upload, processamento, falha e permissão de acesso;
- evitar expor arquivos de outro corretor;
- usar confirmação antes de exclusão permanente.

### Gestão da equipe

- mostrar o supervisor como responsável pela visão agregada;
- permitir filtros por corretor e período;
- destacar conexão do Hermes/WhatsApp, atividade e indicadores;
- registrar quando o supervisor acessa dados individuais;
- não transformar métricas em avaliação sem mostrar a origem do dado.

## Conteúdo e linguagem

- escrever em português do Brasil;
- usar linguagem direta, acolhedora e profissional;
- preferir `Novo lead`, `Próximo passo`, `Preparar resposta` e `Abrir ficha`;
- evitar termos técnicos do Hermes quando o usuário precisa apenas tomar uma decisão;
- explicar erros com causa provável e próximo passo;
- não prometer condições comerciais que não estejam confirmadas;
- indicar quando um dado é simulado, pendente ou aguardando integração.

## Acessibilidade

O objetivo é atender WCAG 2.2 AA na implementação.

- todos os controles devem ser operáveis por teclado;
- foco visível com contraste suficiente;
- textos e ícones devem manter contraste adequado;
- status não pode depender somente de cor;
- dialogs devem possuir título, foco inicial e retorno de foco;
- mensagens de erro devem ser associadas ao campo correspondente;
- áreas de streaming e toast devem ser anunciadas sem interromper a leitura;
- imagens reais precisam de texto alternativo;
- respeitar `prefers-reduced-motion`;
- a ordem de leitura deve seguir a ordem visual e operacional.

## Segurança percebida na interface

O design deve reforçar as regras técnicas descritas em `security-model.md`:

- mostrar sempre o ambiente e o corretor ativo;
- não mostrar API keys, tokens, URLs internas ou diretórios de sessão;
- indicar claramente quando o Agent está apenas orientando;
- mostrar aprovação antes de uma mutação;
- usar estados de conexão para o WhatsApp sem expor credenciais;
- informar falta de permissão sem revelar dados de outro usuário;
- registrar mensagens de auditoria de forma compreensível para o supervisor.

## Regras para implementação

- tokens visuais devem ficar centralizados em CSS variables ou no sistema de tema;
- componentes reutilizáveis devem receber estados por propriedades, não por estilos duplicados;
- não criar uma nova cor para resolver um caso que já possui token;
- não duplicar versões `v2` de arquivos sem uma decisão de migração;
- cada fluxo novo deve incluir estado vazio, carregando e erro;
- mudanças visuais devem ser conferidas em desktop e mobile;
- alterações no comportamento dos Agents devem atualizar este documento e o contrato de integração quando necessário;
- o protótipo é referência visual, não implementação da API, Hermes ou WhatsApp.

## Critérios de revisão visual

Antes de aprovar uma tela, verificar:

1. a ação primária está evidente;
2. o item de navegação ativo usa o padrão vermelho;
3. os textos estão legíveis e em português claro;
4. loading, vazio, erro e sucesso estão definidos;
5. a tela funciona em desktop e mobile;
6. foco e teclado são utilizáveis;
7. nenhum dado de outro corretor aparece no contexto;
8. sugestões do Agent estão separadas de ações executadas;
9. o conteúdo respeita as condições comerciais aprovadas;
10. a mudança foi refletida no protótipo ou na implementação correspondente.

## Governança do documento

O documento deve ser atualizado quando houver:

- mudança de identidade visual;
- novo módulo ou fluxo principal;
- mudança no comportamento dos Agents;
- alteração de responsividade ou acessibilidade;
- nova regra de aprovação ou visibilidade;
- decisão que afete vários componentes.

Alterações pontuais de conteúdo ou dados mocados não exigem mudança neste documento. Toda exceção deve ser registrada no pull request ou no ADR correspondente.
