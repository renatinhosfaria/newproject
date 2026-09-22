const agents = [
  { id: "atendimento", name: "Atendimento de leads", short: "Atendimento e triagem", letter: "A", tone: "purple", status: "online", sessions: 3 },
  { id: "followup", name: "Follow-up", short: "Aquecimento de carteira", letter: "F", tone: "blue", status: "online", sessions: 5 },
  { id: "trafego-pago", name: "Tráfego pago", short: "Meta Ads e campanhas", letter: "T", tone: "orange", status: "online", sessions: 2 },
  { id: "trafego-organico", name: "Tráfego orgânico", short: "Instagram e conteúdo", letter: "O", tone: "green", status: "online", sessions: 1 },
  { id: "criativos-imagem", name: "Criativos de imagem", short: "Peças estáticas e anúncios", letter: "I", tone: "pink", status: "online", sessions: 4 },
  { id: "criativos-video", name: "Criativos de vídeo", short: "Roteiros e cortes", letter: "V", tone: "orange", status: "online", sessions: 3 },
  { id: "performance", name: "Análise de desempenho", short: "KPIs e recomendações", letter: "P", tone: "purple", status: "online", sessions: 2 }
];

const leads = [
  { id: 1, name: "Juliana Carvalho", initials: "JC", tone: "purple", source: "Meta Ads", sourceTone: "meta", stage: "novo", phone: "(16) 99842-1043", email: "juliana.c@gmail.com", interest: "Residencial Horizonte", value: "R$ 218.900", last: "há 8 min", next: "Responder primeiro contato", score: "Quente", scoreTone: "success" },
  { id: 2, name: "Marcelo Santos", initials: "MS", tone: "blue", source: "Google", sourceTone: "google", stage: "contato", phone: "(16) 99713-2020", email: "marcelo.santos@email.com", interest: "Residencial Horizonte", value: "R$ 224.500", last: "há 28 min", next: "Enviar simulação", score: "Em análise", scoreTone: "warning" },
  { id: 3, name: "Ana Paula Ribeiro", initials: "AR", tone: "pink", source: "Orgânico", sourceTone: "organic", stage: "visita", phone: "(16) 99114-8812", email: "ana.ribeiro@gmail.com", interest: "Jardim das Águas", value: "R$ 239.800", last: "ontem", next: "Confirmar visita", score: "Visita marcada", scoreTone: "purple" },
  { id: 4, name: "Carlos Eduardo", initials: "CE", tone: "orange", source: "Meta Ads", sourceTone: "meta", stage: "visita", phone: "(16) 99809-4431", email: "carlos.e@email.com", interest: "Residencial Horizonte", value: "R$ 221.300", last: "ontem", next: "Atualizar documentação", score: "Visita marcada", scoreTone: "purple" },
  { id: 5, name: "Fernanda Lima", initials: "FL", tone: "green", source: "Meta Ads", sourceTone: "meta", stage: "proposta", phone: "(16) 99771-6638", email: "fernanda.lima@email.com", interest: "Jardim das Águas", value: "R$ 247.900", last: "há 2 dias", next: "Acompanhar aprovação", score: "Documentos enviados", scoreTone: "success" },
  { id: 6, name: "Rafael Moraes", initials: "RM", tone: "blue", source: "Google", sourceTone: "google", stage: "novo", phone: "(16) 99812-2290", email: "rafael.m@email.com", interest: "Residencial Horizonte", value: "R$ 218.900", last: "há 2 horas", next: "Responder primeiro contato", score: "Novo", scoreTone: "warning" },
  { id: 7, name: "Bianca Torres", initials: "BT", tone: "purple", source: "Orgânico", sourceTone: "organic", stage: "contato", phone: "(16) 99108-7655", email: "bianca.t@email.com", interest: "Residencial Horizonte", value: "R$ 218.900", last: "há 3 horas", next: "Enviar condições", score: "Em contato", scoreTone: "warning" }
];

const baseMessages = [
  { role: "assistant", time: "09:41", text: "Olá, Renato. Estou acompanhando a sua carteira e pronto para ajudar com os próximos atendimentos." },
  { role: "assistant", time: "09:42", text: "Encontrei 3 leads novos vindos das campanhas de Meta Ads. O mais recente é Juliana Carvalho, que pediu informações sobre entrada e parcelas.", insight: true },
  { role: "user", time: "09:44", text: "Analise o contexto da Juliana e prepare uma primeira resposta objetiva para eu revisar." },
  { role: "assistant", time: "09:44", text: "Preparei uma sugestão com linguagem acolhedora, sem prometer condições que ainda não foram confirmadas. Também sinalizei as informações que precisam ser coletadas antes da simulação." }
];

const sessionStore = OrbitState.createStore(agents, baseMessages);

const state = {
  view: "dashboard",
  activeAgent: sessionStore.activeAgentId,
  activeSessionId: sessionStore.activeSessionId,
  leadQuery: "",
  selectedLead: 1,
  messages: OrbitState.activeSession(sessionStore).messages,
  pendingReply: false,
  toastTimer: null
};

const pageNames = {
  dashboard: "Visão geral",
  leads: "Leads e clientes",
  agents: "Agents",
  performance: "Performance",
  property: "Imóveis",
  documents: "Documentos",
  management: "Gestão da equipe",
  settings: "Configurações"
};

