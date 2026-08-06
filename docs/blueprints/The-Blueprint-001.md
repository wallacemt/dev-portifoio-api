# The Blueprint-001 — Tradução Pré-Computada (Worker + Conteúdo Traduzido em Banco)

## Metadata
- Projeto:            portifolio-backend (`wallacemt/dev-portifoio-api`)
- Data:               2026-08-05
- Arquiteto:          Morpheus Agent
- Versão do Blueprint: v2 (Q-01, Q-02 e Q-03 resolvidas pelo owner em 2026-08-05)
- Status:             **Approved** — pronto para implementação

---

## 1. Contexto e Objetivo

Hoje toda troca de idioma no portfólio dispara uma chamada de LLM ao vivo. O visitante
espera a resposta do OpenRouter antes de ver a página. O objetivo declarado é tornar a
troca de idioma "bem mais rápida e dinâmica".

A leitura do código revelou que o problema **não é um problema só**. Ele se decompõe em
três buckets com soluções radicalmente diferentes de custo e complexidade:

**Bucket A — texto de UI estático (a maior fatia).**
Os payloads enviados ao LLM não são entidades do banco: são *view models* montados nos
services, e boa parte deles é literal hardcoded no código-fonte:

- `projectService.ts:58` → `texts: { title: "Meus Projetos", description: "..." }`
- `projectService.ts:75-96` → `"Descrição"`, `"Tecnologias"`, `"Links do Projeto"`,
  `"Backend"`, `"Frontend"`, `"Deployment"`, `"Habilidades Utilizadas"`, `"Ver Projeto"`,
  `"Mais Recente"`
- `formationService.ts:14-29` → `"Formação Acadêmica"`, `"Cursando"`, `"Ver certificado"`,
  `"Concluido"`, `"Formações"`, `"Horas de Estudo"`, `"Instituição"`, `"Certificados"`
- `skillService.ts:34` → `"Filtre por uma Stack"`, `"Minhas Habilidades"`, ...
- `utilisService.ts:11-33` → navbar inteira (`"Início"`, `"Projetos"`, ...)
- idem em `badgeService`, `certificationService`, `servicesOwnerService`

Essas strings **só mudam quando alguém faz deploy**. Traduzi-las via LLM em runtime, em 7
idiomas, para sempre chegar ao mesmo resultado, é desperdício puro de quota e de latência.
Elas não pertencem nem ao worker, nem ao banco: pertencem a arquivos de locale versionados.

**Bucket B — conteúdo do owner no banco (a fatia que realmente precisa de LLM).**
`project.title/description`, `skill.title`, `formation.title/institution/description`,
`badge.title/description/issuer`, `certification.title/description/issuer`,
`owner.about/occupation`. Isso sim é dinâmico e é o alvo legítimo do worker + pré-tradução.
Volume real: ordem de ~80 registros × 7 idiomas.

**Bucket C — dados que nunca deveriam ir ao LLM, mas vão hoje.**
`techs` (slugs em lowercase: `react`, `nodejs`), URLs (`deployment`, `backend`, `frontend`,
`credentialUrl`, `screenshots`, `previewImage`), IDs, `videos`, datas — e o pior caso,
`project.lastUpdateText` (`projectService.ts:99`), que é uma **data já formatada em pt-BR**
concatenada numa string (`"Ultima Atualização 3 de março de 2026"`). Além do custo de
tokens e do risco do modelo corromper uma URL, esse campo tem um efeito colateral grave
descrito na seção 17.

A decomposição acima é a arquitetura. Ela remove a maior parte da superfície de LLM
**antes** de qualquer worker existir.

### Escopo
Backend apenas. O frontend (`portifolio-ws`) continua chamando `?language=xx` exatamente
como hoje — o contrato HTTP não muda. Nenhuma mudança é exigida no frontend para colher o
ganho de latência.

---

## 2. Requisitos

### Funcionais
- **RF-01** — Textos de UI estáticos são servidos a partir de locales versionados no repo,
  sem chamada de LLM, em qualquer idioma suportado.
- **RF-02** — Conteúdo do owner é servido já traduzido, lido do banco, sem chamada de LLM
  no caminho da requisição do visitante.
- **RF-03** — Criar ou editar conteúdo do owner marca aquele registro como "precisa
  retraduzir" para todos os idiomas configurados.
- **RF-04** — O worker traduz somente registros cujo conteúdo traduzível de fato mudou.
  Alterar um campo não-traduzível (ex.: `previewImage`, `deployment`) não deve gastar quota.
- **RF-05** — O worker roda na mesma codebase, com entrypoint/comando de start próprio.
- **RF-06** — Deletar um registro remove suas traduções.
- **RF-07** — Existe um comando de backfill para popular traduções do conteúdo que já existe
  hoje no banco.
- **RF-08** — Quando a tradução de um registro ainda não existe, a API serve o conteúdo
  original em pt (degradação graciosa), nunca um erro nem uma espera.

### Não-funcionais
- **RNF-01** — Latência de `GET` traduzido: o mesmo custo de uma consulta normal + uma
  consulta à coleção de traduções. Sem I/O de rede externa no caminho de leitura.
- **RNF-02** — O consumo total de OpenRouter dos **dois** processos somados respeita o teto
  diário único da conta, que é **configurável por variável de ambiente** (ADR-07), com
  default `45` — o valor hoje hardcoded em `quotaManager.ts:25`.
- **RNF-07** — Nenhuma requisição de visitante pode bloquear esperando LLM, em nenhum
  cenário (ADR-05). Restrição dura, sem escape configurável.
- **RNF-03** — A API continua funcionando sem `REDIS_URL`, como hoje.
- **RNF-04** — O worker é reiniciável a qualquer momento sem perder nem duplicar trabalho.
- **RNF-05** — Nenhuma dependência nova de runtime, salvo justificativa explícita em ADR.
- **RNF-06** — Single-tenant. Um owner. Nenhuma modelagem multi-tenant.

---

## 3. Architecture Decisions (ADRs)

