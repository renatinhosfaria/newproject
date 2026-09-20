# Modelo de segurança e isolamento

## Princípio central

O `broker_id` é a fronteira lógica de dados no CRM. A identidade do corretor deve vir da sessão autenticada e nunca de um campo enviado pelo navegador ou de uma instrução escrita ao agente.

## Papéis

### Corretor

Pode acessar apenas:

- o próprio perfil;
- os próprios leads;
- as próprias conversas;
- os próprios arquivos;
- os agentes liberados para sua função.

### Supervisor

Pode acessar os dados da equipe conforme sua permissão, incluindo indicadores, estados de conexão e registros de auditoria.

### Serviço Hermes

Não recebe acesso irrestrito ao banco. Ele utiliza uma camada de ferramentas da CRM API com escopo explícito:

```text
broker_id = obtido no servidor
lead_id   = validado pela CRM API
action    = permitida pela função do agente
```

## Isolamento por perfil Hermes

Cada runtime deve possuir:

- diretório de estado separado;
- sessão WhatsApp separada;
- arquivo de configuração separado;
- credenciais separadas;
- API key separada;
- volume e logs separados;
- processo ou container separado.

Uma sessão não pode ser reutilizada por dois corretores.

## Autorização

Todas as rotas da CRM API devem validar:

1. identidade do usuário;
2. função do usuário;
3. `broker_id` permitido;
4. recurso solicitado;
5. ação permitida.

Filtros de `broker_id` devem ser aplicados no servidor, inclusive para buscas, exportações, arquivos, mensagens e relatórios.

## Segredos

Segredos que precisam de proteção:

- sessão do WhatsApp;
- API key do Hermes;
- credenciais de provedores de modelo;
- credenciais do banco;
- tokens de armazenamento;
- chaves de assinatura de eventos.

Eles não devem aparecer em prompts, respostas, logs comuns, banco de dados de mensagens ou frontend.

## WhatsApp bridge

O diretório de sessão do bridge contém credenciais completas da conta. Deve ser montado em volume persistente com acesso restrito ao processo do perfil correspondente. O número usado pelo bot deve ser dedicado à operação.

Controles mínimos:

- backup criptografado;
- permissões restritas no volume;
- logs sem conteúdo desnecessário de mensagens;
- monitoramento de desconexão;
- reconexão controlada;
- possibilidade de revogar a sessão pelo supervisor;
- retenção definida para conversas e logs.

## Ferramentas dos agentes

Cada agente deve possuir uma lista de capacidades permitidas. Exemplos:

```text
atendimento:
  crm.lead.read
  crm.conversation.read
  crm.conversation.draft

analise_desempenho:
  crm.metrics.read

trafego_pago:
  crm.campaign.read
  crm.campaign.analysis
```

O MVP deve começar com leitura e geração de rascunhos. Envio de mensagens e outras mutações devem passar por uma permissão explícita e por auditoria.

## Auditoria

Registrar:

- login e logout;
- alteração de permissões;
- conexão e desconexão do WhatsApp;
- seleção de agente;
- chamada de ferramenta;
- criação e aprovação de mensagem;
- envio e falha de envio;
- alteração de lead;
- acesso de supervisor a dados de corretor.

## Resposta a incidentes

O supervisor deve conseguir:

- suspender o usuário;
- bloquear o perfil Hermes;
- parar o gateway correspondente;
- revogar a sessão WhatsApp;
- impedir novos envios;
- preservar o histórico para auditoria.