function icon(name, size = 16) {
  const paths = {
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    arrowUp: '<path d="m5 12 7-7 7 7M12 5v14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"/>',
    external: '<path d="M14 5h5v5M19 5l-8 8M17 13v5H6V7h5"/>',
    filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
    folder: '<path d="M4 7h6l2 2h8v9H4z"/>',
    home: '<path d="m4 11 8-7 8 7v8H4zM9 19v-5h6v5"/>',
    link: '<path d="M9 15 7 17a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M15 9l2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0M8 12h8"/>',
    message: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-3.5-.8L4 20l1.5-3.8A7.4 7.4 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7Z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    paperclip: '<path d="m20 11-7.5 7.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-7.5 7.5a2 2 0 0 1-3-3L14 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16m0 4v-4h-4"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
    send: '<path d="m21 3-7.5 18-3.5-7-7-3.5zM21 3 10 14"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sparkles: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    trend: '<path d="m4 16 5-5 3 3 7-8M15 6h4v4"/>',
    users: '<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11a3 3 0 0 0 0-6M21 20v-1a4 4 0 0 0-3-3.9"/>',
    video: '<path d="m15 10 5-3v10l-5-3zM4 6h11v12H4z"/>',
    whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/><path d="M8 9.5c.4 2.1 2.4 4.1 4.5 4.5.6.1 1.2-.2 1.5-.7l.4-.7-2-1-.7.7c-.9-.4-1.6-1.1-2-2l.7-.7-1-2-.7.4c-.5.3-.8.9-.7 1.5Z"/>'
  };
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.sparkles) + "</svg>";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function getLead(id) {
  return leads.find(function (lead) { return lead.id === Number(id); }) || leads[0];
}

function activeAgent() {
  return agents.find(function (agent) { return agent.id === state.activeAgent; }) || agents[0];
}

function syncActiveSession() {
  state.activeAgent = sessionStore.activeAgentId;
  state.activeSessionId = sessionStore.activeSessionId;
  const session = OrbitState.activeSession(sessionStore);
  state.messages = session ? session.messages : [];
}

function activeAgentSessions() {
  return sessionStore.sessions[state.activeAgent] || [];
}

function avatar(initials, tone, large) {
  return '<span class="avatar avatar-' + tone + (large ? " avatar-lg" : "") + '">' + initials + "</span>";
}

function pageHeader(eyebrow, title, subtitle, actions) {
  return '<div class="page-header"><div><div class="eyebrow">' + eyebrow + '</div><h1 class="page-title">' + title + '</h1><p class="page-subtitle">' + subtitle + '</p></div><div class="header-actions">' + (actions || "") + "</div></div>";
}

function kpiCard(label, value, trend, tone, iconText, direction) {
  return '<article class="kpi-card"><div class="kpi-top"><span>' + label + '</span><span class="kpi-icon ' + tone + '">' + iconText + '</span></div><div class="kpi-value">' + value + '</div><div class="kpi-trend ' + (direction || "") + '">' + (direction === "down" ? "↓" : "↑") + " " + trend + "</div></article>";
}

function renderDashboard() {
  return pageHeader("Segunda-feira, 20 de setembro", "Bom dia, Renato", "Aqui está o pulso da sua operação comercial hoje.", '<button class="button button-secondary" data-toast="Exportação preparada para o ambiente conectado">' + icon("download", 15) + " Exportar relatório</button><button class=\"button button-primary\" data-action=\"new-lead\">" + icon("plus", 15) + " Novo lead</button>") +
    '<div class="kpi-grid">' +
      kpiCard("Leads na carteira", "128", "12,4% este mês", "", "♙") +
      kpiCard("Em atendimento", "42", "8,1% hoje", "green", "◌") +
      kpiCard("Visitas agendadas", "16", "3 novas hoje", "orange", "⌖") +
      kpiCard("Conversão em venda", "6,4%", "1,8 p.p. este mês", "purple", "✦") +
    '</div>' +
    '<div class="grid-2-1">' +
      '<section class="card chart-card"><div class="card-header"><div><h2 class="card-title">Ritmo comercial</h2><span class="card-meta">Leads recebidos nos últimos 30 dias</span></div><div class="chart-legend"><span><i class="legend-dot"></i>Este mês</span><span><i class="legend-dot alt"></i>Mês anterior</span></div></div><div class="card-body"><div class="bar-chart">' + barChart() + '</div><div class="bar-labels"><span>22 ago</span><span>29 ago</span><span>05 set</span><span>12 set</span><span>19 set</span></div></div></section>' +
      '<section class="card"><div class="card-header"><div><h2 class="card-title">Próximos compromissos</h2><span class="card-meta">Sua agenda de hoje</span></div><button class="link-button" data-view="leads">Ver agenda ' + icon("arrow", 13) + "</button></div><div class=\"card-body\"><div class=\"agenda-list\">" +
        agendaItem("09:30", "Juliana Carvalho", "Ligação de qualificação", "message") +
        agendaItem("11:00", "Ana Paula Ribeiro", "Visita — Jardim das Águas", "home") +
        agendaItem("14:30", "Carlos Eduardo", "Retorno de documentação", "clock") +
        agendaItem("16:00", "Fernanda Lima", "Acompanhar aprovação", "check") +
      "</div></div></section>" +
    "</div>" +
    '<div class="grid-1-1" style="margin-top:18px">' +
      '<section class="card"><div class="card-header"><div><h2 class="card-title">Funil da carteira</h2><span class="card-meta">128 leads ativos</span></div><button class="link-button" data-view="leads">Abrir Kanban ' + icon("arrow", 13) + "</button></div><div class=\"card-body\"><div class=\"pipeline-strip\">" +
        pipelineStep("Novos", "24", "19%", "32%") + pipelineStep("Em contato", "42", "33%", "55%") + pipelineStep("Visitas", "16", "13%", "29%") + pipelineStep("Propostas", "8", "6%", "17%") +
      "</div></div></section>" +
      '<section class="card"><div class="card-header"><div><h2 class="card-title">Atividade recente</h2><span class="card-meta">Atualizada agora</span></div><button class="link-button" data-view="agents">Ver agents ' + icon("arrow", 13) + "</button></div><div class=\"card-body\"><div class=\"activity-list\">" +
        activityItem("JC", "purple", "<strong>Atendimento</strong> preparou uma resposta para Juliana Carvalho", "há 8 min", "✓") +
        activityItem("MS", "blue", "<strong>Marcelo Santos</strong> avançou para Em contato", "há 28 min", "↗") +
        activityItem("AR", "pink", "Visita de <strong>Ana Paula Ribeiro</strong> confirmada", "ontem, 18:42", "✓") +
      "</div></div></section>" +
    "</div>";
}