### ADR-01 — Separar texto de UI estático da tradução por LLM
- **Contexto:** boa parte dos bytes enviados ao LLM hoje é literal hardcoded que nunca muda
  em runtime (ver seção 1, Bucket A). Ainda assim, cada combinação de filtro/página gera
  uma chave de cache nova e portanto uma chamada nova, retraduzindo as mesmas strings.
- **Opções:**
  - (A) Deixar como está e resolver tudo no worker — o worker passaria a pré-traduzir
    também strings estáticas, precisando de um "registro sintético" no banco para cada
    bloco de `texts`. Complexidade sem retorno: o resultado é determinístico e conhecido em
    tempo de deploy.
  - (B) Extrair os literais para `src/i18n/<lang>.json`, versionados. Tradução feita uma vez
    (script pontual ou manualmente), revisável em code review, servida por lookup de objeto.
  - (C) Adicionar uma lib de i18n (i18next e similares) — resolve pluralização, interpolação,
    namespaces, ICU. Nada disso é necessário aqui: são objetos JSON planos servidos inteiros.
- **Decisão:** (B). Arquivos JSON por idioma + uma função de lookup. Sem dependência nova.
- **Consequências:** elimina a maior fatia da latência e do gasto de quota imediatamente,
  e sem risco (o resultado é fixo, revisável, e não depende de um modelo `:free` acertar o
  formato). Custo: adicionar um texto de UI novo passa a exigir editar 8 arquivos. É um
  custo aceitável e visível em code review — melhor do que uma tradução silenciosamente
  divergente a cada requisição. Um teste garante que todos os locales têm as mesmas chaves.

### ADR-02 — Não adotar BullMQ; a própria tabela de tradução é a fila
- **Contexto:** a requisição é "enfileirar job ao editar". A escolha natural seria BullMQ
  (verificado via context7 em 2026-08-05: **v6.0.8**, ativo, sólido), já que `ioredis` está
  instalado e `getRedisClient()` existe.
- **Volume real:** o owner é uma pessoa editando o próprio portfólio. Escritas na casa de
  poucas por semana. Um job por registro por idioma. Nenhuma concorrência, nenhum
  fan-out, nenhuma prioridade, nenhum throughput a defender.
- **Opções:**
  - (A) **BullMQ.** Ganha: retry com backoff, DLQ, agendamento, concorrência, Bull Board.
    Custo: dependência nova; e — o ponto decisivo — **torna Redis obrigatório**. Hoje Redis
    é opcional com fallback gracioso deliberado (`redisClient.ts:13`, `permanentlyFailed`).
    Tornar a fila BullMQ o único caminho de tradução significa: sem Redis, o conteúdo nunca
    é traduzido, silenciosamente. Isso é uma regressão de deployability em troca de features
    que 5 jobs/semana não usam.
  - (B) **Coleção `translation` com campo `status`, worker faz poll.** O *estado* da tradução
    é a fila. `status: "pending"` é o job. Retry = a linha continua `pending` com
    `attempts++`. Idempotência = índice único `(entity, entityId, language)`. Sobrevive a
    crash porque o estado está no Mongo, não na memória do processo. Funciona com ou sem
    Redis. Custo: ~40 linhas; poll a cada 30s desperdiça uma query barata quando ocioso.
  - (C) **Tradução síncrona no próprio request de escrita** (sem worker). Faria o
    `PUT /project/:id/update` do owner esperar 7 chamadas de LLM — dezenas de segundos,
    provavelmente timeout de proxy. Descartado.
- **Decisão:** **(B)**. Sem BullMQ.
- **Consequências:** zero dependência nova, Redis segue opcional para a API, e o estado de
  tradução é inspecionável com uma query no Mongo (não num inspetor de fila). Perde-se
  backoff sofisticado e observabilidade de fila pronta — substituídos por `attempts` +
  `lastError` na própria linha, que é o que se olharia de qualquer forma. Latência de
  enfileiramento até 30s: irrelevante para conteúdo de portfólio.
  **Gatilho de revisão:** se isto virar multi-tenant, ou se a taxa de escrita passar de
  ~dezenas por minuto, ou se surgir necessidade de jobs agendados/encadeados → migrar para
  BullMQ. A interface `enqueueTranslation()` isola essa troca em um único arquivo.

### ADR-03 — Granularidade por registro, não por campo
- **Contexto:** o requisito diz "traduzir SOMENTE o que mudou".
- **Opções:**
  - (A) Delta por campo: hash por campo, retraduz só o campo alterado.
  - (B) Delta por registro: hash do *subconjunto traduzível* do registro; se mudou, retraduz
    aquele registro inteiro naquele idioma.
- **Decisão:** (B).
- **Consequências:** um `project` tem 2 campos traduzíveis (`title`, `description`).
  Retraduzir os dois custa **uma** chamada de LLM — exatamente o mesmo que retraduzir um só,
  porque o custo é por chamada, não por campo. O delta por campo adicionaria bookkeeping por
  campo para economizar zero chamadas. A economia real vem de um lugar diferente: o hash
  cobre **apenas os campos traduzíveis**, então editar `previewImage` ou `deployment` produz
  hash idêntico e **não gera job nenhum** — que é o espírito do requisito RF-04.

### ADR-04 — Quota compartilhada via Redis; worker exige Redis
- **Contexto:** `QuotaManager` (`quotaManager.ts:14`) é uma classe com estado **estático em
  memória**. Requisito RF-05 introduz um segundo processo. Dois processos = dois contadores
  independentes = até 90 requisições/dia contra um teto de conta **único** de 45. O worker,
  sozinho, faria o caminho on-demand estourar o limite da conta sem nunca ver isso no seu
  próprio contador.
- **Opções:**
  - (A) Contador em Redis (`INCR` + `EXPIRE` na virada do dia), compartilhado.
  - (B) Contador no Mongo — mais uma escrita por chamada de LLM, sem ganho sobre (A) num
    projeto que já tem Redis disponível.
  - (C) Dividir o teto estaticamente entre os processos (ex.: 25/20) sem coordenação — não
    resolve, só torna o estouro menos provável, e desperdiça budget quando um lado está ocioso.
