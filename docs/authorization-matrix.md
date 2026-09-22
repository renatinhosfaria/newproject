# Matriz de autorização

Esta matriz define a autorização mínima do MVP. O padrão é **negar**; uma ação só é permitida quando a sessão, o papel, o workspace e o recurso passam por todas as verificações.

## Papéis

| Papel | Escopo |
|---|---|
| `broker` | próprio perfil operacional, leads, conversas, Agents e arquivos autorizados |
| `supervisor` | gestão da equipe e visão permitida dos corretores do workspace |
| `admin` | administração do workspace e manutenção operacional, com auditoria |
| `hermes_service` | serviço interno com escopo de broker fornecido pelo Orchestrator |

## Matriz principal

Legenda: `R` leitura, `C` criação, `U` atualização, `A` aprovação, `M` manutenção administrativa, `-` negado.

| Recurso | Corretor | Supervisor | Admin | Hermes service |
|---|---:|---:|---:|---:|
| próprio usuário | R/U limitado | R | M | - |
| outro usuário | - | R | M | - |
| própria membership | R | M | M | - |
| membership de outro usuário | - | R/M conforme política | M | - |
| próprio broker | R/U limitado | R/M | M | R limitada |
| outro broker | - | R conforme política | M | - |
| próprios leads | R/C/U | R conforme política | M | R/U via ferramenta |
| leads de outro corretor | - | R agregado ou individual conforme política | M | - |
| próprias conversas | R/C | R conforme política | M | R/C via ferramenta |
| conversas de outro corretor | - | R conforme política | M | - |
| próprias mensagens | R/C | R conforme política | M | C/draft via ferramenta |
| aprovação de envio | A se política permitir | A/M | M | - |
| própria sessão de Agent | R/C/U | R conforme política | M | execução interna |
| sessão de Agent de outro corretor | - | R conforme política | M | - |
| perfil Hermes próprio | R/status | R/M | M | manutenção interna |
| perfil Hermes de outro corretor | - | R/M conforme política | M | - |
| pairing/revogação WhatsApp | C/status | M | M | execução interna |
| auditoria | próprios eventos visíveis | R | M | C de eventos |
| KPIs próprios | R | R | R | - |
| KPIs da equipe | - | R | R | - |
| documentos próprios | R/C/U | R conforme política | M | - |
| configurações do workspace | - | U limitada | M | - |

## Regras invariáveis

1. O servidor deriva `user_id`, `workspace_id`, `broker_id` e papel da sessão autenticada.
2. `broker_id` enviado pelo navegador nunca é uma fonte de autorização.
3. Toda consulta de recurso deve verificar a relação do recurso com o workspace e o broker autorizado.
4. O Hermes recebe contexto criado pelo servidor; ele não pode substituir esse contexto por texto produzido pelo usuário ou pelo lead.
5. Um `404` pode ser usado para recursos fora do escopo quando revelar a existência do recurso for sensível.
6. A autorização deve ser aplicada a lista, busca, exportação, arquivo, mensagem, evento e relatório.
7. O supervisor não recebe acesso automático a credenciais, conteúdo bruto de secrets ou diretórios do runtime.
8. Toda aprovação, envio, revogação, alteração de permissão e acesso administrativo gera auditoria.

## Capacidades dos Agents

As capacidades são uma segunda camada de autorização. O papel do usuário não concede automaticamente todas as ferramentas.

| Capacidade | Atendimento | Follow-up | Tráfego pago | Tráfego orgânico | Criativos imagem | Criativos vídeo | Performance |
|---|---:|---:|---:|---:|---:|---:|---:|
| `crm.lead.read` | ✓ | ✓ | - | - | - | - | ✓ |
| `crm.conversation.read` | ✓ | ✓ | - | - | - | - | - |
| `crm.message.draft` | ✓ | ✓ | - | - | - | - | - |
| `crm.message.approve` | - | - | - | - | - | - | - |
| `crm.metrics.read` | ✓ | ✓ | ✓ | ✓ | - | - | ✓ |
| `crm.campaign.read` | - | - | ✓ | ✓ | - | - | ✓ |
| `crm.creative.brief` | - | - | ✓ | ✓ | ✓ | ✓ | - |
| `crm.file.create` | - | - | - | - | ✓ | ✓ | - |
| `crm.lead.update` | - | - | - | - | - | - | - |
| `whatsapp.send` | - | - | - | - | - | - | - |

No MVP, `crm.message.approve`, `crm.lead.update` e `whatsapp.send` ficam sob ação explícita do usuário e política do workspace. O Agent apenas prepara rascunhos e recomendações.

## Fluxo de decisão no servidor

```text
request
  → autenticar sessão
  → carregar membership ativa
  → resolver broker permitido
  → carregar recurso e workspace
  → verificar papel
  → verificar capacidade do Agent, se aplicável
  → validar transição de estado
  → auditar mutação
  → executar
```

Esse fluxo deve ser implementado em guards/policies reutilizáveis, não repetido de forma informal em cada controller.