function barChart() {
  const values = [52, 66, 44, 73, 57, 82, 49, 69, 88, 61, 77, 93, 67, 81];
  return values.map(function (value, index) {
    const previous = Math.max(18, value - 26 + (index % 3) * 7);
    return '<div class="bar-group"><span class="bar alt" style="height:' + previous + '%"></span><span class="bar" style="height:' + value + '%"></span></div>';
  }).join("");
}

function agendaItem(time, name, detail, type) {
  return '<div class="agenda-item"><div class="agenda-time">' + time + '<span>hoje</span></div><div class="agenda-copy"><strong>' + name + '</strong><small>' + detail + "</small></div><span class=\"agenda-type\">" + (type === "home" ? "⌂" : type === "check" ? "✓" : type === "clock" ? "◷" : "◌") + "</span></div>";
}

function pipelineStep(name, value, percentage, width) {
  return '<div class="pipeline-step"><div class="pipeline-step-top"><span>' + name + '</span><span>' + percentage + '</span></div><strong>' + value + '</strong><div class="progress-line"><span style="width:' + width + '"></span></div></div>';
}

function activityItem(initials, tone, copy, time, status) {
  return '<div class="activity-item">' + avatar(initials, tone) + '<div class="activity-copy"><p>' + copy + '</p><small>' + time + '</small></div><span class="activity-status">' + status + "</span></div>";
}

function renderLeads() {
  const columns = [
    { id: "novo", name: "Novos", color: "#6f9bd0" },
    { id: "contato", name: "Em contato", color: "#8a6be6" },
    { id: "visita", name: "Visita agendada", color: "#e29b48" },
    { id: "proposta", name: "Proposta", color: "#38a979" }
  ];
  const selected = getLead(state.selectedLead);
  return pageHeader("Carteira comercial", "Leads e clientes", "Acompanhe cada oportunidade até a assinatura.", '<button class="button button-secondary" data-toast="Filtros salvos no protótipo">' + icon("filter", 15) + " Filtros</button><button class=\"button button-primary\" data-action=\"new-lead\">" + icon("plus", 15) + " Novo lead</button>") +
    '<div class="kanban-toolbar"><div class="table-search"><span class="search-symbol">⌕</span><input data-filter="lead" value="' + escapeHtml(state.leadQuery) + '" placeholder="Buscar por nome ou origem" /></div><div class="header-actions"><select class="select-filter"><option>Todos os corretores</option><option>Minha carteira</option></select><div class="view-toggle"><button class="active" type="button">▦</button><button type="button" data-toast="Lista em breve">☷</button></div></div></div>' +
    '<div class="kanban">' + columns.map(function (column) {
      const items = leads.filter(function (lead) { return lead.stage === column.id; });
      return '<section class="kanban-column"><div class="column-head"><div class="column-title"><i style="background:' + column.color + '"></i>' + column.name + '<span class="column-count">' + items.length + '</span></div><button class="row-action" data-toast="Ações da coluna">' + icon("more", 15) + "</button></div><div class=\"lead-stack\">" + (items.length ? items.map(leadCard).join("") : '<div class="empty-column">Nenhuma oportunidade aqui</div>') + "</div></section>";
    }).join("") + "</div>" +
    '<div class="lead-detail">' +
      '<section class="card detail-pane">' + leadDetail(selected) + "</section>" +
      '<section class="card detail-pane"><div class="card-header" style="padding:0 0 14px"><div><h2 class="card-title">Próxima ação</h2><span class="card-meta">Sugestão baseada no estágio</span></div><span class="status-tag ' + selected.scoreTone + '"><i></i>' + selected.score + '</span></div><div class="approval-banner" style="margin-top:8px"><span class="action-icon">✦</span><span>O Agent Atendimento recomenda responder hoje e confirmar se a entrada cabe no orçamento familiar.</span></div><div class="context-divider"></div><button class="context-action" data-view="agents"><span class="action-icon">✦</span>Abrir Atendimento de leads ' + icon("arrow", 13) + '</button><button class="context-action" data-toast="Follow-up criado para amanhã"><span class="action-icon">◷</span>Agendar follow-up para amanhã</button><button class="context-action" data-toast="Link de simulação copiado"><span class="action-icon">↗</span>Copiar link de simulação</button></section>' +
    "</div>";
}