- **Decisão:** (A). O contador diário migra para Redis, com fallback em memória preservado
  **apenas para o processo da API**. **O worker recusa-se a iniciar sem `REDIS_URL`** e
  encerra com mensagem explícita. Além disso o worker recebe um sub-teto próprio
  (`WORKER_DAILY_BUDGET`, default 25 das 45) para nunca deixar o caminho on-demand a zero.
- **Consequências:** fronteira limpa — Redis segue opcional para a API (RNF-03), obrigatório
  para o worker. Sem Redis o sistema degrada exatamente para o comportamento de hoje, o que
  é aceitável e explícito. Este é o item **mais crítico** do blueprint: implementar o worker
  sem ele quebra o teto de gasto da conta OpenRouter.

### ADR-05 — Sem fallback de tradução síncrona no caminho de leitura — **CONFIRMADO pelo owner**
- **Contexto:** quando a tradução de um registro ainda não existe (recém-criado, worker
  parado, quota esgotada), o que a API responde?
- **Opções:**
  - (A) Chamar `translateObject` ao vivo naquele request — o comportamento atual.
  - (B) Servir o conteúdo original em pt-BR e garantir que o registro está `pending`.
- **Decisão:** **(B), decidido pelo owner em 2026-08-05.** A regra é absoluta: **nenhuma
  requisição de visitante espera por LLM, em nenhuma circunstância.** Não há flag, env var
  nem modo de configuração que reative tradução síncrona no caminho de leitura — essa porta
  fica fechada por desenho.
- **Justificativa do owner:** loading longo gera evasão e prejudica SEO. Um crawler do Google
  que bate numa página esperando 5-15s por LLM registra isso como página lenta; e com o teto
  diário de quota, uma varredura em 7 idiomas drenaria o orçamento inteiro do dia produzindo
  exatamente a experiência ruim que se queria evitar.
- **Consequências:** (A) reintroduziria a latência que este blueprint existe para eliminar,
  no pior momento possível — cold start, quando *nada* está traduzido. Com (B), o pior caso
  é o visitante ver o conteúdo do owner em pt-BR por um ciclo de poll, enquanto **todos os
  labels de UI já aparecem no idioma correto** (ADR-01, servidos de arquivo, sem LLM). O cold
  start é resolvido de forma controlada pelo backfill (RF-07), não por acaso na cara do
  primeiro visitante. `applyTranslations` nunca chama `TranslationService`; essa restrição é
  verificável e está coberta por AC-15.

### ADR-06 — `TranslationService` é reaproveitado, não reescrito
- **Contexto:** `aiService.ts` já resolve os problemas difíceis: chunking por tamanho
  (`chunkObject`), retry com backoff, `extractJsonFromText` tolerante, `validateTranslationShape`
  para detectar quando o modelo devolve estrutura errada, dedupe de in-flight, cache Redis de
  30 dias, resolução de modelo do owner. Isso é a parte cara e testada.
- **Decisão:** o worker **importa e usa `TranslationService.translateObject`** como está. Não
  há segundo cliente de LLM. O que muda é *quem chama e quando*, não *como se traduz*.
- **Consequências:** superfície de mudança em `aiService.ts` praticamente nula (só a troca do
  `QuotaManager` por sua versão Redis, que é interna). O `TranslationCache` de 30 dias
  continua útil: se o mesmo texto reaparecer, nem o worker gasta chamada.

### ADR-07 — Teto de quota configurável por variável de ambiente
- **Contexto:** `MAX_DAILY_REQUESTS = 45` é uma constante privada hardcoded
  (`quotaManager.ts:25`). O comentário no próprio arquivo explica por quê o número é esse: o
  teto do free-tier do OpenRouter depende do crédito da conta (~50/dia abaixo de US$10,
  ~1000/dia acima). Ou seja, **o número certo muda por razões externas ao código** — adicionar
  crédito à conta não deveria exigir editar código-fonte, buildar e redeployar.
  Isso vale duplamente para o backfill inicial (~560 chamadas), cuja duração é inteiramente
  função desse teto.
- **Decisão:** `MAX_DAILY_REQUESTS` e `WORKER_DAILY_BUDGET` passam a vir de `env.ts`, com os
  valores atuais como default (`45` e `25`), validados por Zod como inteiros positivos.
  A constante hardcoded deixa de existir.
- **Consequências:** o owner ajusta o teto mexendo no ambiente e reiniciando os containers —
  sem tocar em código, sem PR, sem build. Isso torna a estratégia de backfill um botão
  operacional em vez de uma decisão de arquitetura: adicionou crédito, sobe o teto, o backfill
  termina em um dia; não adicionou, deixa no default e o conteúdo vai sendo traduzido
  gradualmente (com pt-BR servido no intervalo, por ADR-05).
  **Nota honesta:** variável de ambiente ainda exige *restart* do processo (não é hot-reload),
  mas não exige rebuild nem redeploy de código — que era o custo que se queria eliminar.
  **Validação necessária:** `WORKER_DAILY_BUDGET` precisa ser rejeitado no boot se for maior
  ou igual a `MAX_DAILY_REQUESTS`; caso contrário o sub-teto do worker deixa de proteger o
  caminho on-demand e o ADR-04 perde o efeito. Isso é falha de boot, não warning.

---

## 4. Stack

Nenhuma dependência nova. Todas as versões abaixo verificadas em **2026-08-05**.

| Camada | Tecnologia | Versão no projeto | Última estável | Ação |
|---|---|---|---|---|
| Runtime | Bun | conforme `oven/bun:canary-alpine` | — | mantém |
| ORM | Prisma / @prisma/client | `^6.11.1` / `^6.10.1` | 7.9.1 | **mantém na 6.x** — upgrade major é decisão separada, fora deste escopo |
| Redis | ioredis | `^5.10.1` | 6.0.0 | mantém na 5.x |
| Fila | — | — | (BullMQ 6.0.8 avaliado) | **não adotada** — ver ADR-02 |
| HTTP | Express | `^5.1.0` | — | mantém |
| LLM | OpenRouter via `fetch` nativo | — | — | mantém |

---

## 5. Estrutura de Diretórios

