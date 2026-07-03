# Relatório — Cofre Central de Credenciais VerticalParts

> Gerado em 03/07/2026 — Claude Sonnet 5, a pedido de Gelson Simões.
> Escopo: centralização de credenciais no projeto `vpsistema` (Supabase) e rotação de
> tokens GitHub mortos, feita durante trabalho no Portal B2B Escamax.

---

## 1. Motivação

As credenciais de todos os projetos VerticalParts/Escamax viviam espalhadas em
arquivos `.env` e `.md` locais (`credenciais.md`, `credenciais_master.md`), sem
controle de acesso granular nem log de quem consultou o quê. Um token já havia
vazado em conversa e precisou ser revogado no passado. Decisão: centralizar em um
cofre único, com acesso segmentado por projeto e trilha de auditoria.

---

## 2. O que foi construído

**Local**: projeto Supabase `vpsistema` (ref `ubdkoqxfwcraftesgmbw`), schema
`credentials` — não exposto via PostgREST, só acessível por conexão Postgres direta.

| Objeto | Função |
|---|---|
| `vault.secrets` / `vault.decrypted_secrets` | Armazenamento criptografado nativo (Supabase Vault / `pgsodium`) |
| `credentials.registry` | Metadados: projeto, chave, ambiente, data de rotação, `is_active` |
| `credentials.access_log` | Auditoria de toda tentativa de leitura (sucesso ou negada) |
| `credentials.set_secret(projeto, chave, valor, descrição)` | Escrita/rotação — só via acesso direto `postgres`, nenhum papel de serviço tem `EXECUTE` |
| `credentials.get_secret(projeto, chave)` | Gateway único de leitura — cada papel só lê o que é do seu próprio projeto |

**16 papéis de serviço** criados (`svc_escamax`, `svc_pv360`, `svc_vprequisicoes`,
`svc_vpprd`, `svc_propostas`, `svc_bdomie`, `svc_vpproject`, `svc_livetv`,
`svc_vpclick`, `svc_vpsuprimentos`, `svc_vpcatraca`, `svc_visitasbrindes`,
`svc_sharedtools`, `svc_infrahostinger`, `svc_humans`, `svc_vpsistema`) — cada um só
pode executar `get_secret` para o seu projeto, sem acesso direto às tabelas.

**95 credenciais migradas** do `credenciais_master.md`, distribuídas por projeto:

| Projeto | Qtde |
|---|---|
| escamax | 20 |
| sharedtools | 12 |
| infrahostinger | 9 |
| pv360 | 9 |
| humans | 7 |
| vprequisicoes | 6 |
| vpprd | 5 |
| vpproject | 5 |
| bdomie | 4 |
| livetv | 4 |
| propostas | 4 |
| vpsistema | 4 |
| vpclick | 3 |
| vpcatraca | 1 |
| visitasbrindes | 1 |
| vpsuprimentos | 1 |

---

## 3. Testes de validação realizados

Conexão Postgres direta (`db.ubdkoqxfwcraftesgmbw.supabase.co:5432`) autenticando
como cada papel, sem passar pelo PostgREST:

- ✅ `svc_escamax` lê seus próprios segredos (`get_secret('escamax', 'JWT_SECRET')`)
- ✅ `svc_escamax` **não** consegue ler segredos do `pv360` — retorna `NULL`
- ✅ Tentativa negada fica registrada em `credentials.access_log` com
  `reason = 'role mismatch'` (bug de design corrigido: a versão inicial usava
  `raise exception`, que desfazia a transação e apagava esse registro do log — hoje
  a função retorna `NULL` e o log persiste)
- ✅ Nenhum papel de serviço consegue `SELECT` direto em `credentials.registry` ou
  `credentials.access_log` (`permission denied for table registry`)

---

## 4. Webhook novo (contexto do trabalho no Escamax, também documentado no cofre)

Endpoint `POST /api/webhooks/sac/entrega-confirmada` no backend do Portal Escamax:
quando o SAC Pós-Venda 360 confirma a entrega física da mercadoria (campo
`data_entrega_real`), a Edge Function `pv360-delivery-event` chama esse webhook e o
faturamento é liberado automaticamente no Omie — sem confirmação manual do lado
Escamax. Secret compartilhado (`ESCAMAX_WEBHOOK_SECRET` / `SAC_DELIVERY_WEBHOOK_SECRET`)
também migrado para o cofre, em `escamax` e `pv360`.

Pendência: publicar o backend Escamax numa URL pública e configurar
`ESCAMAX_WEBHOOK_URL` nos secrets do projeto Supabase pv360 (`jkbklzlbhhfnamaeislb`).

---

## 5. Tokens GitHub — detecção e rotação

Durante a migração, dois tokens do `credenciais_master.md` foram testados e
confirmados **mortos** (401 Unauthorized, sem headers de rate-limit — descarta
instabilidade passageira):

- `vpsistema / GitHub MCP` (antigo `ghp_QdEpVCKR...`)
- `MCP Claude — todos os projetos (org)` (antigo `ghp_cOWVDvpf...`)

Ambos foram marcados `is_active = false` no cofre (histórico preservado) e riscados
no `credenciais_master.md`, com aviso de que gerar tokens novos é ação humana (GitHub
não permite criar PAT via API).

Gelson gerou um token novo (`ghp_b71XJf...`), confirmado funcionando em
`001_vpsistema`, `004_sac_posvenda360` e `011_EscamaxCompra` — substitui os dois
mortos. Rotacionado no cofre (`sharedtools.GITHUB_PAT_CLASSIC_FULLORG` e
`vpsistema.GITHUB_TOKEN`, ambos `is_active = true` novamente).

**Observação de segurança pendente**: o token novo tem escopos muito mais amplos do
que o necessário para automação (`admin:org`, `admin:enterprise`, `delete_repo`,
`admin:org_hook`). Um token de MCP/automação só precisa do escopo `repo`. Recomenda-se
gerar um substituto com escopo mínimo quando possível.

---

## 6. Documentação criada

- `Instruções/COFRE_CREDENCIAIS.md` (neste repositório) — tutorial completo de como
  consumir, rotacionar e adicionar projetos ao cofre. **Não contém valores reais de
  credenciais**, só estrutura e instruções.
- Este relatório (`relatorios/__relatorio.md`).
- `credenciais_master.md` atualizado com changelog de tudo isso (arquivo local,
  fora do GitHub, em
  `C:\Users\gelso\VerticalParts\01_Gelson_Simoes\03_Credenciais_e_Chaves\CredenciaisMD\`).

---

## 7. Pendências

| Item | Responsável |
|---|---|
| Entregar as 16 senhas dos papéis `svc_*` a cada time, fora deste canal | Gelson |
| Publicar backend Escamax em URL pública + configurar `ESCAMAX_WEBHOOK_URL` no pv360 | A definir |
| Gerar token GitHub com escopo mínimo (`repo`) substituindo o atual (muito amplo) | Gelson |
| `verticalpartsIA/vpsistema` → renomeado para `verticalpartsIA/001_vpsistema`; atualizar referências antigas quando conveniente | — |