function leadCard(lead) {
  return '<article class="lead-card" data-lead-card data-lead-name="' + escapeHtml(lead.name.toLowerCase()) + '" data-lead-source="' + escapeHtml(lead.source.toLowerCase()) + '" data-lead-id="' + lead.id + '"><div class="lead-card-top"><strong>' + lead.name + '</strong><span class="more">•••</span></div><p>' + lead.interest + ' · ' + lead.value + '</p><div class="lead-card-footer"><span class="lead-source"><i class="source-dot ' + lead.sourceTone + '"></i>' + lead.source + '</span><span>' + lead.last + "</span></div></article>";
}

function leadDetail(lead) {
  return [
    '<div class="detail-heading">', avatar(lead.initials, lead.tone, true), '<div><h3>', lead.name, '</h3><p>', lead.phone, ' · ', lead.email, '</p></div><span class="status-tag ', lead.scoreTone, '" style="margin-left:auto"><i></i>', lead.score, '</span></div>',
    '<div class="detail-section"><h4>Contexto do lead</h4><div class="detail-grid"><div class="detail-field"><label>Empreendimento</label><strong>', lead.interest, '</strong></div><div class="detail-field"><label>Valor estimado</label><strong>', lead.value, '</strong></div><div class="detail-field"><label>Origem</label><strong>', lead.source, '</strong></div><div class="detail-field"><label>Última interação</label><strong>', lead.last, '</strong></div></div></div>',
    '<div class="detail-section"><h4>Linha do tempo</h4><div class="timeline"><div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-copy"><strong>Lead captado via ', lead.source, '</strong><small>Interesse registrado no CRM · ', lead.last, '</small></div></div><div class="timeline-item"><span class="timeline-dot" style="background:#8a6be6;box-shadow:0 0 0 3px #f0edff"></span><div class="timeline-copy"><strong>Dados de contato validados</strong><small>Agent Atendimento identificou perfil inicial</small></div></div></div></div>'
  ].join("");
}

function renderAgents() {
  const agent = activeAgent();
  const selected = getLead(state.selectedLead);
  const messages = state.messages;
  const sessions = activeAgentSessions();
  return pageHeader("Central de inteligência", "Agents", "Converse com especialistas que conhecem seu produto, sua carteira e sua estratégia.", `<span class="status-tag success"><i></i> ${agents.length} agents online</span><button class="button button-primary" data-action="new-session">${icon("plus", 15)} Nova sessão</button>`) +
    `<div class="agent-mobile-switcher"><label for="mobileAgentSelect">Especialista ativo</label><select id="mobileAgentSelect" data-agent-select>${agents.map(function (item) { return `<option value="${item.id}"${item.id === agent.id ? " selected" : ""}>${item.name}</option>`; }).join("")}</select></div>` +
    `<div class="agents-shell"><aside class="agent-rail"><div class="agent-tabs"><button class="agent-tab active">AGENTS</button><button class="agent-tab" data-toast="Sessões disponíveis no ambiente conectado">SESSIONS</button></div><div class="agent-rail-head"><span>ESPECIALISTAS</span><div class="rail-actions"><button data-toast="Busca de agents">⌕</button><button data-toast="Catálogo de agents">+</button></div></div><div class="agent-list">${agents.map(function (item) {
      return `<button class="agent-list-item ${item.id === agent.id ? "active" : ""}" data-agent="${item.id}"><span class="agent-avatar ${item.tone}">${item.letter}</span><span class="agent-list-copy"><strong>${item.name}</strong><small>${item.short}</small></span><i class="agent-status ${item.status}"></i></button>`;
    }).join("")}</div><div class="agent-rail-footer"><strong>Ambiente do corretor</strong><br/>Sessões e contexto isolados por usuário.</div></aside>` +
    `<section class="agent-chat"><div class="chat-header"><div class="chat-agent-meta"><span class="agent-avatar ${agent.tone}">${agent.letter}</span><div><h2>${agent.name}</h2><p>Especialista online · contexto da sua carteira ativo</p></div></div><div class="chat-header-actions"><button data-toast="Compartilhar sessão">↗</button><button data-toast="Configurações do agent">⚙</button><button data-toast="Mais opções">•••</button></div></div><div class="session-strip">${sessions.map(function (session) { return `<button class="session-tab ${session.id === state.activeSessionId ? "active" : ""}" data-session="${session.id}"><i></i><span>${escapeHtml(session.title)}</span></button>`; }).join("")}<button class="session-tab new-session-tab" data-action="new-session" aria-label="Nova sessão">+</button></div><div class="chat-messages"><div class="date-divider">Hoje · 21 de setembro</div>${messages.map(function (message) { return messageBubble(message, agent); }).join("")}${state.pendingReply ? `<div class="message-row"><span class="message-avatar agent">${agent.letter}</span><div class="message-content"><div class="message-name">${agent.name} <span>agora</span></div><div class="message-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div></div></div>` : ""}</div><div class="chat-composer-wrap"><div class="quick-prompts"><button class="quick-prompt" data-prompt="Faça um resumo dos próximos leads que precisam de resposta hoje.">Resumo do dia</button><button class="quick-prompt" data-prompt="Prepare uma resposta acolhedora para a Juliana sobre entrada e parcelas.">Preparar resposta</button><button class="quick-prompt" data-prompt="Quais informações ainda faltam para uma simulação?">Checklist da simulação</button></div><div class="composer"><textarea id="agentComposer" rows="1" placeholder="Escreva uma tarefa para o agent..."></textarea><div class="composer-tools"><button data-toast="Anexos em breve">⌕</button><button data-toast="Microfone em breve">◉</button><button class="send-button" data-action="send-agent" aria-label="Enviar">${icon("send", 14)}</button></div></div><div class="composer-hint"><span>O agent orienta; a política de execução será definida pelo workspace.</span><span>Enter para enviar · Shift + Enter para nova linha</span></div></div></section>` +
    `<aside class="context-panel"><div class="context-heading"><h3>Contexto da sessão</h3><button data-toast="Painel fixado">⌁</button></div><div class="context-section"><div class="context-card"><div class="lead-context-head">${avatar(selected.initials, selected.tone)}<div><strong>${selected.name}</strong><small>Lead selecionado</small></div><span class="status-tag success" style="margin-left:auto"><i></i>Quente</span></div><div class="context-data"><div class="context-data-row"><span>Origem</span><strong>${selected.source}</strong></div><div class="context-data-row"><span>Interesse</span><strong>${selected.interest}</strong></div><div class="context-data-row"><span>Estágio</span><strong>Novos</strong></div><div class="context-data-row"><span>Último contato</span><strong>${selected.last}</strong></div></div><div class="context-divider"></div><button class="context-action" data-view="leads"><span class="action-icon">♙</span>Abrir ficha completa ${icon("external", 13)}</button></div></div><div class="context-section"><div class="context-heading" style="padding:4px 0 11px"><h3>Capacidades ativas</h3></div><div class="context-card"><span class="skill-chip"><i></i>Leitura do CRM</span><span class="skill-chip"><i></i>Roteiro de atendimento</span><span class="skill-chip"><i></i>Produto aprovado</span><span class="skill-chip"><i></i>Tom consultivo</span></div></div><div class="context-section"><div class="approval-banner"><span class="action-icon">!</span><span>Envio de WhatsApp e escrita no CRM aguardam a política do workspace.</span></div></div></aside></div>`;
}