```
src/
  i18n/
    index.ts                  # getUiTexts(namespace, lang) — lookup + fallback pt
    pt.json                   # fonte da verdade (extraído dos services atuais)
    en.json  es.json  fr.json
    ja.json  ko.json  zh.json  it.json
    locales.test.ts           # todos os locales têm exatamente as mesmas chaves

  translation/                # tudo de tradução de conteúdo, num lugar só
    translatableFields.ts     # o mapa entidade -> campos traduzíveis (fonte da verdade)
    translationRepository.ts  # acesso à coleção `translation`
    enqueueTranslation.ts     # marca registro como pending (chamado pelos services)
    applyTranslations.ts      # merge de traduções sobre entidades, no caminho de leitura
    worker.ts                 # loop de poll + processamento de um job
    backfill.ts               # varre tudo e enfileira (RF-07)

  worker-entry.ts             # entrypoint do processo worker (novo comando de start)

  utils/
    quotaManager.ts           # MODIFICADO: contador diário passa a viver no Redis
```

---

## 6. Componentes e Responsabilidades

### `src/i18n/`
Serve blocos de texto de UI por idioma. Não sabe nada de banco, LLM ou entidades. Se o
idioma pedido não existe, devolve `pt`. Substitui os literais hardcoded nos services.

### `translatableFields.ts`
Declara, por entidade, **quais campos são texto livre traduzível**. É a fonte da verdade
usada por três consumidores: o cálculo do hash, o payload enviado ao LLM, e o merge na
leitura. Um campo que não está aqui nunca é enviado ao LLM e nunca influencia o hash — é
assim que RF-04 e o Bucket C são resolvidos de uma vez.

```ts
// ILUSTRATIVO — referência para o Neo Agent
export const TRANSLATABLE = {
  project:       ["title", "description"],
  skill:         ["title"],                 // `stack`/`type` são enums; `image` é URL
  formation:     ["title", "institution", "description"],
  badge:         ["title", "description", "issuer"],
  certification: ["title", "description", "issuer"],
  owner:         ["about", "occupation"],   // `name` é nome próprio — não traduzir
  service:       ["title", "description", "category", "complexity", "deliveryTime"],
} as const;
```

Fora da lista, e portanto nunca traduzidos: `techs`, `technologies`, `subSkils`,
`screenshots`, `videos`, `previewImage`, `image`, `imageUrl`, `badgeImageUrl`,
`certificateFile`, `deployment`, `backend`, `frontend`, `credentialUrl`, `certificationUrl`,
`badgeUrl`, `cvLinkPT`, `cvLinkEN`, `email`, `credentialId`, `sId`, todos os `id`/`ownerId`,
todas as datas, `workload`, `priceMin`/`priceMax`, `currency`, `concluded`, `activate`.

`skill.stack` e `skill.type` (e `formation.type`) são valores enumerados que a UI usa para
filtrar — traduzi-los quebra o filtro. Se precisarem aparecer traduzidos, o lugar disso é
o dicionário de UI (ADR-01), indexado pelo valor do enum, não o LLM.

### `enqueueTranslation.ts`
Uma função. Chamada pelos services do owner após create/update/delete. Calcula o hash do
subconjunto traduzível e faz upsert das linhas `translation` para cada idioma alvo, marcando
`pending` **apenas quando o hash difere** do já gravado. É o único ponto de escrita da fila.

### `worker.ts`
Loop: acorda, pega um lote de `pending` (ordenado por `updatedAt`), e para cada um: checa
quota compartilhada, chama `TranslationService.translateObject` com o payload dos campos
traduzíveis, grava `fields` + `status: "done"`, dorme. Sem estado em memória entre ciclos.

### `applyTranslations.ts`
No caminho de leitura: dado um array de entidades e um idioma, busca as traduções `done`
correspondentes em **uma** query e sobrepõe os campos. Entidade sem tradução passa
intocada (RF-08). É a única mudança nos services de leitura.

### `worker-entry.ts`
Valida `REDIS_URL` (ADR-04), sobe o loop, registra handlers de `SIGTERM`/`SIGINT` para
terminar o job corrente antes de sair. Aceita `--backfill` para rodar o backfill e encerrar.

---

## 7. Modelo de Dados

Uma coleção nova. Nenhuma alteração nos models existentes.

```prisma
// ILUSTRATIVO — referência para o Neo Agent
model translation {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  entity     String   // "project" | "skill" | "formation" | "badge" | "certification" | "owner" | "service"
  entityId   String   // id do registro de origem
  language   String   // "en" | "es" | "fr" | "ja" | "ko" | "zh" | "it"
  fields     Json     // { title: "...", description: "..." } — só campos traduzíveis
  sourceHash String   // sha256 do subconjunto traduzível em pt
  status     String   @default("pending") // "pending" | "done" | "failed"
  attempts   Int      @default(0)
  lastError  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([entity, entityId, language])
  @@index([status, updatedAt])
}
```

- **`@@unique([entity, entityId, language])`** é o que garante idempotência: um crash no meio
  de um lote nunca duplica linhas, e o upsert de enfileiramento é seguro sob concorrência.
- **`sourceHash`** é o mecanismo de delta inteiro (ADR-03). Comparação de string, sem
  diffing de objeto.
- **`fields` como `Json`** e não colunas fixas: cada entidade tem um conjunto diferente de
  campos traduzíveis, e ele muda quando `TRANSLATABLE` muda. Colunas fixas exigiriam
  migração de documentos a cada campo novo — e este é um Mongo sem migrations SQL.
- Sem relação Prisma para as entidades: são 7 tipos-alvo diferentes; relação polimórfica não
  existe no Prisma. `entity` + `entityId` é o acoplamento correto aqui. Consequência aceita:
  não há cascade delete do banco — a limpeza é explícita (seção 14, Fase 4).

**Índice `[status, updatedAt]`** serve exatamente à query do worker (`status: "pending"`,
ordenado). É o único padrão de acesso quente da coleção.

`db push` aplica isso sem script de migração — a coleção é nova, nenhum documento existente
é tocado.

---

## 8. Contratos / Interfaces

**Contrato HTTP: inalterado.** Todos os `GET ...?language=en` continuam devolvendo a mesma
forma de payload. O frontend não muda. Muda só de onde o texto vem e quanto tempo demora.

