# Realtime Chat

Dự án cá nhân để học: hệ thống chat realtime gồm **Angular micro-frontend (Native Federation)**, **NestJS microservices qua RabbitMQ**, **WebSocket thuần (`ws`)**, **PostgreSQL (Prisma)** và **Redis**, gom trong một **Nx workspace**.

> Trạng thái: **Giai đoạn 3 — tách microservices với RabbitMQ.** `auth-service` và `chat-service` là hai app NestJS riêng, mỗi cái sở hữu database của mình; `api-gateway` chỉ còn là lớp biên (REST + WebSocket), không truy cập database hay Redis, và nói chuyện với các service **chỉ qua RabbitMQ** (RPC, command, event). Hành vi nhìn từ trình duyệt không đổi so với giai đoạn 2: đăng ký / đăng nhập, chat 1-1 và nhóm, lịch sử phân trang khi cuộn lên.

## Kiến trúc hiện tại

```
 Trình duyệt
 ┌──────────────────────────────────────────────────────────┐
 │ shell (host, :4200) — Store gốc, phiên đăng nhập, 1 socket │
 │  ├─ mfe-auth (:4201)  /auth/login, /auth/register        │   Native Federation
 │  └─ mfe-chat (:4202)  /chat, /chat/:conversationId       │
 └──────────────┬───────────────────────────────────────────┘
                │ REST /api/* (Bearer + cookie refresh)   WebSocket /ws?ticket=…
                ▼
 ┌──────────────────────────────────────────────────────────┐
 │ api-gateway (:3000) — lớp biên, domain:edge                │
 │  xác minh JWT tại chỗ · cookie refresh · registry socket theo user / phiên
 │  REST → RPC · chat.send → command · event → frame WebSocket │
 └──────────────┬───────────────────────────────────────────┘
                │ AMQP (RabbitMQ :5672)
                ▼
 ┌──────────────────────────────────────────────────────────┐
 │ RabbitMQ: auth.rpc · chat.rpc · chat.commands (+ retry, DLQ) │
 │           exchange rtc.events (topic) · gateway.events.<instance> │
 └───────┬──────────────────────────────────────┬───────────┘
         ▼                                      ▼
 ┌──────────────────────┐              ┌───────────────────────────┐
 │ auth-service         │   event      │ chat-service              │
 │ libs/api/auth        │ ───────────▶ │ libs/api/chat             │
 │ users, phiên, JWT,   │ user.registered  hội thoại, tin, seq,    │
 │ refresh, ticket      │ ◀─────────── │ chat_users (bản sao user) │
 │                      │   RPC (read-through)                     │
 └──────┬───────┬───────┘              └────────────┬──────────────┘
        ▼       ▼                                   ▼
  PostgreSQL   Redis                          PostgreSQL chat_db
  auth_db      (ticket WebSocket)
```

| Thành phần                                                | Sở hữu                         | Không được làm                                     |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| `apps/auth-service` (+ `libs/api/auth`, `libs/api/redis`) | `auth_db`, Redis (ticket)      | truy cập `chat_db`                                 |
| `apps/chat-service` (+ `libs/api/chat`)                   | `chat_db`                      | truy cập `auth_db`, Redis                          |
| `apps/api-gateway`                                        | kết nối client, cookie, socket | DB, Prisma, Redis, import `libs/api/auth` / `chat` |

Lib domain vẫn là service thuần, không biết RabbitMQ: handler RabbitMQ nằm trong **app** (lớp adapter), và lib phát event qua port `EventPublisher` do app cung cấp. `libs/api/messaging` gom phần RabbitMQ dùng chung cho cả ba app.

**Tiếp theo:** ack / trạng thái "đang gửi" ở UI (giai đoạn 4), nhiều instance gateway (giai đoạn 5; topology đã chuẩn bị: mỗi instance một queue riêng).

## Yêu cầu

| Công cụ        | Phiên bản                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| Node.js        | `^22.22.3 \|\| ^24.15.0 \|\| >=26` (yêu cầu của Angular 22), đã thử với 24.18 |
| npm            | 11 (repo khai báo `packageManager: npm@11.16.0`)                              |
| Docker Desktop | có Docker Compose v2                                                          |

## Cài đặt và chạy

```bash
npm ci                    # cài dependency
cp .env.example .env      # cấu hình local (.env bị git bỏ qua)
npm run infra:up          # PostgreSQL, Redis, RabbitMQ (đợi tới khi healthy)
npm run db:generate       # sinh Prisma client (code sinh ra bị git bỏ qua)
npm run db:migrate        # áp các migration đã commit vào auth_db và chat_db
npm run serve:all         # shell, mfe-auth, mfe-chat, api-gateway, auth-service, chat-service
```

Sau đó mở:

- http://localhost:4200: shell. Chưa đăng nhập → `/auth/login`. Đăng ký tài khoản, rồi mở thêm một cửa sổ ẩn danh (cookie riêng) để đăng ký người thứ hai và chat với nhau.
- http://localhost:4200/chat: danh sách hội thoại + hội thoại đang mở.
- http://localhost:3000/api/health → `{"status":"ok","services":{"auth":"up","chat":"up","rabbitmq":"up"}}` (503 `degraded` nếu thiếu phần nào).
- http://localhost:15672: RabbitMQ management (tài khoản `RABBITMQ_USER` / `RABBITMQ_PASSWORD` của `.env`), xem [Topology](#topology).
- http://localhost:4201, http://localhost:4202: các remote chạy độc lập (mfe-chat dùng phiên đã đăng nhập ở shell).

Hai service không có cổng HTTP: chúng chỉ nghe RabbitMQ. Gateway trả lời health là cách nhìn trạng thái của chúng.

**Lưu ý với `.env`:**

- `DATABASE_URL_*` phải khớp `POSTGRES_USER` / `POSTGRES_PASSWORD` **mà volume Postgres được tạo lần đầu**. Đổi mật khẩu trong `.env` sau đó không đổi mật khẩu trong volume.
- `JWT_ACCESS_SECRET` phải **giống nhau** cho auth-service (ký) và api-gateway (xác minh); cả hai đọc cùng một `.env`.
- `CORS_ORIGINS` phải có `:4201` và `:4202` nếu muốn chạy remote độc lập.
- Volume Postgres cũ chưa có `auth_test` / `chat_test`: chạy `npm run db:test:ensure`.