function messageBubble(message, agent) {
  const isUser = message.role === "user";
  return `<div class="message-row ${isUser ? "user" : ""}"><span class="message-avatar ${isUser ? "user" : "agent"}">${isUser ? "RF" : agent.letter}</span><div class="message-content"><div class="message-name">${isUser ? "Você" : agent.name}<span>${message.time}</span></div><div class="message-bubble">${escapeHtml(message.text)}${message.insight ? '<div class="insight-card"><strong>Leitura rápida do contexto</strong><p>Perfil com intenção de compra alta. Priorize clareza sobre entrada, prazo e próximos passos.</p></div>' : ""}</div><div class="message-time">${isUser ? "Enviado" : "Resposta do agent"}</div></div></div>`;
}

function miniChart(color) {
  return '<svg viewBox="0 0 220 40" preserveAspectRatio="none"><path d="M0 31 C 25 34, 31 18, 50 23 S 72 27, 91 15 S 121 22, 139 11 S 166 18, 181 7 S 205 13, 220 3" fill="none" stroke="' + color + '" stroke-width="2.5"/><path d="M0 31 C 25 34, 31 18, 50 23 S 72 27, 91 15 S 121 22, 139 11 S 166 18, 181 7 S 205 13, 220 3 V40H0Z" fill="' + color + '" opacity=".08"/></svg>';
}

function renderPerformance() {
  return pageHeader("Acompanhamento", "Performance", "Veja onde a operação está acelerando e onde precisa de atenção.", '<select class="select-filter"><option>Este mês</option><option>Últimos 30 dias</option><option>Este trimestre</option></select><button class="button button-secondary" data-toast="Relatório exportado no protótipo">' + icon("download", 15) + " Exportar</button>") +
    '<div class="metric-grid"><article class="metric-card"><div class="metric-card-head"><span>Leads gerados</span><span class="kpi-trend">↑ 12,4%</span></div><strong>128</strong><div class="mini-chart">' + miniChart("#2b78ed") + "</div></article><article class=\"metric-card\"><div class=\"metric-card-head\"><span>Taxa de resposta</span><span class=\"kpi-trend\">↑ 4,8%</span></div><strong>82,6%</strong><div class=\"mini-chart\">" + miniChart("#31a979") + "</div></article><article class=\"metric-card\"><div class=\"metric-card-head\"><span>Custo por lead</span><span class=\"kpi-trend down\">↓ 8,2%</span></div><strong>R$ 18,40</strong><div class=\"mini-chart\">" + miniChart("#e2a252") + "</div></article></div>" +
    '<div class="performance-layout"><section class="card"><div class="card-header"><div><h2 class="card-title">Metas da operação</h2><span class="card-meta">Progresso da equipe no mês</span></div><span class="status-tag success"><i></i> No ritmo</span></div><div class="card-body"><div class="goal-list">' +
      goalRow("Leads captados", "128 / 180", "71%", "") + goalRow("Atendimentos", "342 / 420", "81%", "green") + goalRow("Visitas", "38 / 60", "63%", "orange") + goalRow("Propostas", "14 / 25", "56%", "") +
    '</div><div class="context-divider"></div><div class="card-header" style="padding:0 0 12px"><div><h2 class="card-title">Origem dos leads</h2><span class="card-meta">Distribuição atual</span></div></div><div class="pipeline-strip"><div class="pipeline-step"><div class="pipeline-step-top"><span>Meta Ads</span><span>58%</span></div><strong>74</strong><div class="progress-line"><span style="width:58%"></span></div></div><div class="pipeline-step"><div class="pipeline-step-top"><span>Google</span><span>24%</span></div><strong>31</strong><div class="progress-line"><span style="width:24%;background:#e6a04f"></span></div></div><div class="pipeline-step"><div class="pipeline-step-top"><span>Orgânico</span><span>18%</span></div><strong>23</strong><div class="progress-line"><span style="width:18%;background:#37aa7a"></span></div></div></div></div></section><section class="card"><div class="card-header"><div><h2 class="card-title">Destaques da equipe</h2><span class="card-meta">Conversão por corretor</span></div><button class="link-button" data-view="management">Ver equipe ' + icon("arrow", 13) + "</button></div><div class=\"card-body\"><div class=\"leaderboard\">" + leaderRow("1", "Camila Oliveira", "26 leads · 4 vendas", "15,4%", "green") + leaderRow("2", "Rafael Nunes", "22 leads · 3 vendas", "13,6%", "blue") + leaderRow("3", "Marina Costa", "19 leads · 2 vendas", "10,5%", "purple") + leaderRow("4", "João Pedro", "17 leads · 1 venda", "5,9%", "orange") + "</div></div></section></div>";
}

