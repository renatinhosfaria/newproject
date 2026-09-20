# MVP do produto

## Objetivo

Validar, com um único corretor, o fluxo completo entre CRM, perfil Hermes, WhatsApp, agente de Atendimento e histórico de conversas.

O MVP deve provar que a solução consegue operar uma conversa real com isolamento correto do corretor antes de receber novos perfis ou módulos complexos.

## Usuários

### Corretor

- Acessa o CRM com login próprio.
- Consulta seus leads e conversas.
- Abre uma sessão com o agente Atendimento.
- Conecta seu WhatsApp ao perfil Hermes correspondente.
- Consulta o histórico das interações.

### Supervisor

- Cadastra e suspende corretores.
- Consulta o estado da conexão de cada WhatsApp.
- Visualiza conversas e eventos permitidos pela política de gestão.
- Consulta indicadores básicos do piloto.

## Escopo do MVP

- Autenticação e encerramento de sessão.
- Perfis `corretor` e `supervisor`.
- Cadastro de um corretor.
- Cadastro de leads.
- Lista de conversas.
- Tela de conversa com streaming de resposta.
- Um perfil Hermes para o corretor.
- Um processo Hermes isolado para o perfil.
- Uma conexão WhatsApp usando o bridge nativo do Hermes.
- Agente especialista de Atendimento.
- Associação entre `broker_id`, lead, conversa e perfil Hermes.
- Registro de mensagens recebidas, geradas, aprovadas e enviadas.
- Tela de status da conexão WhatsApp.
- Logs de auditoria dos eventos principais.

## Fora do escopo inicial

- Os demais agentes especialistas.
- Publicação automática de anúncios.
- Follow-up em massa.
- Geração pesada de imagem e vídeo.
- Dashboard completo de KPIs.
- Provisionamento de 20 corretores em lote.
- Integração com múltiplos VPS.
- Automação irrestrita de mensagens de saída.

## Fluxo principal

```text
Supervisor cadastra o corretor
        ↓
Sistema cria broker_id e perfil Hermes
        ↓
Corretor conecta o WhatsApp por QR Code
        ↓
Lead envia uma mensagem
        ↓
Hermes recebe a mensagem
        ↓
Agente Atendimento processa o contexto
        ↓
CRM registra a conversa
        ↓
Resposta é criada conforme o modo configurado
```

## Critérios de aceitação

1. O corretor consegue fazer login no CRM.
2. O sistema associa o corretor ao `broker_id` correto.
3. O sistema cria ou localiza o perfil Hermes correto.
4. O WhatsApp pode ser conectado e sua sessão persiste após reinicialização.
5. Uma mensagem recebida é associada ao corretor e ao lead corretos.
6. A resposta do agente aparece no CRM com streaming ou estado de processamento.
7. O histórico da conversa permanece disponível depois de reiniciar os serviços.
8. Um corretor não consegue consultar dados de outro corretor.
9. Uma falha ou desconexão de um perfil não altera o estado dos outros perfis.
10. Cada envio possui um identificador idempotente e um registro de auditoria.

## Indicadores do piloto

- Tempo para conectar um novo WhatsApp.
- Percentual de mensagens recebidas corretamente.
- Tempo entre recebimento e criação da resposta.
- Quantidade de mensagens duplicadas.
- Quantidade de desconexões e reconexões.
- Falhas de roteamento para o perfil Hermes.
- Tentativas de acesso fora do escopo do corretor.