```ts
// ILUSTRATIVO — referência para o Neo Agent

// src/i18n/index.ts
export function getUiTexts<T>(namespace: string, lang: string): T;

// src/translation/enqueueTranslation.ts
export async function enqueueTranslation(
  entity: EntityName,
  entityId: string,
  source: Record<string, unknown>,   // o registro completo; os campos são filtrados dentro
): Promise<void>;

export async function removeTranslations(
  entity: EntityName,
  entityId: string,
): Promise<void>;

// src/translation/applyTranslations.ts
export async function applyTranslations<T extends { id: string }>(
  entity: EntityName,
  records: T[],
  lang: string,
): Promise<T[]>;

// src/translation/worker.ts
export async function processPendingBatch(limit?: number): Promise<{
  processed: number; failed: number; skippedByQuota: number;
}>;
```

`enqueueTranslation` **nunca lança**. Uma falha de enfileiramento não pode derrubar o
`POST /project/create` do owner — o dado foi salvo; a tradução é secundária. Erro é logado
via `devDebugger` e o backfill recupera.

---

## 9. Padrões Aplicados

- **Outbox / tabela-como-fila** — o estado persistido *é* o trabalho pendente (ADR-02).
- **Content-hash change detection** — mesma ideia já usada em `TranslationCache.makeKey`
  (`translationCacheService.ts:20`), aplicada agora ao subconjunto traduzível, e persistida.
- **Read-through com degradação graciosa** — tradução ausente devolve original (ADR-05),
  espelhando o que `translateWithRetry` já faz ao estourar quota (`aiService.ts:375`).
- **Allowlist sobre denylist** — `TRANSLATABLE` declara o que *pode* ir ao LLM. Um campo
  novo no schema é, por omissão, não-traduzível. Falha no lado seguro.

Explicitamente **não** aplicados: repository genérico, factory de tradutor, interface de
provider com uma implementação. Há um provider (OpenRouter) e um tradutor.

---

## 10. Cross-Cutting

- **Configuração:** `env.ts` ganha três variáveis, todas com default igual ao comportamento
  atual, e todas validadas por Zod:

| Env var | Default | Validação | Papel |
|---|---|---|---|
| `SUPPORTED_LANGUAGES` | `"en,es,fr,ja,ko,zh,it"` | lista não-vazia, sem `pt` | idiomas-alvo do worker |
| `MAX_DAILY_REQUESTS` | `45` | inteiro ≥ 1 | teto diário da conta OpenRouter (ADR-07) |
| `WORKER_DAILY_BUDGET` | `25` | inteiro ≥ 1 **e** `< MAX_DAILY_REQUESTS` | sub-teto do worker (ADR-04/07) |

  `.env.example` deve documentar as três, incluindo a nota de que subir
  `MAX_DAILY_REQUESTS` acima de ~50 só faz sentido com crédito na conta OpenRouter.
  Sem `WORKER_POLL_INTERVAL_MS` configurável — é uma constante de 30s até que se prove
  necessário.
- **Logging:** `devDebugger` já existente. O worker loga início/fim de ciclo, e cada falha
  com `entity/entityId/language`.
- **Erros:** falha de tradução incrementa `attempts` e grava `lastError`. Em `attempts >= 3`
  a linha vira `failed` e sai do loop de poll (não fica queimando quota em loop). Um
  `failed` volta a `pending` quando o conteúdo de origem mudar de novo, ou via backfill com
  `--retry-failed`.
- **Auth:** nenhuma rota nova pública. Se um endpoint de status de tradução for desejado,
  ele vai em `routerPrivate` atrás do `AuthPolice`, junto de `/ai-config`.
- **Observabilidade:** `GET /utils/cache-stats` (`utilisController.ts:62`) já reporta quota e
  cache; estender com contagem de `pending`/`failed` é uma query barata e o suficiente.

---

## 11. Escalabilidade e Performance

O gargalo nunca foi o banco. É a quota diária do OpenRouter, contra 7 idiomas.
Orçamento após este blueprint:

- Textos de UI: **0 chamadas** (antes: uma fração dominante do total).
- Conteúdo do owner: 1 chamada por registro por idioma, **só quando o texto muda**.
  Uma edição de projeto = 7 chamadas, uma vez.
- Leitura: **0 chamadas, sempre** — invariante de ADR-05/RNF-07.
- Backfill inicial: ~80 registros × 7 idiomas ≈ **560 chamadas**. A duração é função direta de
  `WORKER_DAILY_BUDGET` (ADR-07), e é operacional, não arquitetural:

| `MAX_DAILY_REQUESTS` / `WORKER_DAILY_BUDGET` | Pré-requisito | Backfill completo em |
|---|---|---|
| `45` / `25` (default) | nenhum | ~23 dias |
| `1000` / `600` | ~US$10 de crédito na conta OpenRouter | ~1 dia |

  Durante o ramp-up o conteúdo ainda não traduzido é servido em pt-BR (ADR-05), com os labels
  de UI já no idioma correto. Não há degradação de disponibilidade, só de cobertura — e ela é
  encurtável a qualquer momento subindo o env var e reiniciando o worker.

O worker processa em série com `MIN_REQUEST_INTERVAL` de 2,5s já imposto pelo `QuotaManager`.
Paralelismo seria contraproducente: o limitante é a quota, não a CPU.

---

## 12. Segurança

Superfície nova pequena, mas com dois pontos que merecem atenção:

- **Teto de gasto (ADR-04).** É o risco material. Sem o contador compartilhado, o worker
  gasta um segundo orçamento invisível contra a mesma conta.
- **Conteúdo do owner vai para um terceiro (OpenRouter).** Isso já acontece hoje; o worker
  não amplia a classe de dado exposta — pelo contrário, `TRANSLATABLE` a **reduz**, já que
  hoje URLs, IDs e datas são enviados junto e passariam a não ser.
- `fields` é `Json` vindo de resposta de LLM. É serializado direto em resposta HTTP como já
  acontece hoje, e `validateTranslationShape` já barra estrutura inesperada. Sem
  interpolação em HTML no backend.