function goalRow(label, value, width, tone) {
  return '<div class="goal-row"><span>' + label + '</span><div class="goal-progress ' + tone + '"><span style="width:' + width + '"></span></div><strong>' + value.split("/")[0].trim() + "</strong></div>";
}

function leaderRow(rank, name, detail, result, tone) {
  return '<div class="leader-row"><span class="leader-rank">' + rank + '</span>' + avatar(name.split(" ").map(function (part) { return part[0]; }).join("").slice(0, 2), tone) + '<div class="leader-copy"><strong>' + name + '</strong><small>' + detail + '</small></div><span class="leader-result">' + result + "</span></div>";
}

function renderProperty() {
  return pageHeader("Portfólio do produto", "Imóveis", "Tenha as informações comerciais certas na hora de orientar cada cliente.", '<button class="button button-secondary" data-toast="Página compartilhada no protótipo">' + icon("external", 15) + " Abrir página pública</button>") +
    '<section class="property-hero"><div class="property-visual"><span class="property-image-label">Mockup do empreendimento</span></div><div class="property-detail"><div class="eyebrow">Empreendimento em destaque</div><h2>Residencial Horizonte</h2><p>Casas com 2 dormitórios, quintal e espaço para sua família crescer em um bairro planejado.</p><div class="property-highlights"><span>2 dormitórios</span><span>Quintal privativo</span><span>Condomínio fechado</span><span>Lazer completo</span></div><button class="button" data-toast="Modo apresentação ativado">Abrir modo apresentação ' + icon("arrow", 14) + "</button></div></section>" +
    '<div class="benefit-grid"><div class="benefit-card"><div class="benefit-icon">⌂</div><strong>Casa própria</strong><p>Informações organizadas para conduzir a conversa com segurança.</p></div><div class="benefit-card"><div class="benefit-icon">◷</div><strong>Entrada facilitada</strong><p>Consulte as condições comerciais vigentes antes de prometer valores.</p></div><div class="benefit-card"><div class="benefit-icon">▣</div><strong>Financiamento</strong><p>Material de apoio para explicar as etapas do processo.</p></div><div class="benefit-card"><div class="benefit-icon">✦</div><strong>Atendimento humano</strong><p>O agent orienta; o corretor mantém a relação com o cliente.</p></div></div>' +
    '<div class="property-info-grid"><div class="info-tile"><small>A partir de</small><strong>R$ 218.900</strong></div><div class="info-tile"><small>Entrada em até</small><strong>60x*</strong></div><div class="info-tile"><small>Disponibilidade</small><strong>Consulte</strong></div></div>';
}

function renderDocuments() {
  const actions = '<button class="button button-secondary" data-toast="Nova pasta criada no protótipo">▰ Nova pasta</button><button class="button button-primary" data-toast="Upload disponível no ambiente conectado">＋ Adicionar arquivo</button>';
  return pageHeader("Biblioteca de vendas", "Documentos", "Tudo o que você precisa para atender, apresentar e compartilhar.", actions) +
    '<div class="grid-1-1" style="margin-bottom:18px"><div class="document-folder"><span style="font-size:20px;color:#e1af41">▰</span><div><strong>Materiais aprovados</strong><small>24 arquivos · compartilhado com a equipe</small></div><button class="row-action" style="margin-left:auto">•••</button></div><div class="document-folder"><span style="font-size:20px;color:#e1af41">▰</span><div><strong>Minha carteira</strong><small>18 arquivos · somente você</small></div><button class="row-action" style="margin-left:auto">•••</button></div></div><div class="document-grid">' +
      documentCard("Tabela de condições comerciais", "PDF · Atualizado hoje", "pdf", "2,4 MB", "há 2 h") + documentCard("Apresentação Residencial Horizonte", "PPTX · Material aprovado", "pdf", "8,1 MB", "há 1 d") + documentCard("Vídeo — Tour pela casa", "MP4 · Criativo", "video", "42 MB", "há 2 d") + documentCard("Fotos oficiais do empreendimento", "ZIP · 18 imagens", "image", "31 MB", "há 3 d") + documentCard("Roteiro de primeiro atendimento", "DOCX · Agent Atendimento", "pdf", "840 KB", "há 4 d") + documentCard("Stories — Entrada facilitada", "MP4 · Instagram", "video", "12 MB", "há 5 d") +
    "</div>";
}

function documentCard(title, detail, type, size, date) {
  const symbol = type === "video" ? "▶" : type === "image" ? "▧" : "PDF";
  return '<article class="document-card"><div class="document-top"><span class="file-icon ' + type + '">' + symbol + '</span><button class="row-action" data-toast="Mais ações do arquivo">•••</button></div><h3>' + title + '</h3><p>' + detail + '</p><div class="document-meta"><span>' + size + '</span><span>' + date + "</span></div></article>";
}

