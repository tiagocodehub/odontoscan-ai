# ADR-0007 — Autenticação, persistência e LGPD na Etapa 4

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
A Etapa 4 adiciona login (CRO) e histórico. Isso introduz **dados pessoais** (identificação
profissional) e **dados de saúde** (achados vinculados a um paciente) — dado sensível pela LGPD
(Art. 11). O ADR-0006 havia adiado o banco para esta etapa.

## Decisão

**Persistência**
- SQLite na v1 via SQLModel/SQLAlchemy, com a porta de repositório na camada `application`.
- `create_all` na inicialização; **Alembic fica para a migração a Postgres** (a v1 não tem dado
  de produção a migrar). Migrar exige trocar `DATABASE_URL` + criar as migrações.
- Modelo mínimo: `user`, `patient`, `analysis`, `refresh_token`.

**Autenticação**
- Senha com **bcrypt** (nunca em texto claro).
- **Access token JWT curto (15 min)** + **refresh token (7 dias) com rotacionamento e revogação
  no servidor** (`refresh_token` guardado como hash; `/logout` revoga o refresh do corpo **e** o
  access token apresentado). O access carrega a claim `jti` e pode ser revogado antes de expirar
  (ver Correções pós-auditoria, A2).
- **Rate limiting** em `/auth/login` (5/min por IP+e-mail) — em memória na v1.

**LGPD — minimização**
- **A imagem NÃO é armazenada.** O histórico guarda metadados (`sha256`, dimensões, formato),
  `findings`, `plan` e o recorte. Rever visualmente exige reenviar o arquivo.
- Paciente tem apenas **nome** (e notas opcionais) — sem CPF, telefone ou endereço.
- Exclusão em cascata: apagar paciente remove suas análises; apagar a conta remove tudo.
- Retenção: enquanto a conta existir; o usuário pode excluir a qualquer momento.

**Frontend**
- Access token **em memória**; refresh token em `localStorage` (documentado — ver pendências).
- Todo o tráfego autenticado passa por um único cliente HTTP que injeta `Authorization`.

## Consequências
- Uso anônimo continua funcionando: `/analyze` só persiste quando há token válido.
- Ganhamos histórico sem multiplicar a superfície de dados sensíveis (imagem fora do banco).

## Correções pós-auditoria de segurança
Uma auditoria dedicada (`@security`) encontrou itens altos/médios, **já corrigidos**:
- **`JWT_SECRET` sem default no compose**: agora exige injeção (`${JWT_SECRET:?…}`) a partir de um
  `.env` **não versionado**; `.gitignore` na raiz cobre `.env`, `data/` e derivados.
- **Rate limit de login** passou a ter **dois baldes**: por `(IP, e-mail)` **e** por **IP isolado**
  (`LOGIN_IP_RATE_LIMIT=20`/min), fechando a burla por rotação de e-mail.
- **Equalização de tempo no login**: quando o e-mail não existe, ainda se executa um `bcrypt`
  contra hash dummy — elimina o oráculo de tempo/enumeração.
- **Logs de segurança** (`auth.register`, `login`, `login_failed`, `refresh_reuse_detected`,
  `refresh_family_revoked`, `logout`) com `request_id`/IP/`user_id`, **sem** senha/token.
- **A2 — Access token revogável**: o access agora inclui a claim `jti` (uuid) e um **denylist
  em memória** (`RevokedTokenStore`, com TTL = validade do token e purga das entradas expiradas)
  é consultado por `get_current_user`. `POST /auth/logout` revoga o access apresentado (além do
  refresh do corpo) e mantém o contrato `204`. Token antigo **sem `jti` é rejeitado** (401).
- **Reuso de refresh revoga a família**: reapresentar um refresh já rotacionado não é mais só
  `WARNING` — revoga **todos os refresh ativos do usuário** (detecção de roubo de token) e loga
  `auth.refresh_family_revoked` (WARNING) com `user_id`; a sessão exige novo login.

> **Limitação consciente:** tanto o rate limit quanto o denylist de access são **em memória e por
> processo** na v1 — a revogação **não é distribuída**. Um reinício do processo esvazia o denylist
> e outra réplica não enxerga as revogações feitas por esta. Em produção: denylist/blacklist
> centralizada (Redis) com TTL.

## Pendências de segurança (conscientes, documentadas)
Itens do `checklist-seguranca` **não atendidos na v1** e o porquê:
1. **Criptografia em repouso (AES-256)**: o SQLite não é cifrado; o banco fica local, atrás do
   Docker. Em produção: Postgres com TDE/pgcrypto ou SQLCipher.
2. **Refresh token em `localStorage`**: exposto a XSS. Em produção: cookie `HttpOnly` +
   `SameSite` (mesma origem/BFF) e `Secure`.
3. **Rate limit e denylist de access distribuídos**: ambos são em memória (por processo) — o
   rate limiter e o `RevokedTokenStore` (revogação do access). Em produção: Redis/gateway.
4. **TLS**: local em HTTP. Em produção: HTTPS obrigatório (HSTS já previsto nos headers).
5. **Consentimento/DPIA formais**: não implementados; a v1 é protótipo de pesquisa sem pacientes reais.