- **Recomenda-se revisão do Lawliet Agent** sobre: (a) o contador de quota em Redis, quanto
  a race conditions entre os dois processos, e (b) a garantia de que nenhum campo sensível
  (`owner.password`, `secretWord`, `email`) pode entrar em `TRANSLATABLE` nem no payload
  enviado ao provider — hoje `ownerController.getOwner` envia o objeto owner inteiro para
  o LLM, e isso deve ser verificado.

---

## 13. Dependências Externas

- **OpenRouter** — falha ou quota esgotada: worker para o ciclo, linhas continuam `pending`,
  API segue servindo pt. Sem impacto no visitante além do idioma.
- **Redis** — obrigatório para o worker (ADR-04), opcional para a API. Queda do Redis com o
  worker rodando: ele deve parar de processar (não conseguir contar quota = não gastar quota).
- **MongoDB** — indisponível: worker faz retry no ciclo seguinte. Nenhum estado se perde.

---

## 14. Plano de Implementação (para o Neo Agent)

Fases 1 e 2 já entregam a maior parte do ganho de latência percebido e **não dependem** do
worker. Elas podem ser feitas e mergeadas isoladamente.

**Fase 1 — Locales estáticos (ADR-01)**
1. Extrair todos os literais de `texts` e labels dos services (`projectService`,
   `skillService`, `formationService`, `badgeService`, `certificationService`,
   `servicesOwnerService`, `utilisService`) para `src/i18n/pt.json`.
2. Gerar `en/es/fr/ja/ko/zh/it.json` (script pontual usando o `TranslationService` existente,
   rodado uma vez, resultado commitado — não é código de runtime).
3. Criar `src/i18n/index.ts` com `getUiTexts`.
4. Services passam a receber `lang` e montar `texts` via `getUiTexts` em vez do literal.
5. Controllers param de mandar o bloco `texts` ao LLM.
6. `src/i18n/locales.test.ts` — paridade de chaves entre todos os locales.
- **DoD:** `GET /skills/owner/:id?language=ja` devolve labels em japonês com **zero** chamadas
  a OpenRouter (verificável pelo contador de quota inalterado).

**Fase 2 — Higiene do payload de LLM (Bucket C) — mudança de contrato APROVADA**
7. **Remover `lastUpdateText` do payload** (`projectService.ts:99-110`). O owner aprovou a
   mudança de contrato em 2026-08-05. O backend passa a devolver dados crus e o frontend
   formata:
   - `projectService.findAllProjects` para de concatenar data formatada. Devolve
     `lastUpdate` e `createdAt` como ISO (já são `DateTime`), mais um discriminador
     `dateLabelKey: "updatedAt" | "addedAt"` refletindo a condição hoje em
     `projectService.ts:100` (`lastUpdate` existe e o dia difere de `createdAt`).
   - Os textos `"Ultima Atualização"` / `"Adicionado Em"` viram chaves do dicionário da
     Fase 1 (`project.dateLabel.updatedAt` / `project.dateLabel.addedAt`), traduzidos por
     arquivo, não por LLM.
   - **Tarefa no repo `portifolio-ws`:** o componente de card de projeto passa a montar o
     texto com `new Intl.DateTimeFormat(language, { day:"2-digit", month:"long",
     year:"numeric" })` sobre `lastUpdate ?? createdAt`, prefixado pelo label vindo de
     `dateLabelKey`. Ganho colateral: a data passa a ser localizada de verdade por idioma,
     coisa que o `toLocaleDateString("pt-BR")` hardcoded nunca fez.
   - **Isto é uma mudança breaking de contrato.** Backend e frontend devem ir juntos; se
     forem PRs separados, o frontend entra primeiro tolerando a ausência do campo.
8. Remover o 4º argumento morto passado a `translateObject` em `formationController.ts:54`,
   `badgeController.ts:50,78`, `certificationController.ts`, `servicesController.ts`,
   `ownerController.ts` — a assinatura só aceita 3 (`aiService.ts:148`).
- **DoD:** nenhum call-site passa argumento inexistente; **nenhuma string contendo data
  formatada existe em qualquer payload enviado ao LLM**; o card de projeto no frontend
  exibe a data no idioma corrente.

**Fase 3 — Quota configurável e compartilhada (ADR-04 + ADR-07) — bloqueia a Fase 5**
9. **`env.ts`:** adicionar `MAX_DAILY_REQUESTS` (default `45`), `WORKER_DAILY_BUDGET`
   (default `25`) e `SUPPORTED_LANGUAGES` (default `"en,es,fr,ja,ko,zh,it"`), conforme a
   tabela da seção 10. Números via `z.coerce.number().int().positive()`. Adicionar um
   `.refine` no schema garantindo `WORKER_DAILY_BUDGET < MAX_DAILY_REQUESTS` — **falha de
   boot**, não warning (sem isso o sub-teto não protege nada e o ADR-04 vira decoração).
10. **`quotaManager.ts`:** apagar a constante privada `MAX_DAILY_REQUESTS = 45` (linha 25) e
    passar a ler de `env`. O comentário `ponytail:` existente nas linhas 22-24 deve ser
    reescrito apontando para o env var em vez de justificar o literal.
11. **`quotaManager.ts`:** contador diário migra para Redis — `INCR` numa chave com data
    (`quota:daily:YYYY-MM-DD`) + `EXPIRE`, o que dispensa a lógica manual de virada de dia
    (`isNewDay`/`resetDailyMetrics`) e elimina a race entre os dois processos. Fallback em
    memória preservado **apenas** para o processo da API (RNF-03); o worker exige Redis.
12. `canMakeRequest` aceita qual teto aplicar (o do processo), para que o worker respeite
    `WORKER_DAILY_BUDGET` e a API respeite `MAX_DAILY_REQUESTS`, ambos contra **o mesmo
    contador Redis**.
- **DoD:** dois processos rodando compartilham o mesmo contador; subir `MAX_DAILY_REQUESTS`
  no ambiente e reiniciar altera o teto sem tocar em código; boot falha se
  `WORKER_DAILY_BUDGET >= MAX_DAILY_REQUESTS`; teste cobrindo a virada do dia.