function renderManagement() {
  const team = [
    ["Camila Oliveira", "CO", "24", "3", "success"],
    ["Rafael Nunes", "RN", "22", "3", "blue"],
    ["Marina Costa", "MC", "19", "2", "purple"],
    ["João Pedro", "JP", "17", "1", "orange"],
    ["Luciana Alves", "LA", "15", "1", "pink"]
  ];
  const actions = '<button class="button button-secondary" data-toast="Relatório de equipe exportado">↓ Exportar equipe</button><button class="button button-primary" data-toast="Convite de corretor preparado">＋ Convidar corretor</button>';
  return pageHeader("Visão do supervisor", "Gestão da equipe", "Acompanhe o ritmo de cada corretor e encontre onde sua liderança pode ajudar.", actions) +
    '<div class="management-summary"><div class="team-card"><div class="team-card-icon">♙</div><div><strong>18</strong><small>corretores ativos</small></div></div><div class="team-card"><div class="team-card-icon">✦</div><div><strong>74,8%</strong><small>resposta média da equipe</small></div></div><div class="team-card"><div class="team-card-icon">◒</div><div><strong>R$ 18,40</strong><small>CPL médio no mês</small></div></div></div>' +
    '<section class="card table-card"><div class="card-header"><div><h2 class="card-title">Performance individual</h2><span class="card-meta">Atualizado há 6 minutos</span></div><span class="status-tag success"><i></i> Dados mocados</span></div><div class="table-toolbar"><label class="table-search"><span class="search-symbol">⌕</span><input placeholder="Buscar corretor" /></label><select class="select-filter"><option>Todos os status</option><option>Ativos</option><option>Em atenção</option></select><button class="button button-secondary button-sm" data-toast="Filtros aplicados">' + icon("filter", 14) + " Filtrar</button></div><table class=\"data-table\"><thead><tr><th>Corretor</th><th>Leads</th><th>Resposta</th><th>Visitas</th><th>Vendas</th><th>Status</th><th></th></tr></thead><tbody>" + team.map(function (person, index) { return '<tr><td><div class="person-cell">' + avatar(person[1], person[4]) + '<div><strong>' + person[0] + '</strong><small>Corretor autônomo</small></div></div></td><td>' + person[2] + '</td><td>' + (72 + index * 4) + '%</td><td>' + (8 - Math.min(index, 3)) + '</td><td>' + person[3] + '</td><td><span class="status-tag ' + (index === 3 ? "warning" : "success") + '"><i></i>' + (index === 3 ? "Precisa de apoio" : "No ritmo") + "</span></td><td><button class=\"row-action\" data-toast=\"Abrir visão de " + person[0] + "\">•••</button></td></tr>"; }).join("") + "</tbody></table></section>";
}

function renderSettings() {
  const actions = '<button class="button button-primary" data-toast="Alterações salvas no protótipo">✓ Salvar alterações</button>';
  return pageHeader("Preferências do workspace", "Configurações", "Ajuste o ambiente do corretor e as regras de interação com os agents.", actions) +
    '<div class="grid-1-1"><section class="card detail-pane"><h2 class="card-title">Perfil e workspace</h2><p class="page-subtitle" style="margin-top:7px">Dados mocados para o protótipo navegável.</p><div class="modal-form"><div class="field"><label>Nome do workspace</label><input value="Equipe Horizonte" /></div><div class="field"><label>Nome do supervisor</label><input value="Renato Faria" /></div><div class="field"><label>Fuso horário</label><select><option>America/Sao_Paulo (UTC−03:00)</option></select></div></div></section><section class="card detail-pane"><h2 class="card-title">Regras dos Agents</h2><p class="page-subtitle" style="margin-top:7px">Definições de execução serão configuradas antes da operação real.</p><div class="context-data" style="margin-top:21px"><div class="context-data-row"><span>Mensagens de WhatsApp</span><strong class="status-tag warning">Pendente</strong></div><div class="context-data-row"><span>Alterar campanha</span><strong class="status-tag">Pendente</strong></div><div class="context-data-row"><span>Atualizar CRM</span><strong class="status-tag">Pendente</strong></div><div class="context-data-row"><span>Compartilhar arquivo</span><strong class="status-tag">Pendente</strong></div></div></section></div>';
}

