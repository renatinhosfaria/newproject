const assert = require("node:assert/strict");
const { createStore, selectAgent, createSession, appendMessage } = require("./state.js");

const agents = [
  { id: "atendimento", name: "Atendimento de leads" },
  { id: "trafego-pago", name: "Tráfego pago" }
];
const baseMessages = [{ role: "assistant", text: "Mensagem inicial" }];

const store = createStore(agents, baseMessages);
assert.equal(store.activeAgentId, "atendimento");
assert.equal(store.activeSessionId, "atendimento-1");
assert.equal(store.sessions.atendimento[0].messages.length, 1);

selectAgent(store, "trafego-pago");
assert.equal(store.activeAgentId, "trafego-pago");
assert.equal(store.activeSessionId, "trafego-pago-1");
assert.notEqual(store.sessions.atendimento[0].messages, store.sessions["trafego-pago"][0].messages);

const newSession = createSession(store, "trafego-pago", "Nova análise");
assert.equal(newSession.id, "trafego-pago-2");
assert.equal(store.activeSessionId, "trafego-pago-2");
assert.equal(newSession.messages.length, 0);

appendMessage(store, { role: "user", text: "Tarefa" });
assert.equal(store.sessions["trafego-pago"][1].messages[0].text, "Tarefa");

console.log("state tests passed");