**Fase 4 — Modelo e enfileiramento (RF-03, RF-04, RF-06)**
13. Model `translation` no schema + `bunx prisma db push` + `db:generate`.
14. `translatableFields.ts`, `translationRepository.ts`, `enqueueTranslation.ts`. Os idiomas
    alvo vêm de `env.SUPPORTED_LANGUAGES` (Fase 3), nunca de lista hardcoded.
15. Chamar `enqueueTranslation` nos services de escrita do owner — **nos services, não nos
    controllers**: `projectService.createProject/updateProject`, `skillService.addSkill/updateSkill`,
    `formationService`, `badgeService`, `certificationService`, `ownerService.updateOwner`,
    `servicesOwnerService`. E `removeTranslations` nos `delete*`.
    *(Nos services, porque é onde o registro persistido está disponível e onde todo caminho
    de escrita converge — inclusive `handleActivateOrDesactivateProject`, que não deve gerar
    job algum, e não gerará, pois `activate` não está em `TRANSLATABLE`.)*
16. Teste: editar campo não-traduzível não cria job; editar `title` cria um por idioma.
- **DoD:** `PUT /project/:id/update` alterando `description` produz uma linha `pending` por
  idioma em `SUPPORTED_LANGUAGES`; alterando só `previewImage` produz zero.

**Fase 5 — Worker (RF-05)**
17. `src/translation/worker.ts` (`processPendingBatch`) e `src/worker-entry.ts`.
18. `worker-entry.ts` valida `REDIS_URL` no boot e encerra com código != 0 e mensagem
    explícita se ausente (ADR-04). Aplica `WORKER_DAILY_BUDGET` como seu teto.
19. `package.json`: `"worker": "bun run src/worker-entry.ts"`,
    `"start:worker": "bun dist/src/worker-entry.js"`.
20. `docker-compose.yaml` (raiz e do backend): segundo serviço `worker`, **mesma imagem**
    (`build: ./portifolio-backend`), com `command: ["bun","dist/src/worker-entry.js"]` e
    `REDIS_URL`, `MAX_DAILY_REQUESTS`, `WORKER_DAILY_BUDGET` no ambiente. Nenhuma porta
    exposta. Dockerfile **não muda**.
21. Shutdown gracioso em `SIGTERM`/`SIGINT`: termina o job corrente antes de sair.
- **DoD:** `docker compose up` sobe api + worker; matar o worker no meio de um job e reiniciar
  não duplica nem perde tradução (linha permanece `pending`).

**Fase 6 — Leitura pré-traduzida (RF-02, RF-08, ADR-05)**
22. `applyTranslations.ts` — uma query por request, merge por `id`. **Este arquivo não
    importa `TranslationService`, e não deve.**
23. Controllers de leitura: substituir `translateObject` por `getUiTexts` (Fase 1) +
    `applyTranslations`. Depois desta fase, **nenhum handler de rota pública chama
    `TranslationService`** — a única forma de disparar LLM passa a ser o worker.
24. Registro sem tradução `done` no idioma pedido: passa intocado, servindo pt-BR. Sem
    fallback síncrono, sem enfileiramento oportunista no caminho de leitura, sem
    `Promise.race` com timeout de LLM. Se o dado não estiver lá, serve pt-BR e pronto —
    o backfill e o enfileiramento na escrita são os únicos produtores de trabalho.
25. Manter `POST /utils/test-translation` e `/utils/models` como estão: são ferramentas
    privadas do owner atrás de `AuthPolice`, não caminho de visitante.
- **DoD:** `GET /projects/owner/:id?language=en` responde com **zero I/O de rede externa**,
  verificável por teste que falha se `TranslationService` for invocado durante o request;
  registro sem tradução aparece em pt-BR com status 200.

**Fase 7 — Backfill (RF-07)**
26. `backfill.ts` + flag `--backfill` no entrypoint; varre todas as entidades e enfileira o
    que estiver faltando ou com hash divergente. Idempotente. Aceita `--retry-failed` para
    reprocessar linhas em `failed`.
27. Documentar no README: rodar o backfill, e que sua duração é governada por
    `WORKER_DAILY_BUDGET` (tabela da seção 11) — subir o env var e reiniciar o worker é o
    botão para acelerar, se houver crédito na conta OpenRouter.
- **DoD:** rodar duas vezes seguidas não cria trabalho duplicado.

---

## 15. Critérios de Aceitação (para o Agent Smith)

- **AC-01** — `GET /skills/owner/:id?language=ja` não incrementa o contador de quota.
- **AC-02** — Todos os arquivos em `src/i18n/*.json` têm exatamente o mesmo conjunto de chaves.
- **AC-03** — Alterar apenas `project.previewImage` não cria nem marca `pending` nenhuma linha.
- **AC-04** — Alterar `project.description` marca `pending` para os 7 idiomas configurados.
- **AC-05** — `enqueueTranslation` lançando internamente não faz `PUT /project/:id/update` falhar.
- **AC-06** — Executar `processPendingBatch` duas vezes sobre o mesmo `pending` produz uma
  única linha `done`, não duas.
- **AC-07** — Falha de tradução incrementa `attempts`; ao chegar a 3, `status = "failed"` e a
  linha deixa de ser selecionada pelo poll.
- **AC-08** — Com quota esgotada, o worker não emite requisição alguma ao OpenRouter e as
  linhas permanecem `pending`.
- **AC-09** — Com API e worker rodando juntos, a soma das requisições dos dois processos
  nunca ultrapassa `MAX_DAILY_REQUESTS`.
- **AC-10** — `worker-entry.ts` sem `REDIS_URL` encerra com erro explícito e código != 0.
- **AC-11** — `GET` de entidade sem tradução no idioma pedido responde 200 com conteúdo em pt.
- **AC-12** — Deletar um projeto remove suas linhas de `translation`.
- **AC-13** — Nenhum campo fora de `TRANSLATABLE` aparece no payload enviado ao LLM —
  especialmente `techs`, URLs e `owner.password`/`secretWord`/`email`.
- **AC-14** — Backfill executado duas vezes seguidas não gera trabalho na segunda execução.
- **AC-15** — *(ADR-05)* Nenhum handler de rota pública invoca `TranslationService`. Um teste
  que espiona o serviço durante `GET /projects/owner/:id?language=en` deve registrar **zero**
  chamadas — e falhar se alguém reintroduzir tradução síncrona no caminho de leitura.