function render() {
  const app = document.getElementById("app");
  const views = { dashboard: renderDashboard, leads: renderLeads, agents: renderAgents, performance: renderPerformance, property: renderProperty, documents: renderDocuments, management: renderManagement, settings: renderSettings };
  app.innerHTML = (views[state.view] || renderDashboard)();
  document.getElementById("breadcrumbCurrent").textContent = pageNames[state.view] || "Visão geral";
  document.querySelectorAll(".nav-item[data-view]").forEach(function (item) {
    item.classList.toggle("active", item.dataset.view === state.view);
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(function () { toast.classList.remove("visible"); }, 2700);
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

function showNewLeadModal() {
  document.getElementById("modalRoot").innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="newLeadTitle"><div class="modal-head"><div><h2 id="newLeadTitle">Adicionar novo lead</h2><p>Cadastre uma oportunidade na carteira mocada.</p></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div><div class="modal-form"><div class="field"><label for="newLeadName">Nome completo</label><input id="newLeadName" placeholder="Ex.: Mariana Souza" autofocus /></div><div class="field"><label for="newLeadPhone">Telefone</label><input id="newLeadPhone" placeholder="(00) 00000-0000" /></div><div class="field"><label for="newLeadSource">Origem</label><select id="newLeadSource"><option>Meta Ads</option><option>Google</option><option>Orgânico</option><option>Indicação</option></select></div><div class="field"><label for="newLeadInterest">Interesse</label><select id="newLeadInterest"><option>Residencial Horizonte</option><option>Jardim das Águas</option></select></div><div class="modal-actions"><button class="button button-secondary" data-action="close-modal">Cancelar</button><button class="button button-primary" data-action="submit-lead">Adicionar lead</button></div></div></section></div>`;
}

function submitLead() {
  const nameInput = document.getElementById("newLeadName");
  const phoneInput = document.getElementById("newLeadPhone");
  const sourceInput = document.getElementById("newLeadSource");
  const interestInput = document.getElementById("newLeadInterest");
  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Novo lead";
  const phone = phoneInput && phoneInput.value.trim() ? phoneInput.value.trim() : "Não informado";
  const source = sourceInput ? sourceInput.value : "Meta Ads";
  const interest = interestInput ? interestInput.value : "Residencial Horizonte";
  const sourceTones = { "Meta Ads": "meta", Google: "google", "Orgânico": "organic", Indicação: "referral" };
  const initials = name.split(/\s+/).slice(0, 2).map(function (part) { return part[0]; }).join("").toUpperCase();
  leads.unshift({ id: Date.now(), name: name, initials: initials, tone: "blue", source: source, sourceTone: sourceTones[source] || "meta", stage: "novo", phone: phone, email: "novo.lead@email.com", interest: interest, value: interest === "Jardim das Águas" ? "R$ 239.800" : "R$ 218.900", last: "agora", next: "Responder primeiro contato", score: "Novo", scoreTone: "warning" });
  closeModal();
  state.view = "leads";
  render();
  showToast(name + " foi adicionado à sua carteira.");
}

function createNewSession() {
  const nextNumber = activeAgentSessions().length + 1;
  OrbitState.createSession(sessionStore, state.activeAgent, "Nova sessão " + nextNumber);
  syncActiveSession();
  state.view = "agents";
  render();
  showToast("Nova sessão criada para " + activeAgent().name + ".");
}

function sendAgentMessage() {
  const composer = document.getElementById("agentComposer");
  if (!composer || !composer.value.trim() || state.pendingReply) return;
  const text = composer.value.trim();
  const targetSession = OrbitState.activeSession(sessionStore);
  if (!targetSession) return;
  targetSession.messages.push({ role: "user", time: "agora", text: text });
  state.pendingReply = true;
  syncActiveSession();
  render();
  setTimeout(function () {
    state.pendingReply = false;
    targetSession.messages.push({ role: "assistant", time: "agora", text: "Entendido. Organizei a análise em um próximo passo claro e deixei a sugestão pronta para você revisar antes de qualquer envio." });
    syncActiveSession();
    render();
  }, 1000);
}

document.addEventListener("click", function (event) {
  const viewTarget = event.target.closest("[data-view]");
  if (viewTarget) {
    event.preventDefault();
    state.view = viewTarget.dataset.view;
    if (state.view === "agents") syncActiveSession();
    render();
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
    return;
  }
  const agentTarget = event.target.closest("[data-agent]");
  if (agentTarget) {
    OrbitState.selectAgent(sessionStore, agentTarget.dataset.agent);
    syncActiveSession();
    state.view = "agents";
    render();
    return;
  }
  const sessionTarget = event.target.closest("[data-session]");
  if (sessionTarget) {
    OrbitState.selectSession(sessionStore, sessionTarget.dataset.session);
    syncActiveSession();
    state.view = "agents";
    render();
    return;
  }
  const leadTarget = event.target.closest("[data-lead-card]");
  if (leadTarget) {
    state.selectedLead = Number(leadTarget.dataset.leadId);
    render();
    return;
  }
  const promptTarget = event.target.closest("[data-prompt]");
  if (promptTarget) {
    const composer = document.getElementById("agentComposer");
    if (composer) { composer.value = promptTarget.dataset.prompt; composer.focus(); }
    return;
  }
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    const action = actionTarget.dataset.action;
    if (action === "new-lead") showNewLeadModal();
    if (action === "new-session") createNewSession();
    if (action === "close-modal") closeModal();
    if (action === "submit-lead") submitLead();
    if (action === "send-agent") sendAgentMessage();
    return;
  }
  const toastTarget = event.target.closest("[data-toast]");
  if (toastTarget) {
    showToast(toastTarget.dataset.toast);
    return;
  }
  if (event.target.matches("[data-modal-backdrop]")) closeModal();
});

document.addEventListener("input", function (event) {
  if (event.target.matches("[data-filter='lead']")) {
    const query = event.target.value.toLowerCase().trim();
    state.leadQuery = event.target.value;
    document.querySelectorAll("[data-lead-card]").forEach(function (card) {
      const match = (card.dataset.leadName + " " + card.dataset.leadSource).includes(query);
      card.style.display = match ? "" : "none";
    });
  }
});

document.addEventListener("change", function (event) {
  if (event.target.matches("[data-agent-select]")) {
    OrbitState.selectAgent(sessionStore, event.target.value);
    syncActiveSession();
    state.view = "agents";
    render();
  }
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && event.target.id === "agentComposer" && !event.shiftKey) {
    event.preventDefault();
    sendAgentMessage();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const search = document.getElementById("globalSearch");
    if (search) search.focus();
  }
  if (event.key === "Escape") closeModal();
});

document.getElementById("mobileMenu").addEventListener("click", function () {
  document.getElementById("sidebar").classList.toggle("open");
});

render();
