(function (root, factory) {
  const api = factory();
  root.OrbitState = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createStore(agents, baseMessages) {
    const sessions = {};
    agents.forEach(function (agent) {
      sessions[agent.id] = [{
        id: agent.id + "-1",
        title: agent.id === "atendimento" ? "Juliana · primeiro contato" : "Primeiro contexto",
        messages: clone(baseMessages)
      }];
    });
    return {
      activeAgentId: agents[0].id,
      activeSessionId: agents[0].id + "-1",
      sessions: sessions
    };
  }

  function sessionsFor(store, agentId) {
    if (!store.sessions[agentId]) store.sessions[agentId] = [];
    return store.sessions[agentId];
  }

  function selectAgent(store, agentId) {
    const sessions = sessionsFor(store, agentId);
    store.activeAgentId = agentId;
    store.activeSessionId = sessions[0] ? sessions[0].id : null;
    return sessions[0] || null;
  }

  function selectSession(store, sessionId) {
    const sessions = sessionsFor(store, store.activeAgentId);
    const session = sessions.find(function (item) { return item.id === sessionId; });
    if (!session) return null;
    store.activeSessionId = session.id;
    return session;
  }

  function createSession(store, agentId, title) {
    const sessions = sessionsFor(store, agentId);
    const session = {
      id: agentId + "-" + (sessions.length + 1),
      title: title || "Novo contexto",
      messages: []
    };
    sessions.push(session);
    store.activeAgentId = agentId;
    store.activeSessionId = session.id;
    return session;
  }

  function activeSession(store) {
    return sessionsFor(store, store.activeAgentId).find(function (session) {
      return session.id === store.activeSessionId;
    }) || null;
  }

  function appendMessage(store, message) {
    const session = activeSession(store);
    if (!session) return null;
    session.messages.push(message);
    return session;
  }

  return { createStore, selectAgent, selectSession, createSession, activeSession, appendMessage };
});