- **AC-16** — *(ADR-05)* Com o worker parado e nenhuma tradução gravada,
  `GET /projects/owner/:id?language=ja` responde 200, em tempo de query de banco, com o
  conteúdo do owner em pt-BR e os labels de UI em japonês.
- **AC-17** — *(ADR-07)* Alterar `MAX_DAILY_REQUESTS` no ambiente e reiniciar o processo muda
  o teto efetivo, sem nenhuma alteração de código.
- **AC-18** — *(ADR-07)* O boot falha com erro explícito quando
  `WORKER_DAILY_BUDGET >= MAX_DAILY_REQUESTS`, ou quando qualquer uma das duas não é inteiro
  positivo.
- **AC-19** — *(Fase 2)* Nenhum payload enviado ao LLM contém data formatada; a resposta de
  `GET /projects/owner/:id` expõe `lastUpdate`/`createdAt` e `dateLabelKey`, e não
  `lastUpdateText`.

---

## 16. Fora de Escopo

- Upgrade de Prisma 6 → 7 e ioredis 5 → 6.
- Qualquer mudança no frontend, **exceto** a formatação de data da Fase 2 item 7.
- Interface de administração de traduções (revisar/editar tradução manualmente).
- Tradução do conteúdo de `analytics`, `visitor`, `pageView`.
- Adicionar ou remover idiomas suportados.
- Multi-tenant.
- Substituir o `TranslationCache` Redis existente — permanece como está.

---

## 17. Riscos e Decisões Registradas

### Decisões do owner (2026-08-05) — fechadas, não reabrir

- **D-01 (era Q-01) — Teto de quota configurável.** `MAX_DAILY_REQUESTS` sai do código e vira
  env var → **ADR-07**, Fase 3 itens 9-10, AC-17/AC-18. Isso resolve o custo do backfill como
  alavanca operacional em vez de decisão de arquitetura (tabela na seção 11): o owner sobe o
  teto quando/se adicionar crédito ao OpenRouter, sem PR nem redeploy.
- **D-02 (era Q-02) — Mudança de contrato de `lastUpdateText` aprovada.** Backend deixa de
  mandar texto pronto; frontend formata com `Intl.DateTimeFormat` → Fase 2 item 7, AC-19.
  Única mudança neste blueprint que atravessa os dois repos.
- **D-03 (era Q-03) — Nunca bloquear o visitante esperando LLM.** Confirmado com justificativa
  de evasão e SEO → **ADR-05** promovido a invariante do sistema (RNF-07), Fase 6 itens 22-24,
  AC-15/AC-16. Não é configurável: não existe flag que reative tradução síncrona no caminho
  de leitura.

### Riscos

**R-01 — Quota compartilhada é pré-requisito, não detalhe.** Implementar a Fase 5 antes da
Fase 3 significa dois contadores independentes contra um teto único de conta. A ordem das
fases não é negociável nesse ponto.

**R-02 — Bug pré-existente encontrado no discovery.** Cinco controllers passam um 4º argumento
a `translateObject`, que aceita três (`aiService.ts:148`). Ex.:
`formationController.ts:54` passa `"Translate formation type values"` e
`badgeController.ts:50` passa `"Traduza os dados dos badges"`. São silenciosamente ignorados
— alguém escreveu esperando que fossem instruções ao modelo, e nunca foram. Corrigido na
Fase 2.

**R-03 — Chave de cache atual inclui filtros e paginação.**
`TranslationCache.makeKey` (`translationCacheService.ts:20`) hasheia o objeto de resposta
inteiro, incluindo `meta.page` e os resultados filtrados. Portanto `?tech=react&page=2` é uma
entrada de cache totalmente nova: 7 chamadas de LLM a mais das 45 diárias, por combinação de
filtro. Isso explica boa parte da lentidão percebida hoje, e some com este blueprint (o merge
passa a ser por registro, indiferente a filtro e paginação).

**R-04 — Divergência de processo.** Minha memória deste projeto registra que o planejamento
aqui costuma virar **issues do GitHub**, não `docs/blueprints/`. Segui a instrução explícita
desta vez. Se preferir, converto este blueprint em issues no repo `wallacemt/dev-portifoio-api`.

**R-05 — Qualidade de modelo `:free`.** O default (`google/gemma-4-31b-it:free`) já falha
formato o bastante para justificar `validateTranslationShape` + 3 retries. Em modo worker
isso é menos grave (ninguém espera), mas cada retry consome quota. Vale monitorar `attempts`
médio após a Fase 5.

---

## Handoff
- **Artefato gerado:** `/mnt/e/WorkSpace/PESONAL_PROJECTS/portifolio-dev/portifolio-backend/docs/blueprints/The-Blueprint-001.md`
- **Status:** **Aprovado** — D-01, D-02 e D-03 resolvidas pelo owner em 2026-08-05.
  Nenhuma questão em aberto. Pronto para implementação.
- **Próximo agente:** Neo Agent (implementação), pela seção 14, **respeitando a ordem das fases**.
- **Ação requerida:** invocar o Neo Agent.
- **Notas para o Neo:**
  - **Fase 3 bloqueia a Fase 5** (R-01). Subir o worker antes do contador de quota
    compartilhado significa dois contadores independentes contra um teto de conta único.
  - **Fase 2 item 7 atravessa dois repositórios** (`portifolio-backend` + `portifolio-ws`).
    É a única mudança breaking de contrato do blueprint; se forem PRs separados, o frontend
    entra primeiro tolerando a ausência do campo.
  - **ADR-05 é invariante, não preferência.** Nenhum caminho de leitura pode chamar
    `TranslationService`. AC-15 existe para falhar se isso for reintroduzido.
  - Fases 1 e 2 entregam a maior parte do ganho de latência sem depender do worker, e podem
    ser mergeadas antes do resto.
  - Recomenda-se revisão do **Lawliet Agent** sobre (a) races no contador de quota em Redis
    entre os dois processos e (b) quais campos do `owner` chegam ao provider externo — hoje
    `ownerController.getOwner` envia o objeto owner inteiro ao LLM (seção 12).