npm 11 chặn install script của dependency nếu chưa được duyệt (`allowScripts` trong `package.json`). Script của `prisma`, `@prisma/engines` và `argon2` **không cần**.

### Các lệnh

| Lệnh                              | Tác dụng                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `npm run infra:up` / `infra:down` | Bật / tắt docker compose (dữ liệu giữ trong volume)                            |
| `npm run infra:logs`              | Theo dõi log hạ tầng                                                           |
| `npm run db:generate`             | Sinh Prisma client cho `libs/api/auth` và `libs/api/chat`                      |
| `npm run db:migrate`              | `prisma migrate deploy` cho cả hai database dev                                |
| `npm run db:reset`                | **Xoá toàn bộ dữ liệu** của hai database dev rồi migrate lại                   |
| `npm run db:test:ensure`          | Tạo `auth_test` / `chat_test` nếu thiếu, migrate                               |
| `npm run serve:all`               | Chạy cả sáu app (ba frontend, gateway, hai service)                            |
| `npm run lint` / `build` / `test` | Chạy trên toàn workspace (`nx run-many`)                                       |
| `npm run e2e`                     | Playwright (Chromium), xem [Kiểm thử](#kiểm-thử)                               |
| `npm run chaos`                   | Kịch bản chịu lỗi trên một stack cô lập, xem [Chaos](#kịch-bản-chịu-lỗi-chaos) |
| `npm run format` / `format:check` | Prettier                                                                       |

> **Đừng `npm run build` khi `serve:all` đang chạy.** Dev server Native Federation phục vụ `remoteEntry.json` và bundle dùng chung từ `dist/apps/<app>/browser`; bản build production ghi đè lên đó → `ReferenceError: ngDevMode is not defined`, trang trắng. Muốn build backend thì build riêng: `npx nx run-many -t build -p api-gateway auth-service chat-service`.

Thêm migration mới (khi đổi `schema.prisma`):

```bash
npx prisma migrate dev --config libs/api/chat/prisma.config.ts --name <tên>
```

Migration được commit; Prisma client sinh ra (`libs/api/*/src/generated`) thì không.

## Cổng

| Cổng  | Thành phần                     | Ghi chú                              |
| ----- | ------------------------------ | ------------------------------------ |
| 4200  | `shell`                        | host (dynamic host)                  |
| 4201  | `mfe-auth`                     | remote: đăng nhập, đăng ký           |
| 4202  | `mfe-chat`                     | remote: hội thoại                    |
| 4203  | `mfe-notifications`            | dành cho giai đoạn sau               |
| 3000  | `api-gateway`                  | HTTP prefix `/api`, WebSocket `/ws`  |
| —     | `auth-service`, `chat-service` | không có cổng: chỉ RabbitMQ          |
| 3100  | gateway của `npm run chaos`    | stack cô lập                         |
| 5432  | PostgreSQL 16                  | `auth_db`, `chat_db` (+ `*_test`)    |
| 6379  | Redis 7                        | ticket WebSocket (test: database 15) |
| 5672  | RabbitMQ AMQP                  | vhost `/` (chaos: vhost `chaos`)     |
| 15672 | RabbitMQ management UI         |                                      |

## Biến môi trường

Mọi app đọc cùng một `.env` (mẫu: `.env.example`, chỉ chứa placeholder) nhưng **chỉ validate những biến nó dùng** (`apps/<app>/src/config/env.schema.ts`, zod). Thiếu hoặc sai định dạng thì app dừng ngay lúc khởi động với thông báo dễ đọc.

| Biến                          | App           | Mặc định                  | Ý nghĩa                                                                     |
| ----------------------------- | ------------- | ------------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                    | cả ba         | `development`             | `development` \| `production` \| `test`                                     |
| `RABBITMQ_URL`                | cả ba         | (bắt buộc)                | `amqp://user:pass@localhost:5672` (thêm `/<vhost>` nếu cần)                 |
| `RPC_TIMEOUT_MS`              | cả ba         | `5000`                    | Thời gian chờ RPC; request **hết hạn** trong queue sau đúng thời gian này   |
| `JWT_ACCESS_SECRET`           | gateway, auth | bắt buộc khi `production` | Khoá HS256 ≥ 32 ký tự; auth ký, gateway xác minh                            |
| `API_GATEWAY_PORT`            | gateway       | `3000`                    | Cổng HTTP + WebSocket                                                       |
| `CORS_ORIGINS`                | gateway       | `:4200,:4201,:4202`       | Origin được gọi REST kèm cookie                                             |
| `WS_PATH`                     | gateway       | `/ws`                     |                                                                             |
| `WS_ALLOWED_ORIGINS`          | gateway       | `:4200,:4202`             | Origin được mở WebSocket (403 nếu sai)                                      |
| `WS_HEARTBEAT_MS`             | gateway       | `30000`                   | Chu kỳ ping; lỡ một pong thì bị ngắt                                        |
| `WS_MAX_AGE_SECONDS`          | gateway       | `900`                     | Tuổi tối đa của socket, hết thì đóng **4000** (client nối lại)              |
| `COOKIE_SECURE`               | gateway       | `false`                   | Cờ `Secure` cho cookie refresh                                              |
| `DATABASE_URL_AUTH`           | auth-service  | (bắt buộc)                | `postgresql://…/auth_db`                                                    |
| `REDIS_URL`                   | auth-service  | (bắt buộc)                | Ticket WebSocket                                                            |
| `JWT_ACCESS_TTL_SECONDS`      | auth-service  | `900`                     | Tuổi access token                                                           |
| `REFRESH_TTL_DAYS`            | auth-service  | `7`                       | Tuổi refresh token                                                          |
| `REFRESH_REUSE_GRACE_SECONDS` | auth-service  | `10`                      | Dùng lại token vừa xoay trong khoảng này: 401 nhưng **không** thu hồi phiên |
| `WS_TICKET_TTL_SECONDS`       | auth-service  | `30`                      | Tuổi ticket chưa dùng                                                       |
| `DATABASE_URL_CHAT`           | chat-service  | (bắt buộc)                | `postgresql://…/chat_db`                                                    |
| `CHAT_COMMAND_MAX_ATTEMPTS`   | chat-service  | `3`                       | Số lần thử `chat.send` trước khi vào DLQ                                    |

Test ghi đè được `TEST_DATABASE_URL_AUTH` / `_CHAT` (mặc định: tên database `auth_test` / `chat_test`), `TEST_REDIS_URL` (mặc định database 15), `TEST_RABBITMQ_URL` (mặc định `RABBITMQ_URL`; test tự cô lập bằng tên queue có tiền tố ngẫu nhiên).

**Frontend** không đọc `.env`: `apiBaseUrl` / `wsUrl` nằm trong `apps/*/src/environments/*.ts`.

## Cấu trúc thư mục

```
realtime-chat/
├── apps/
│   ├── shell/ · mfe-auth/ · mfe-chat/   # frontend (không đổi ở giai đoạn 3, trừ thông báo SERVICE_UNAVAILABLE)
│   ├── api-gateway/            # lớp biên: auth/, users/, conversations/ (REST → RPC), chat/ (WebSocket, event → frame),
│   │                           #   messaging/ (RpcClient), http/ (correlation id, pipe, filter), testing/ (harness)
│   ├── auth-service/           # rpc/auth-rpc.controller.ts: mọi RPC auth.*
│   ├── chat-service/           # rpc/ (chat.*), consumers/ (chat.commands, chat.user-sync), users/ (read-through)
│   └── shell-e2e/              # Playwright (+ global-teardown.mts: dọn tài khoản test)
├── libs/
│   ├── api/
│   │   ├── auth/               # AuthService, UsersService, WsTicketService… (Prisma auth_db)
│   │   ├── chat/               # ChatService, UserDirectory + USER_SOURCE (Prisma chat_db, chat_users)
│   │   ├── redis/              # RedisModule
│   │   └── messaging/          # RabbitMQ: topology, kết nối, RPC, publisher, consumer, retry/DLQ
│   └── shared/
│       ├── contracts/          # zod: REST, WebSocket, và messaging/ (pattern, payload RPC, command, event)
│       ├── auth/ · socket/ · chat-data-access/ · ui/
├── tools/
│   ├── db/                     # env.mjs, databases.mjs (migrate / reset / test DB)
│   ├── chaos/run.mjs           # kịch bản chịu lỗi
│   └── federation/shared.mjs
├── docker-compose.yml
└── .env.example
```

## RabbitMQ

### Ba kiểu giao tiếp

| Kiểu                               | Khi nào                                      | Cơ chế                                                                               |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| **RPC** (request–reply)            | cần kết quả ngay (REST, kiểm ticket)         | queue bền `auth.rpc` / `chat.rpc`, reply qua direct reply-to, timeout + `expiration` |
| **Command** (gửi rồi quên, có ack) | việc phải làm chắc chắn (`chat.send`)        | queue bền `chat.commands`, message persistent, ack thủ công, retry rồi DLQ           |
| **Event** (pub/sub)                | thông báo việc đã xảy ra, nhiều bên quan tâm | topic exchange `rtc.events`, routing key = loại event                                |

Payload của mọi message được validate bằng zod (`libs/shared/contracts/src/lib/messaging/`) ở **cả hai đầu**, giống input HTTP.

**RPC**

| Pattern                                                     | Service | Ghi chú                                                             |
| ----------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `auth.register`, `auth.login`, `auth.refresh`               | auth    | trả session kèm **chuỗi** refresh token; cookie là việc của gateway |
| `auth.logout`                                               | auth    | thu hồi phiên, phát `auth.session.revoked`                          |
| `auth.me`                                                   | auth    |                                                                     |
| `auth.ws-ticket.issue`, `auth.ws-ticket.consume`            | auth    | chỉ cho phiên còn sống; `consume` = `GETDEL` rồi kiểm tra lại phiên |
| `auth.users.search`, `auth.users.summaries`                 | auth    | `summaries`: read-through của chat-service                          |
| `chat.conversations.list` / `.create`, `chat.messages.list` | chat    | payload luôn có `userId` (gateway đã xác minh từ JWT)               |
| `auth.ping`, `chat.ping`                                    | cả hai  | health check (timeout 1,5 s)                                        |

**Command:** `chat.send` `{ userId, conversationId, clientMessageId, text, requestedAt }` → queue `chat.commands`.

**Event** (envelope `{ id, type, occurredAt, correlationId, payload }`)

| type                        | Phát bởi | Payload                                                      | Người nghe                           |
| --------------------------- | -------- | ------------------------------------------------------------ | ------------------------------------ |
| `auth.user.registered`      | auth     | `{ userId, username, displayName }`                          | chat (`chat.user-sync`, queue bền)   |
| `auth.session.revoked`      | auth     | `{ userId, sid }`                                            | mọi gateway → đóng socket 4401       |
| `chat.message.created`      | chat     | `{ message, recipientUserIds }`                              | mọi gateway → `chat.message`         |
| `chat.message.rejected`     | chat     | `{ userId, conversationId, clientMessageId, code, message }` | mọi gateway → `system.error`         |
| `chat.conversation.created` | chat     | `{ conversation, recipientUserIds }`                         | mọi gateway → `conversation.created` |

### Topology

Khai báo idempotent từ **một nguồn duy nhất** (`libs/api/messaging/src/lib/topology.ts`), mọi app gọi lúc khởi động và **lại sau mỗi lần kết nối lại**. Cùng nguồn đó cấp `queueOptions` cho server / client của Nest, vì một queue khai báo hai lần với tham số khác nhau sẽ làm kênh lỗi `PRECONDITION_FAILED`.

```
 ┌───────────────┐  auth.user.registered  ┌────────────────┐
 │  rtc.events   │ ─────────────────────▶ │ chat.user-sync │ ──▶ chat-service (UserSyncController)
 │ (topic, bền)  │                        └────────────────┘
 │               │  chat.message.created, chat.message.rejected,
 │               │  chat.conversation.created, auth.session.revoked
 │               │ ─────────────────────▶ gateway.events.<pid>-<id>  (exclusive, auto-delete, mỗi instance một queue)
 └───────────────┘

 api-gateway ──chat.send──▶ ┌───────────────┐ ──▶ chat-service (prefetch 1, ack thủ công)
                            │ chat.commands │
                            └──────┬────────┘
                    nack (không requeue) │ DLX = default exchange
                                   ▼
                       ┌─────────────────────┐  TTL 5 s hết → DLX = default exchange
                       │ chat.commands.retry │ ───────────────────────────────▶ chat.commands
                       └─────────────────────┘
   lần thử thứ CHAT_COMMAND_MAX_ATTEMPTS vẫn lỗi:
   consumer chép message vào chat.commands.dlq (bền, chỉ để xem / xử lý tay),
   phát chat.message.rejected { code: SEND_FAILED } rồi ack.
   Số lần thử = số lần "rejected" của chat.commands trong header x-death + 1.

 api-gateway ──RPC──▶ auth.rpc / chat.rpc ──▶ auth-service / chat-service
             ◀── reply (amq.rabbitmq.reply-to)
```

**Quan sát trên http://localhost:15672:**

- **Exchanges → `rtc.events` → Bindings**: thấy `chat.user-sync` và queue `gateway.events.*` của mỗi gateway đang chạy, với từng routing key.
- **Queues**: `auth.rpc`, `chat.rpc` (thường 0 message), `chat.commands` (tăng lên khi chat-service tắt, giảm khi bật lại), `chat.commands.retry` (message chờ thử lại), `chat.commands.dlq` (message đã hỏng hẳn: mở queue → **Get messages** để xem header `x-death`, `x-failure-reason`, `x-attempts`).
- **Connections**: mỗi app đặt tên kết nối (`api-gateway`, `auth-service`, `chat-service`) cho kết nối publish của nó.
- `npm run chaos` dùng vhost riêng **`chaos`** (chọn vhost ở góc phải trên): queue DLQ ở đó chứa các message mà kịch bản (d) cố ý làm hỏng.

### Luồng một tin nhắn mới

```
 composer (mfe-chat) ──Enter──▶ ChatActions.sendMessage ──▶ ChatSocketService.send
      │  frame { event: chat.send, data: { conversationId, clientMessageId, text } }
      ▼
 api-gateway  ChatGateway: validate frame → hàng đợi theo socket → publish command chat.send
      │       (userId lấy từ socket, persistent, chờ publisher confirm; lỗi → system.error SEND_FAILED ngay)
      ▼
 RabbitMQ     chat.commands
      ▼
 chat-service ChatCommandsController (prefetch 1): ChatService.sendMessage
      │       = kiểm tra thành viên → transaction (last_seq + 1, insert; idempotent theo clientMessageId)
      │       → publish chat.message.created { message, recipientUserIds }  → ack
      │       (không phải thành viên → chat.message.rejected NOT_A_MEMBER → ack; lỗi tạm → nack → retry)
      ▼
 RabbitMQ     rtc.events ──▶ gateway.events.<instance> (mọi instance)
      ▼
 api-gateway  GatewayEventsController → mọi socket của recipientUserIds
      ▼
 trình duyệt  chat.message → reducer chèn theo seq, bỏ trùng → MessageList
```

### Correlation id

Gateway tạo một id cho mỗi request HTTP (dùng header `x-correlation-id` của client nếu hợp lệ, và trả lại nó trong response) và cho mỗi frame `chat.send`. Id đi qua header AMQP của RPC / command, và nằm trong envelope của event. Cả ba app log kèm `[correlationId=…]`, ví dụ một lần đăng ký:

```
api-gateway   [HTTP] POST /api/auth/register 201 in 33ms [correlationId=chaos-corr-atzcv]
auth-service  [AuthService] Registered user 054f… [correlationId=chaos-corr-atzcv]
chat-service  [UserSyncController] Synced user 054f… [correlationId=chaos-corr-atzcv]
```

### Lỗi

Service ném lỗi miền (`AppError` với `code` của contracts); qua RPC chúng thành `{ code, message, details? }` và gateway trả đúng `ApiError` của giai đoạn 2, status lấy từ **một bảng duy nhất** (`API_ERROR_STATUS` trong contracts). Mã mới **`SERVICE_UNAVAILABLE` (503)**: RPC hết thời gian, không có consumer, hoặc mất kết nối broker. Frontend hiện câu thân thiện cho mã này ở form đăng nhập / đăng ký và khi tải hội thoại.

## REST API

Mọi route nằm dưới `/api`, **mặc định cần** `Authorization: Bearer <access token>`; gateway **xác minh JWT tại chỗ** (HS256 ghim), không gọi auth-service. Body được validate bằng schema của `shared/contracts`.

| Method | Đường dẫn                                    | Public | Ghi chú                                                                                                             |
| ------ | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                    | ✔      | 200 `ok` / 503 `degraded` với `services: { auth, chat, rabbitmq }`                                                  |
| POST   | `/auth/register`                             | ✔      | 201 `AuthResponse` + cookie refresh; 409 `EMAIL_TAKEN` / `USERNAME_TAKEN`                                           |
| POST   | `/auth/login`                                | ✔      | 200 `AuthResponse` + cookie; 401 `INVALID_CREDENTIALS`                                                              |
| POST   | `/auth/refresh`                              | ✔      | đọc cookie, xoay token; 401 `INVALID_REFRESH_TOKEN` (xoá cookie; giữ cookie nếu 503)                                |
| POST   | `/auth/logout`                               | ✔      | 204; xoá cookie, thu hồi phiên → socket của phiên đóng 4401. 503 nếu auth-service không trả lời (cookie vẫn bị xoá) |
| GET    | `/auth/me`                                   |        | `CurrentUser`                                                                                                       |
| POST   | `/auth/ws-ticket`                            |        | `{ ticket, expiresIn }`; 401 nếu phiên đã kết thúc                                                                  |
| GET    | `/users/search?q=`                           |        | tiền tố username (≥ 2 ký tự), tối đa 10, không gồm người gọi                                                        |
| GET    | `/conversations`                             |        | mới hoạt động nhất trước, kèm thành viên và tin cuối                                                                |
| POST   | `/conversations`                             |        | `{ type: 'dm', userId }` (201, hoặc 200 nếu DM đã có) / `{ type: 'group', name, memberIds }`                        |
| GET    | `/conversations/:id/messages?before=&limit=` |        | phân trang theo `seq` (mặc định 30, tối đa 100); không phải thành viên → **404**                                    |

Mọi lỗi: `{ "error": { "code", "message", "details"? } }`. `code` ∈ `VALIDATION_FAILED` (400), `INVALID_CREDENTIALS` / `UNAUTHENTICATED` / `TOKEN_EXPIRED` / `INVALID_REFRESH_TOKEN` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `EMAIL_TAKEN` / `USERNAME_TAKEN` (409), `INTERNAL_ERROR` (500), `SERVICE_UNAVAILABLE` (503).

## Xác thực

```
 đăng nhập ──▶ access token (JWT HS256, 15', claims sub + sid) ── trong bộ nhớ (NgRx), không localStorage
          └──▶ refresh token (ngẫu nhiên, 7 ngày)  ── cookie httpOnly, SameSite=Strict, Path=/api/auth
                                                      auth_db chỉ lưu SHA-256 của nó
```

- **auth-service** ký access token và quản lý refresh token; **gateway** xác minh access token bằng cùng secret và đặt / xoá cookie. Service không bao giờ thấy cookie.
- **Mật khẩu:** argon2id; email không tồn tại vẫn băm một hash giả (thời gian trả lời như nhau).
- **Refresh xoay vòng** trong transaction có điều kiện `revokedAt IS NULL`; **dùng lại** token đã xoay sau `REFRESH_REUSE_GRACE_SECONDS` → thu hồi cả phiên và phát `auth.session.revoked` (mọi gateway đóng socket 4401).
- **Client** (`libs/shared/auth`): refresh ngầm lúc khởi động, interceptor single-flight khi `TOKEN_EXPIRED`, Web Lock giữa các tab, guard, `safeReturnUrl`.

## Giao thức WebSocket

**Kết nối:** `POST /api/auth/ws-ticket` (Bearer) → `ws://<host>:3000/ws?ticket=<ticket>`

- Ticket ngẫu nhiên, lưu trong Redis của auth-service (TTL 30 s), **dùng một lần** (`GETDEL`), chỉ cấp và chỉ nhận cho **phiên còn sống**. Gateway tiêu thụ ticket qua RPC `auth.ws-ticket.consume`.
- Upgrade bị từ chối: `Origin` lạ → **403** (kiểm trước, không đốt ticket); ticket thiếu / sai / đã dùng / phiên đã kết thúc → **401**; auth-service không trả lời → **503**.
- Danh tính (`userId`, `sid`) gắn vào socket lúc upgrade; frame không mang token.

| Hướng           | `event`                | `data`                                                                              |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| client → server | `chat.send`            | `{ conversationId, clientMessageId: uuid, text }`: text trim, 1–2000 ký tự          |
| server → client | `session.welcome`      | `{ userId }`                                                                        |
| server → client | `chat.message`         | `MessageDTO = { id, conversationId, seq, clientMessageId, senderId, text, sentAt }` |
| server → client | `conversation.created` | `{ conversation }`                                                                  |
| server → client | `system.error`         | `{ code, message, clientMessageId? }`                                               |

- **`chat.send` không còn trả lời đồng bộ về nghiệp vụ:** gateway chỉ đẩy command. Kết quả về sau: `chat.message` (thành công, tới mọi thành viên kể cả người gửi), hoặc `system.error` kèm `clientMessageId` (`NOT_A_MEMBER`, `SEND_FAILED`). Không đẩy được command (broker mất) → `SEND_FAILED` ngay.
- Gateway **không có phòng**: event mang `recipientUserIds`, gateway chỉ cần registry `userId → sockets` và `sid → sockets`.
- **Close code:** `4401` phiên đã kết thúc → client không nối lại, tự đăng xuất. **`4000`** socket đạt `WS_MAX_AGE_SECONDS` → client nối lại bằng ticket mới (phiên đã hết hạn thì không được cấp ticket → 401 → đăng xuất). `1008` thiếu danh tính, `1009` frame > 8 KB, `1001` server tắt.
- Frame sai không đóng kết nối; server không log nội dung tin nhắn.

## Luồng dữ liệu phía client

Không đổi ở giai đoạn 3 (ngoài mã `4000`):

```
 AuthActions.sessionEstablished ─▶ ChatActions.connect ─▶ ChatSocketService.connect()
                                                            │ mỗi lần thử: POST /auth/ws-ticket → ws?ticket=…
 AuthActions.logout / sessionEnded ─▶ disconnect + stateReset
 close 4401 / ticket 401 ─▶ connectionRejected ─▶ sessionEnded('revoked')
 close 4000 / mất kết nối ─▶ reconnecting (backoff + jitter, ticket mới)

 session.welcome ─▶ tải lại danh sách + trang mới nhất của mọi lịch sử đang giữ
 chat.message    ─▶ chèn theo seq, bỏ trùng; lastMessage, sắp lại danh sách
 conversation.created ─▶ thêm vào danh sách
```

Chi tiết (lịch sử theo hội thoại, giữ vị trí cuộn, ai đăng ký provider nào) như giai đoạn 2: xem lịch sử git của README (`067e75b`).

## Ranh giới module

Tag trong `project.json`; `@nx/enforce-module-boundaries` (`eslint.config.mjs`) chặn import sai khi lint.

| Project                          | Tag                                                                     |
| -------------------------------- | ----------------------------------------------------------------------- |
| `shell`                          | `scope:shell`, `type:app`, `platform:angular`                           |
| `mfe-auth`, `mfe-chat`           | `scope:mfe`, `type:app`, `platform:angular`                             |
| `api-gateway`                    | `scope:api`, `type:app`, `platform:node`, **`domain:edge`**             |
| `auth-service`                   | `scope:api`, `type:app`, `platform:node`, `domain:auth`                 |
| `chat-service`                   | `scope:api`, `type:app`, `platform:node`, `domain:chat`                 |
| `shell-e2e`                      | `scope:e2e`, `type:e2e`                                                 |
| `contracts`                      | `scope:shared`, `type:lib`, `platform:any`, `access:public`             |
| `ui`, `auth`, `chat-data-access` | `scope:shared`, `type:lib`, `platform:angular`, `access:public`         |
| `socket`                         | `scope:shared`, `type:lib`, `platform:angular`, `access:shell-only`     |
| `api-auth` / `api-chat`          | `scope:api`, `type:lib`, `platform:node`, `domain:auth` / `domain:chat` |
| `api-redis`                      | `scope:api`, `type:lib`, `platform:node`, `domain:infra`                |
| `api-messaging`                  | `scope:api`, `type:lib`, `platform:node`, `domain:shared`               |

Quy tắc backend:

- **`domain:edge`** (gateway) chỉ phụ thuộc `platform:any` (contracts) + `domain:shared` (messaging): không lib domain, không Prisma, không Redis.
- **`domain:auth`** / **`domain:chat`** chỉ phụ thuộc `platform:any`, `domain:infra`, `domain:shared` và **domain của chính nó**: auth-service không import gì của chat và ngược lại; chúng chỉ gặp nhau qua RabbitMQ. App cũng không import được app (luật của Nx).
- Frontend: như giai đoạn 2 (`mfe-*` chỉ import lib `access:public` trực tiếp; `socket` chỉ cho shell; xem lịch sử git cho phần giải thích).

## UI và Native Federation

Không đổi ở giai đoạn 3: Tailwind v4 cấu hình bằng CSS, shell `@source` cả source của các remote (federation share code, không share CSS), zard/ui copy vào `libs/shared/ui`, chữ trên giao diện bằng tiếng Anh; shell là dynamic host, remote expose `./routes`, chính sách share ở `tools/federation/shared.mjs`.

## Kiểm thử

| Loại         | Ở đâu                                                                              | Cần                         |
| ------------ | ---------------------------------------------------------------------------------- | --------------------------- |
| Domain (lib) | `libs/api/auth`, `libs/api/chat` (khôi phục từ giai đoạn 2, chạy lại được)         | Postgres `*_test`, Redis 15 |
| Messaging    | `libs/api/messaging`: RPC, timeout + hết hạn, fan-out, retry → DLQ, ack sau xử lý  | RabbitMQ                    |
| Service      | `apps/auth-service`, `apps/chat-service`: AppModule thật qua RabbitMQ              | Postgres, Redis, RabbitMQ   |
| Gateway      | `apps/api-gateway`: ticket, command, event → socket, registry, tuổi socket         | RabbitMQ                    |
| Unit         | contracts (schema messaging), lỗi `SERVICE_UNAVAILABLE`, close code client, health | —                           |
| End-to-end   | `apps/shell-e2e` (11 kịch bản, không đổi logic từ giai đoạn 2)                     | `serve:all`                 |
| Chịu lỗi     | `tools/chaos/run.mjs` (`npm run chaos`)                                            | build backend, `infra:up`   |

- Test tích hợp dùng exchange / queue có **tiền tố ngẫu nhiên** trên RabbitMQ dùng chung và xoá chúng sau khi chạy; database `auth_test` / `chat_test` được tạo và migrate tự động.
- **E2E** (`npm run e2e`): dùng lại `serve:all` nếu đang chạy (Playwright chờ `/api/health` 200, tức cả hai service đã lên). Sau mỗi lần chạy, `global-teardown.mts` **xoá các tài khoản `@example.test`** và dữ liệu của chúng ở `auth_db` và `chat_db` (hội thoại chỉ gồm user test, membership, `chat_users`). `E2E_KEEP_DATA=1` để giữ lại. Các user dựng tay khi thử nghiệm (`probe_*`, `smoke_*`) cũng dùng `@example.test` nên được dọn cùng; dữ liệu khác chỉ xoá được bằng `npm run db:reset`.
- `nx test` chạy qua SWC nên **không kiểm kiểu** của spec: chạy `npx tsc -p <project>/tsconfig.spec.json --noEmit` khi sửa test.

### Kịch bản chịu lỗi (chaos)

```bash
npx nx run-many -t build -p api-gateway auth-service chat-service
npm run chaos            # tất cả; hoặc: npm run chaos -- a d
```

Script dựng **stack cô lập** với `serve:all`: ba app chạy từ `dist/`, vhost RabbitMQ `chaos`, database `auth_test` / `chat_test`, Redis 15, gateway cổng 3100, `RPC_TIMEOUT_MS=3000`. Nó chỉ tắt / kill tiến trình do chính nó tạo. Log ở `dist/chaos/<app>.log`. **Kịch bản (c) khởi động lại container RabbitMQ**, nên `serve:all` đang chạy cũng mất kết nối vài giây (và tự hồi phục).

|     | Kịch bản                                                                  | Kết quả (lần chạy ghi lại)                                                                                        |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| a   | Tắt chat-service, gửi 3 tin, bật lại                                      | 3 tin chờ trong `chat.commands`; sau khi bật, mỗi tin tới đúng 1 lần, `seq` 1,2,3 liên tục                        |
| b   | Tắt auth-service                                                          | login 503 `SERVICE_UNAVAILABLE` sau 3 007 ms (timeout 3 000 ms); socket đang mở vẫn chat; health 503 `auth: down` |
| c   | Khởi động lại container RabbitMQ                                          | health ok lại sau 11 s không cần restart app; queue riêng của gateway được khai báo lại; chat tiếp trên socket cũ |
| d   | Command lỗi cố ý (đổi tên bảng `messages` trong `chat_test`)              | đúng 3 lần thử → DLQ (+1), người gửi nhận `SEND_FAILED`, tin không lưu, service vẫn sống                          |
| e   | `kill -9` chat-service khi đang lưu (khoá dòng giữ nó ở giữa transaction) | message được giao lại, lưu 1 lần, nhận 1 lần                                                                      |
| f   | Tắt auth-service, đăng ký (timeout), bật lại                              | 0 user được tạo: request đã hết hạn trong queue, không bị xử lý muộn                                              |
| g   | Một correlation id qua cả ba app                                          | có trong log của gateway, auth-service, chat-service                                                              |

## Đánh đổi và giới hạn

- **At-least-once ⇒ consumer phải idempotent.** Command được ack **sau** khi lưu và phát event kết quả; chết giữa chừng thì message được giao lại. Lưu tin idempotent theo `(conversation, sender, clientMessageId)`, nên giao lại chỉ khiến `chat.message.created` được phát lại; client bỏ trùng theo `id` / `seq`. `auth.session.revoked` có thể tới nhiều lần cho cùng `sid` (đóng socket lần hai không làm gì). `chat_users` cập nhật bằng upsert.
- **Thứ tự.** Gateway publish các `chat.send` của một socket lần lượt (có confirm), chat-service xử lý `chat.commands` với `prefetch(1)`, nên tin của một người trên một socket được lưu theo thứ tự gõ. **Retry làm đảo thứ tự**: tin lỗi tạm thời quay lại sau 5 s, các tin sau nó đã được lưu trước. Nhiều instance chat-service (chưa làm) cũng làm mất thứ tự giữa các tin đang xử lý song song. Hai tab của cùng một người gửi đồng thời: thứ tự do server quyết định.
- **Ghi kép (dual-write).** Ghi DB rồi publish event là hai bước. Với `chat.send` không sao: publish lỗi → nack → retry → lưu idempotent → publish lại. Với `auth.register` và `chat.conversations.create` thì **chấp nhận rủi ro**: DB đã ghi nhưng caller nhận lỗi (đăng ký lại → `EMAIL_TAKEN`; chat-service vẫn biết user nhờ read-through; hội thoại hiện ở lần tải danh sách sau). Hướng nâng cấp: **transactional outbox** (ghi event vào bảng trong cùng transaction, một tiến trình đẩy bảng đó lên RabbitMQ).
- **Event-carried state transfer.** chat-service giữ bản sao user (`chat_users`), nên vẫn chạy khi auth-service tắt, trừ khi gặp user chưa từng thấy (read-through cần auth-service). Bản sao không cập nhật khi user đổi tên (chưa có tính năng đổi tên).
- **JWT đối xứng (HS256).** Gateway và auth-service dùng chung secret: ai giữ secret xác minh được thì cũng **ký** được. Hướng nâng cấp: RS256 / EdDSA, auth-service giữ khoá bí mật, gateway chỉ cần khoá công khai (JWKS). Service tin `userId` gateway gửi (mạng nội bộ).
- **Tin gửi lúc chat-service ngừng** chỉ hiện ra sau khi nó phục hồi; UI chưa có trạng thái "đang gửi" / ack nên người dùng không biết tin đang chờ (giai đoạn 4).
- **Một câu SQL bị khoá chặn giữ consumer vô hạn.** Timeout của transaction Prisma không huỷ được câu đang chờ khoá (thấy rõ khi làm kịch bản chaos), và với `prefetch(1)` cả `chat.commands` đứng theo. Nên đặt `lock_timeout` / `statement_timeout` cho kết nối của chat-service.
- **Kết nối lại.** Kết nối riêng của `libs/api/messaging` dùng backoff tăng dần (0,5 s → 30 s); các kết nối do transport RMQ của Nest mở (server, client RPC) thử lại theo chu kỳ cố định 1 s.
- **Một instance** gateway và chat-service đã được kiểm chứng; topology đã chuẩn bị cho nhiều instance gateway (mỗi instance một queue) nhưng chưa thử.
- Chưa có: rate limiting, presence, đang gõ, đã xem, thêm / bớt thành viên, transactional outbox, RabbitMQ cluster / quorum queue, vhost và user riêng cho từng service.

## Quyết định kiến trúc

### 1. WebSocket thuần (`ws`) thay vì Socket.IO

| Việc                         | Trạng thái                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Định dạng message và routing | ✅ envelope `{ event, data }`, schema chung, `messageParser` riêng                       |
| Reconnect phía client        | ✅ backoff + jitter, ticket mới mỗi lần, bắt kịp tin lỡ khi `session.welcome`            |
| Heartbeat, tuổi tối đa       | ✅ ping/pong; đóng 4000 sau `WS_MAX_AGE_SECONDS`                                         |
| Xác thực khi handshake       | ✅ Origin + ticket dùng một lần (qua auth-service)                                       |
| Room / channel               | ✅ không cần phòng: event mang `recipientUserIds`                                        |
| Ack / request-response       | ⏳ `clientMessageId` + idempotency có; lỗi về qua `system.error`; chưa có ack thành công |
| Scale nhiều instance gateway | ⏳ mỗi instance một queue nhận mọi event (đã chuẩn bị, chưa kiểm chứng)                  |

### 2. Ba app backend, lib domain không biết RabbitMQ

- Service là app NestJS **hybrid không mở HTTP** (`NestFactory.create` + `connectMicroservice`), không phải `createMicroservice`: khi tắt, Nest gọi `beforeApplicationShutdown` (ngừng nhận message mới, chờ handler đang chạy để chúng kịp ack) **trước khi** đóng server RMQ; `createMicroservice` đóng server trước.
- Handler RabbitMQ ở trong app; lib domain giữ nguyên là service thuần, phát event qua port `EventPublisher` (bắt buộc: app quên cung cấp thì lỗi ngay lúc khởi động).

### 3. Transport RMQ của Nest + một kết nối `amqp-connection-manager` riêng

- RPC, server command / event: transport RMQ của `@nestjs/microservices` 12.3 (ESM, khớp Nest 12): topic exchange + `wildcards`, `RmqRecordBuilder` (`expiration`, `persistent`, header), ack thủ công qua `RmqContext`, publisher confirm (kênh của `amqp-connection-manager` là confirm channel).
- Phần transport không làm: khai báo **toàn bộ** topology (queue retry / DLQ không có consumer) lại sau mỗi lần nối lại, và chép vào DLQ có confirm. `libs/api/messaging` mở thêm một kết nối `amqp-connection-manager` (thư viện mà Nest vốn dùng) cho việc đó và cho mọi publish event / command. Publish **lỗi ngay** khi mất kết nối thay vì để thư viện giữ message trong bộ nhớ rồi gửi muộn (người gửi đã được báo `SEND_FAILED`).
- Các server RMQ trong một app **dùng chung handler**: queue bền như `chat.user-sync` không dùng `wildcards` (nếu không Nest bind nó với mọi pattern của app); binding đến từ topology.

### 4. RPC có `expiration` bằng đúng timeout

Request quá hạn bị broker bỏ, nên service bật lại sau khi caller đã bỏ cuộc không xử lý "request ma" (kịch bản f). Không có consumer, mất broker, quá hạn: đều thành `SERVICE_UNAVAILABLE` 503.

### 5. Gateway xác minh JWT tại chỗ

Mỗi request REST không tốn một RPC tới auth-service; đổi lại phải chia sẻ secret (xem Đánh đổi). Vòng đời phiên được bảo đảm bởi: ticket chỉ cấp cho phiên sống, `auth.session.revoked` đóng socket, tuổi tối đa của socket.

### 6. Các quyết định của giai đoạn 2 vẫn giữ

Prisma 7 + driver adapter `pg` (một `pg.Pool` mỗi service), mỗi domain một database không khoá ngoại chéo, access token trong bộ nhớ + refresh token trong cookie httpOnly, `seq` theo hội thoại + phân trang con trỏ, một socket theo phiên do shell sở hữu, NgRx cho state dùng chung, NestJS 12 + Vitest + `unplugin-swc`.

## Bài học rút ra

### Giai đoạn 3

- **Timeout của transaction Prisma không huỷ câu SQL đang chờ khoá.** Consumer bị giữ tới khi khoá nhả; với `prefetch(1)` cả queue đứng. Muốn gây lỗi tạm thời trong test, làm câu lệnh lỗi ngay (đổi tên bảng) thay vì chặn nó.
- **Publish khi mất kết nối:** `ChannelWrapper.publish` của `amqp-connection-manager` mặc định **giữ message trong bộ nhớ và gửi sau**. Ở lớp biên điều đó tạo message ma; kiểm tra `isConnected()` trước và đặt `timeout` cho publish.
- **`close()` không được chờ backoff:** khoảng chờ kết nối lại (tới 30 s) phải huỷ được, nếu không tắt app lúc broker chết bị treo.
- **Queue exclusive chỉ dùng được bởi kết nối đã khai báo nó**: queue riêng của gateway phải do chính server RMQ của gateway khai báo, và được khai báo lại sau mỗi lần nối lại (broker khởi động lại xoá nó).
- **Một app Nest nhiều server RMQ dùng chung handler** → `wildcards` trên một queue bền bind nó với mọi pattern của app.
- **`@EventPattern` của Nest 12 gõ các tham số sau là `unknown`**: nhận `context` dạng `unknown` rồi ép kiểu.
- **`nx test` (SWC) không kiểm kiểu spec**: lỗi kiểu trong test chỉ lộ khi chạy `tsc -p tsconfig.spec.json`.
- **Plugin Nx sinh `package.json` của app kèm mọi peer dependency đã cài** (ví dụ `ioredis` của `@nestjs/microservices`), dù bundle không dùng: kiểm tra bằng bundle, không bằng danh sách đó.
- **Playwright biên dịch `globalTeardown` dạng `.ts` sang CommonJS**: không import được module ESM có `import.meta`; dùng `.mts`.
- **Health trả 503 khi thiếu service** để Playwright `webServer` (và load balancer) có thể chờ đúng lúc cả stack sẵn sàng.
- **Log của gateway ghi khi response kết thúc** (`finish`): có thể tới sau khi client đã nhận response; khi so log giữa các app thì chờ cả ba.

### Giai đoạn 2

- **CORS không áp dụng cho WebSocket, và trình duyệt không cho đặt header khi mở socket.** Xác thực bằng ticket ngắn hạn dùng một lần; kiểm tra `Origin` trước khi đụng tới ticket.
- **Các frame của một socket xử lý song song thì `seq` theo thứ tự commit**, không theo thứ tự gửi. Xếp hàng theo socket.
- **Trình duyệt bỏ qua implicit submission khi nút submit đang `disabled`**; với zoneless, gõ nhanh là mất tin. Tự xử lý `keydown.enter`, bỏ qua khi `isComposing` (Telex / VNI).
- **Neo vị trí cuộn vào chính tin đang đọc** khi chèn tin cũ; chỉ báo "đang tải" nổi lên trên.
- **Native Federation share code, không share CSS.** **Build production khi dev server đang chạy** ghi đè `dist`. **Plugin Playwright của Nx tự thêm `dependsOn: serve`.**
- **Global filter của Nest không áp dụng cho WebSocket gateway, nhưng global guard thì có.** **Prisma 7 + adapter: `$connect()` lazy.** **`ioredis.quit()` resolve trước khi socket đóng.** **`startsWith` của Prisma không escape `_` / `%`.**
- **Angular không có API công khai để lib thêm interceptor dạng hàm.** **`notDependOnLibsWithTags` của Nx xét bắc cầu.**

### Giai đoạn 1

- `WsAdapter` mặc định của Nest im lặng bỏ frame sai; `toObservable(signal)` gộp thay đổi trong cùng tick; `exhaustMap` cho `connect` idempotent; `retry({ delay, resetOnSuccess })` + `defer()` cho reconnect; lib buildable không phụ thuộc lib non-buildable; `[textContent]` với `whitespace-pre-wrap`; `getReadyUrl()` của Nx không hợp với nhiều `webServer`; `page.routeWebSocket()` để cắt kết nối trong test.
