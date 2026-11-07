# Realtime Chat

Dự án cá nhân để học: hệ thống chat realtime gồm **Angular micro-frontend (Native Federation)**, **NestJS**, **WebSocket thuần (`ws`)**, **PostgreSQL (Prisma)**, **Redis** và (sau này) **RabbitMQ**, gom trong một **Nx workspace**.

> Trạng thái: **Giai đoạn 2 — tài khoản, hội thoại và lịch sử.** Đăng ký / đăng nhập; WebSocket chỉ dành cho người đã đăng nhập; chat 1-1 và nhóm; tin nhắn lưu trong PostgreSQL, tải lịch sử bằng phân trang con trỏ khi cuộn lên. Backend vẫn là **một** `api-gateway`, nhưng chia theo domain thành các lib Nx (`libs/api/auth`, `libs/api/chat`) để tách thành service ở giai đoạn 3.

## Kiến trúc hiện tại

```
 Trình duyệt
 ┌──────────────────────────────────────────────────────────┐
 │ shell (host, :4200) — Store gốc, phiên đăng nhập, 1 socket │
 │  ├─ mfe-auth (:4201)  /auth/login, /auth/register        │   Native Federation:
 │  └─ mfe-chat (:4202)  /chat, /chat/:conversationId       │   nạp remote lúc chạy qua
 └──────────────┬───────────────────────────────────────────┘   federation.manifest.json
                │ REST /api/* (Bearer + cookie refresh)
                │ WebSocket /ws?ticket=… (WebSocket API gốc của trình duyệt)
                ▼
 ┌──────────────────────────────────────────────────────────┐
 │ api-gateway (NestJS, :3000)                              │
 │  apps/api-gateway: controller HTTP, ChatGateway (ws), guard, filter
 │  libs/api/auth  (domain:auth)  — users, mật khẩu, JWT, refresh, ticket
 │  libs/api/chat  (domain:chat)  — hội thoại, thành viên, tin nhắn, seq
 │  libs/api/redis (domain:infra) — một kết nối ioredis dùng chung
 └───────┬──────────────────┬──────────────────┬────────────┘
         ▼                  ▼                  ▼
   PostgreSQL auth_db  PostgreSQL chat_db   Redis (ticket WebSocket)
```

**Kiến trúc đích** (giai đoạn sau): `auth-service` và `chat-service` tách khỏi gateway, nói chuyện qua RabbitMQ; Redis lo presence và pub/sub để chạy nhiều instance gateway; `mfe-notifications` (:4203). Ranh giới domain hiện tại (mỗi domain một lib, một database, chỉ gặp nhau qua "port") được dựng sẵn cho bước tách đó.

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
npm run serve:all         # shell + mfe-auth + mfe-chat + api-gateway
```

Sau đó mở:

- http://localhost:4200: shell. Chưa đăng nhập → `/auth/login`. Đăng ký tài khoản, rồi mở thêm một cửa sổ ẩn danh (cookie riêng) để đăng ký người thứ hai và chat với nhau.
- http://localhost:4200/chat: danh sách hội thoại + hội thoại đang mở (mfe-chat).
- http://localhost:4200/status: trang kiểm tra `GET /api/health`.
- http://localhost:4201, http://localhost:4202: các remote chạy độc lập. mfe-chat độc lập không có form đăng nhập: nó dùng phiên đã đăng nhập ở shell (cookie refresh của `localhost`), chưa đăng nhập thì hiện trang hướng dẫn.
- http://localhost:3000/api/health → `{"status":"ok"}`
- http://localhost:15672: RabbitMQ management (chưa dùng ở giai đoạn 2).

**Lưu ý với `.env`:**

- `DATABASE_URL_*` phải khớp `POSTGRES_USER` / `POSTGRES_PASSWORD` **mà volume Postgres được tạo lần đầu**. Đổi mật khẩu trong `.env` sau đó không đổi mật khẩu trong volume: gateway sẽ không khởi động được (Prisma báo lỗi xác thực). Hoặc đặt lại mật khẩu cũ, hoặc tạo lại volume (mất dữ liệu).
- `CORS_ORIGINS` phải có `http://localhost:4201` và `:4202` nếu muốn chạy remote độc lập (request REST kèm cookie).
- Volume Postgres có sẵn từ giai đoạn 1 chưa có `auth_test` / `chat_test`: chạy `npm run db:test:ensure` (script init chỉ chạy khi volume mới).

npm 11 chặn install script của dependency nếu chưa được duyệt (`allowScripts` trong `package.json`). Script của `prisma`, `@prisma/engines` và `argon2` **không cần**: argon2 có sẵn bản build cho nền tảng phổ biến, Prisma CLI tự tải schema engine khi cần.

### Các lệnh

| Lệnh                              | Tác dụng                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run infra:up` / `infra:down` | Bật / tắt docker compose (dữ liệu giữ trong volume)          |
| `npm run infra:logs`              | Theo dõi log hạ tầng                                         |
| `npm run db:generate`             | Sinh Prisma client cho `libs/api/auth` và `libs/api/chat`    |
| `npm run db:migrate`              | `prisma migrate deploy` cho cả hai database dev              |
| `npm run db:reset`                | **Xoá toàn bộ dữ liệu** của hai database dev rồi migrate lại |
| `npm run db:test:ensure`          | Tạo `auth_test` / `chat_test` nếu thiếu, migrate             |
| `npm run serve:all`               | Chạy shell, mfe-auth, mfe-chat, api-gateway                  |
| `npm run lint` / `build` / `test` | Chạy trên toàn workspace (`nx run-many`)                     |
| `npm run e2e`                     | Playwright (Chromium), xem [Kiểm thử](#kiểm-thử)             |
| `npm run format` / `format:check` | Prettier                                                     |
| `npx nx serve <project>`          | Chạy riêng một project                                       |
| `npx nx graph`                    | Xem đồ thị phụ thuộc                                         |

> **Đừng `npm run build` khi `serve:all` đang chạy.** Dev server Native Federation phục vụ `remoteEntry.json` và các bundle dùng chung từ `dist/apps/<app>/browser`; bản build production ghi đè lên đó, trình duyệt nhận `@angular/core` bản production cùng code app bản dev → `ReferenceError: ngDevMode is not defined`, trang trắng. Khởi động lại `serve:all` để sửa.

Thêm migration mới (khi đổi `schema.prisma`):

```bash
npx prisma migrate dev --config libs/api/chat/prisma.config.ts --name <tên>
```

Migration được commit; Prisma client sinh ra (`libs/api/*/src/generated`) thì không.

## Cổng

| Cổng  | Thành phần             | Ghi chú                              |
| ----- | ---------------------- | ------------------------------------ |
| 4200  | `shell`                | host (dynamic host)                  |
| 4201  | `mfe-auth`             | remote: đăng nhập, đăng ký           |
| 4202  | `mfe-chat`             | remote: hội thoại                    |
| 4203  | `mfe-notifications`    | dành cho giai đoạn 4                 |
| 3000  | `api-gateway`          | HTTP prefix `/api`, WebSocket `/ws`  |
| 5432  | PostgreSQL 16          | `auth_db`, `chat_db` (+ `*_test`)    |
| 6379  | Redis 7                | ticket WebSocket (test: database 15) |
| 5672  | RabbitMQ AMQP          | giai đoạn 3                          |
| 15672 | RabbitMQ management UI |                                      |

## Biến môi trường

**api-gateway** đọc `.env` (mẫu: `.env.example`, chỉ chứa placeholder) và validate bằng zod lúc khởi động (`apps/api-gateway/src/config/env.schema.ts`). Thiếu hoặc sai định dạng thì process dừng ngay với thông báo dễ đọc.

| Biến                          | Mặc định                                                       | Ý nghĩa                                                                                        |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                                                  | `development` \| `production` \| `test`                                                        |
| `API_GATEWAY_PORT`            | `3000`                                                         | Cổng HTTP, WebSocket dùng chung cổng này                                                       |
| `CORS_ORIGINS`                | `http://localhost:4200,…:4201,…:4202`                          | Origin được gọi REST **kèm cookie** (CORS không áp dụng cho WebSocket)                         |
| `WS_PATH`                     | `/ws`                                                          | Đường dẫn WebSocket                                                                            |
| `WS_ALLOWED_ORIGINS`          | `http://localhost:4200,http://localhost:4202`                  | Origin được mở WebSocket, kiểm tra lúc upgrade; sai thì **403**                                |
| `WS_HEARTBEAT_MS`             | `30000`                                                        | Chu kỳ ping; client lỡ một pong thì bị `terminate()`                                           |
| `DATABASE_URL_AUTH`           | (bắt buộc)                                                     | `postgresql://…/auth_db`                                                                       |
| `DATABASE_URL_CHAT`           | (bắt buộc)                                                     | `postgresql://…/chat_db`                                                                       |
| `REDIS_URL`                   | (bắt buộc)                                                     | `redis://localhost:6379`                                                                       |
| `JWT_ACCESS_SECRET`           | bắt buộc khi `production`; dev dùng khoá cố định không an toàn | Khoá HS256, ≥ 32 ký tự                                                                         |
| `JWT_ACCESS_TTL_SECONDS`      | `900`                                                          | Tuổi access token (15 phút)                                                                    |
| `REFRESH_TTL_DAYS`            | `7`                                                            | Tuổi refresh token                                                                             |
| `REFRESH_REUSE_GRACE_SECONDS` | `10`                                                           | Refresh token vừa bị xoay mà được dùng lại trong khoảng này: 401 nhưng **không** thu hồi phiên |
| `WS_TICKET_TTL_SECONDS`       | `30`                                                           | Tuổi ticket WebSocket chưa dùng                                                                |
| `COOKIE_SECURE`               | `false`                                                        | Thêm cờ `Secure` cho cookie refresh (đặt `true` sau HTTPS)                                     |

Test có thể ghi đè `TEST_DATABASE_URL_AUTH` / `_CHAT` (mặc định: URL dev đổi tên database thành `auth_test` / `chat_test`) và `TEST_REDIS_URL` (mặc định: database 15).

**Frontend** không đọc được `.env`: giá trị được đóng gói vào bundle lúc build.

| File                                            | Khóa                  | Giá trị                                               |
| ----------------------------------------------- | --------------------- | ----------------------------------------------------- |
| `apps/shell/src/environments/environment*.ts`   | `apiBaseUrl`, `wsUrl` | `http://localhost:3000/api`, `ws://localhost:3000/ws` |
| `apps/mfe-auth/src/environments/environment.ts` | `apiBaseUrl`          | chỉ dùng khi chạy độc lập                             |
| `apps/mfe-chat/src/environments/environment.ts` | `apiBaseUrl`, `wsUrl` | chỉ dùng khi chạy độc lập                             |

> dev và prod hiện cùng URL vì chưa có môi trường deploy. Khi deploy, nên để shell tải `config.json` lúc chạy (giống `federation.manifest.json`) thay vì một bản build cho mỗi môi trường; URL là `https://` / `wss://`.

## Cấu trúc thư mục

```
realtime-chat/
├── apps/
│   ├── shell/                  # host: Store gốc, provideAuth, provideChatConnection, header (badge, user menu)
│   ├── mfe-auth/               # remote ./routes: LoginPage, RegisterPage (Reactive Forms + zard/ui)
│   ├── mfe-chat/               # remote ./routes: ChatLayout, ConversationList, ConversationPage,
│   │                           #   MessageList, MessageComposer, NewConversationDialog
│   ├── api-gateway/            # NestJS: auth/, users/, conversations/ (HTTP), chat/ (WebSocket), http/ (pipe, filter)
│   └── shell-e2e/              # Playwright
├── libs/
│   ├── api/                    # backend, theo domain (platform:node)
│   │   ├── auth/               #   Prisma (auth_db), AuthService, AccessTokenService, WsTicketService…
│   │   ├── chat/               #   Prisma (chat_db), ChatService, USERS_PORT
│   │   └── redis/              #   RedisModule (REDIS_CLIENT)
│   └── shared/                 # dùng chung
│       ├── contracts/          #   TypeScript thuần + zod: DTO REST, lỗi, giới hạn, giao thức WebSocket
│       ├── auth/               #   Angular: phiên đăng nhập (NgRx), interceptor, guard, refresh
│       ├── socket/             #   Angular: ChatSocketService (WebSocket gốc, ticket, reconnect) — chỉ shell
│       ├── chat-data-access/   #   Angular: state hội thoại / lịch sử / kết nối, effects, REST client
│       └── ui/                 #   design tokens + component zard/ui
├── tools/
│   ├── federation/shared.mjs   # chính sách share dependency cho mọi app federation
│   └── db/                     # env.mjs (đọc .env), databases.mjs (migrate / reset / test DB)
├── infra/postgres/init/        # script tạo database lúc khởi tạo volume
├── docker-compose.yml
└── .env.example
```

## REST API

Mọi route nằm dưới `/api`, **mặc định cần** `Authorization: Bearer <access token>` (guard toàn cục); route `@Public()` được ghi rõ. Body được validate bằng schema của `shared/contracts`.

| Method | Đường dẫn                                    | Public | Ghi chú                                                                                                        |
| ------ | -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                    | ✔      |                                                                                                                |
| POST   | `/auth/register`                             | ✔      | 201 `AuthResponse` + đặt cookie refresh; 409 `EMAIL_TAKEN` / `USERNAME_TAKEN`                                  |
| POST   | `/auth/login`                                | ✔      | 200 `AuthResponse` + cookie; 401 `INVALID_CREDENTIALS` (không lộ email có tồn tại không)                       |
| POST   | `/auth/refresh`                              | ✔      | đọc cookie, xoay token, 200 `AuthResponse`; 401 `INVALID_REFRESH_TOKEN`                                        |
| POST   | `/auth/logout`                               | ✔      | 204, thu hồi phiên, xoá cookie, đóng các socket của phiên (4401)                                               |
| GET    | `/auth/me`                                   |        | `CurrentUser`                                                                                                  |
| POST   | `/auth/ws-ticket`                            |        | `{ ticket, expiresIn }` dùng một lần cho WebSocket                                                             |
| GET    | `/users/search?q=`                           |        | tìm theo tiền tố username (≥ 2 ký tự), tối đa 10, không gồm người gọi                                          |
| GET    | `/conversations`                             |        | hội thoại của người gọi, mới hoạt động nhất trước, kèm thành viên và tin cuối                                  |
| POST   | `/conversations`                             |        | `{ type: 'dm', userId }` (201, hoặc 200 nếu DM đã có) / `{ type: 'group', name, memberIds }` (1–49 người khác) |
| GET    | `/conversations/:id/messages?before=&limit=` |        | phân trang theo `seq`, mặc định 30, tối đa 100 (vượt thì 400); không phải thành viên → **404**                 |

`AuthResponse = { accessToken, expiresIn, user }`. Lỗi luôn có dạng:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [{ "path": "email", "message": "…" }] } }
```

`code` ∈ `VALIDATION_FAILED` (400), `INVALID_CREDENTIALS` / `UNAUTHENTICATED` / `TOKEN_EXPIRED` / `INVALID_REFRESH_TOKEN` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `EMAIL_TAKEN` / `USERNAME_TAKEN` (409), `INTERNAL_ERROR` (500).

## Xác thực

```
 đăng nhập ──▶ access token (JWT HS256, 15', claims sub + sid) ── trong bộ nhớ (NgRx), không localStorage
          └──▶ refresh token (ngẫu nhiên, 7 ngày)  ── cookie httpOnly, SameSite=Strict, Path=/api/auth
                                                      DB chỉ lưu SHA-256 của nó
```

- **Mật khẩu:** argon2id. Đăng nhập với email không tồn tại vẫn băm một hash giả để thời gian trả lời giống nhau.
- **Access token:** HS256, thuật toán được **ghim** khi verify (không chấp nhận `alg` khác). Hết hạn → 401 `TOKEN_EXPIRED`, sai → `UNAUTHENTICATED`.
- **Refresh xoay vòng:** mỗi lần refresh, token cũ bị thu hồi và thay bằng token mới cùng "họ" (`familyId` = claim `sid`), trong một transaction có điều kiện `revokedAt IS NULL`, nên hai request song song chỉ một bên thắng.
- **Phát hiện dùng lại:** token đã xoay mà bị dùng lại sau `REFRESH_REUSE_GRACE_SECONDS` → coi như bị đánh cắp: thu hồi **cả họ**, mọi socket của phiên bị đóng với 4401. Trong khoảng grace (hai tab đua nhau, response bị mất) chỉ trả 401.
- **Client** (`libs/shared/auth`):
  - khởi động: refresh ngầm bằng cookie trước khi route chạy (tải lại trang không bị đá ra trang đăng nhập);
  - interceptor gắn Bearer **chỉ** cho request tới `apiBaseUrl` (trừ các route dùng cookie); gặp `TOKEN_EXPIRED` thì refresh một lần cho mọi request đang chờ (single-flight) rồi thử lại;
  - giữa các tab: refresh chạy trong **Web Lock** `realtime-chat:auth-refresh`, tab sau chờ tab trước xoay cookie xong rồi dùng cookie mới;
  - guard `authGuard` / `guestGuard`; `returnUrl` chỉ chấp nhận đường dẫn nội bộ (`safeReturnUrl`).

## Giao thức WebSocket

Định nghĩa duy nhất ở `libs/shared/contracts/src/lib/ws/` (zod + type suy ra). Client và server validate bằng cùng schema.

**Kết nối:** `POST /api/auth/ws-ticket` (Bearer) → `ws://<host>:3000/ws?ticket=<ticket>`

- WebSocket API của trình duyệt không cho đặt header, và token trong URL sẽ nằm trong log. Vì vậy URL chỉ mang một **ticket**: ngẫu nhiên, lưu trong Redis với TTL 30 s, lấy ra bằng `GETDEL` nên **dùng được đúng một lần**. Mỗi lần kết nối / kết nối lại xin ticket mới.
- Upgrade bị từ chối: `Origin` không nằm trong `WS_ALLOWED_ORIGINS` → **403** (kiểm tra trước, trang lạ không đốt được ticket); thiếu / sai / đã dùng ticket → **401**; Redis lỗi → **503**.
- Danh tính (`userId`, `sid`) gắn vào **socket** lúc upgrade. Frame sau đó không mang token; server lấy người gửi từ socket, không bao giờ từ payload.

**Envelope:** mọi frame là JSON text `{ "event": string, "data": object }`.

| Hướng           | `event`                | `data`                                                                              |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| client → server | `chat.send`            | `{ conversationId, clientMessageId: uuid, text }`: text trim, 1–2000 ký tự          |
| server → client | `session.welcome`      | `{ userId }`: gửi **sau khi** socket đã vào mọi phòng của user                      |
| server → client | `chat.message`         | `MessageDTO = { id, conversationId, seq, clientMessageId, senderId, text, sentAt }` |
| server → client | `conversation.created` | `{ conversation: ConversationDTO }`: tới mọi socket của mọi thành viên              |
| server → client | `system.error`         | `{ code, message, clientMessageId? }`                                               |

`system.error.code` ∈ `INVALID_PAYLOAD`, `MESSAGE_TOO_LONG`, `UNKNOWN_EVENT`, `NOT_A_MEMBER`, `SEND_FAILED`.

Quy tắc:

- **`seq`** là 1, 2, 3… theo từng hội thoại, cấp trong transaction (`conversations.last_seq + 1`). Thứ tự hiển thị và con trỏ phân trang đều theo `seq`, không theo giờ.
- Các `chat.send` của **một socket** được xử lý **lần lượt** (hàng đợi promise theo socket); các socket khác nhau chạy song song. Nhờ vậy tin gõ liên tiếp giữ đúng thứ tự.
- **Gửi lại an toàn:** unique `(conversation, sender, clientMessageId)`. Gửi lại cùng `clientMessageId` trả về tin đã lưu, chỉ cho người gửi, không phát lại cho phòng.
- Gửi vào hội thoại không phải của mình: `NOT_A_MEMBER` (không phân biệt "không tồn tại" và "không phải thành viên").
- **Close code:** `4401` = phiên đã kết thúc (đăng xuất, bị thu hồi): client **không** kết nối lại và tự đăng xuất. `1008` thiếu danh tính, `1011` không tải được phòng, `1009` frame > 8 KB, `1001` server tắt.
- Frame sai **không đóng kết nối**: chỉ người gửi nhận `system.error`. Server không log nội dung tin nhắn.

## Luồng dữ liệu phía client

```
 AuthActions.sessionEstablished ─▶ ChatActions.connect ─▶ ChatSocketService.connect()
                                                            │ mỗi lần thử: POST /auth/ws-ticket → ws?ticket=…
 AuthActions.logout / sessionEnded ─▶ disconnect + stateReset (xoá mọi dữ liệu chat của user cũ)
 close 4401 / ticket 401 ─▶ connectionRejected ─▶ sessionEnded('revoked')

 session.welcome ─▶ tải lại danh sách + trang mới nhất của mọi lịch sử đang giữ (bắt kịp tin lỡ khi offline)
 chat.message    ─▶ messages: chèn theo seq, bỏ trùng │ conversations: lastMessage, sắp lại danh sách
 conversation.created ─▶ thêm vào danh sách
```

- **Không ai kết nối khi chưa đăng nhập.** Socket theo phiên, không theo trang: vào/ra `/chat` không mở thêm socket.
- **Lịch sử theo hội thoại:** một dải liên tục các tin mới nhất, tăng dần theo `seq`, cùng `nextBefore`. Mở hội thoại → trang mới nhất; cuộn gần đỉnh → trang `before=nextBefore`, mỗi lần một request. Kết nối lại mà lỡ nhiều hơn một trang → bỏ dải cũ, phân trang lại từ trang mới (không để lỗ hổng ở giữa).
- **Giữ vị trí khi chèn tin cũ:** `MessageList` nhớ tin đầu tiên đang thấy và khoảng cách của nó tới mép trên, rồi khôi phục sau khi render (`overflow-anchor: none` để trình duyệt không bù lần nữa).
- **Không có optimistic UI:** tin chỉ hiện khi server phát lại `chat.message` (kể cả cho người gửi).

### Ai sở hữu cái gì

| Thành phần                                                           | Đăng ký ở đâu                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `provideStore()`, `provideStoreDevtools()`, `provideHttpClient()`    | shell (`app.config.ts`)                               |
| `provideAuth()` (state, effects, interceptor, refresh ngầm)          | shell                                                 |
| `provideChatConnection()` (socket, state chat, effects, REST client) | shell                                                 |
| Như trên, khi remote chạy **độc lập**                                | `app.config.ts` của remote, không nằm trong `exposes` |

Khi chạy trong shell, route của remote dùng injector của shell, nên `inject(Store)` trong remote nhận đúng Store của shell. Điều này chỉ đúng vì `@ngrx/*`, `rxjs` và các lib `@realtime-chat/*` được share **singleton**.

## Ranh giới module

Tag khai báo trong `project.json`; `@nx/enforce-module-boundaries` (trong `eslint.config.mjs`) chặn import sai ngay khi lint.

| Project                          | Tag                                                                 |
| -------------------------------- | ------------------------------------------------------------------- |
| `shell`                          | `scope:shell`, `type:app`, `platform:angular`                       |
| `mfe-auth`, `mfe-chat`           | `scope:mfe`, `type:app`, `platform:angular`                         |
| `api-gateway`                    | `scope:api`, `type:app`, `platform:node`                            |
| `shell-e2e`                      | `scope:e2e`, `type:e2e`                                             |
| `contracts`                      | `scope:shared`, `type:lib`, `platform:any`, `access:public`         |
| `ui`, `auth`, `chat-data-access` | `scope:shared`, `type:lib`, `platform:angular`, `access:public`     |
| `socket`                         | `scope:shared`, `type:lib`, `platform:angular`, `access:shell-only` |
| `api-auth`                       | `scope:api`, `type:lib`, `platform:node`, `domain:auth`             |
| `api-chat`                       | `scope:api`, `type:lib`, `platform:node`, `domain:chat`             |
| `api-redis`                      | `scope:api`, `type:lib`, `platform:node`, `domain:infra`            |

Quy tắc:

- `shell` và `mfe-*` chỉ import lib `scope:shared`; các `mfe-*` không import lẫn nhau và không import `shell`.
- `mfe-*` chỉ import **trực tiếp** lib `access:public`. `socket` là `access:shell-only`: remote không thể inject `ChatSocketService` (một bản copy trong remote sẽ là DI token khác và mở socket thứ hai), chỉ dùng action / selector của `chat-data-access`. Ràng buộc này là allowlist **trực tiếp**: `notDependOnLibsWithTags` của Nx xét cả phụ thuộc bắc cầu, nên sẽ cấm luôn `chat-data-access` (vốn dùng `socket`).
- `platform:node` không import `@angular/*`, `@ngrx/*`; `platform:angular` không import `@nestjs/*`, `express`; `platform:any` (contracts) không import framework nào.
- Domain backend chỉ phụ thuộc `platform:any` + `domain:infra`: `api-chat` **không import `api-auth`**. Chat cần tên người dùng thì đi qua `USERS_PORT` (interface trong `api-chat`), gateway cài đặt port đó bằng `AuthUsersAdapter`. Khi tách service, adapter đổi thành lời gọi RabbitMQ.
- `shell-e2e` chỉ import `platform:any` (dùng chung kiểu của contracts).

## UI: Tailwind CSS v4 + zard/ui

- Tailwind v4 cấu hình bằng CSS (`src/styles.css` của mỗi app): `@import 'tailwindcss' source(none)` → theme của `libs/shared/ui` → `@source './'`.
- **Shell còn `@source` cả `apps/mfe-auth/src` và `apps/mfe-chat/src`.** Native Federation share code, không share CSS: chạy trong shell thì chỉ stylesheet của shell được tải, nên class chỉ remote dùng phải được sinh ở đây. Đánh đổi: remote deploy riêng mà thêm class mới thì cần build lại shell.
- Design tokens ở một chỗ: `libs/shared/ui/src/styles/theme.css`. Dark mode bằng class `dark` trên `<html>`.
- zard/ui copy source component vào repo. Trước khi dùng một component, đọc source của nó. Thêm component:

  ```bash
  npx zard-cli@1.4.0 add <component>   # ghi vào libs/shared/ui/src/lib/shared/components
  ```

  rồi export trong `libs/shared/ui/src/index.ts`. Đang có: alert, avatar, badge, button, card, dialog, field, input, input-group.

- Chữ hiển thị trên giao diện viết bằng **tiếng Anh**.

## Native Federation

- `shell` là **dynamic host**: danh sách remote đọc lúc chạy từ `apps/shell/public/federation.manifest.json` (`mfe-auth` :4201, `mfe-chat` :4202). Mỗi remote expose `./routes`.
- `/auth` (guest) và `/chat` (đã đăng nhập) nạp route của remote một cách lazy. Remote không phản hồi → trang lỗi thân thiện có nút "Try again".
- Import map được dựng **một lần** lúc shell khởi động: remote chưa sẵn sàng lúc đó (ví dụ `serve:all` vừa chạy) → `Failed to load remote …` cho tới khi tải lại trang.
- Mọi app dùng chung chính sách share ở `tools/federation/shared.mjs` (`singleton`, `strictVersion`): Angular, `@angular/cdk`, `@angular/forms`, `rxjs`, `@ngrx/*`. Các lib `@realtime-chat/*` được share tự động qua `sharedMappings`.
- Native Federation bỏ khỏi `remoteEntry.json` những package shared mà app chưa import.

## Kiểm thử

| Loại       | Công cụ                                                                 | Nơi                   |
| ---------- | ----------------------------------------------------------------------- | --------------------- |
| Unit       | Vitest (Angular: `@angular/build:unit-test`; lib: `@nx/vitest` + jsdom) | `*.spec.ts` cạnh code |
| End-to-end | Playwright (Chromium)                                                   | `apps/shell-e2e/src`  |

- Spec unit/integration viết trong giai đoạn 2 được dùng để kiểm chứng từng bước rồi **xoá theo yêu cầu**; các target test để `passWithNoTests`. Còn lại spec của giai đoạn 1 (component mfe-chat, socket, contracts). Hạ tầng test DB vẫn giữ: `tools/db/databases.mjs` (`ensureTestDatabase`), database `auth_test` / `chat_test`, Redis database 15.
- **E2E** (`npm run e2e`, 11 kịch bản):
  - xác thực: khách bị chuyển tới đăng nhập (kèm `returnUrl`) và không có socket; đăng ký → tải lại vẫn đăng nhập → đăng xuất; sai mật khẩu; đăng xuất ở tab này đóng socket tab kia (4401), không kết nối lại;
  - hội thoại: DM hiện ngay bên kia, nhắn qua lại; 15 tin gõ liên tiếp đến đủ và đúng thứ tự; nhóm 3 người, tin mới đẩy hội thoại lên đầu; lịch sử 45 tin (30 tin cuối, cuộn lên tải thêm, vị trí đứng yên); mất kết nối thì bắt kịp tin bị lỡ; một socket có `?ticket=` khi đi ra vào remote; link hội thoại của người khác → "not found".
- Nếu `serve:all` đang chạy, Playwright **dùng lại** các server đó (trừ khi `CI` được đặt), nếu không thì tự khởi động. `nx e2e` không tự chạy target `serve` (`dependsOn: []`), để không mở bộ server thứ hai trùng cổng.
- Mỗi test tự đăng ký user riêng (`e2e_…`, email `@example.test`), nên các test độc lập. **Các tài khoản và tin nhắn này ở lại trong database mà gateway đang dùng** (database dev khi chạy với `serve:all`).

## Quyết định kiến trúc

### 1. WebSocket thuần (`ws`) thay vì Socket.IO

- Gateway dùng `@nestjs/websockets` với `WsAdapter` (thư viện `ws`); trình duyệt dùng WebSocket API gốc. Mục tiêu là học giao thức ở mức thấp.
- Những gì Socket.IO vốn có, sau giai đoạn 2:

  | Việc                          | Trạng thái                                                                               |
  | ----------------------------- | ---------------------------------------------------------------------------------------- |
  | Định dạng message và routing  | ✅ envelope `{ event, data }`, schema chung, `messageParser` riêng                       |
  | Reconnect phía client         | ✅ backoff + jitter, ticket mới mỗi lần, **bắt kịp tin lỡ** khi `session.welcome`        |
  | Heartbeat                     | ✅ ping/pong phía server                                                                 |
  | Kiểm tra Origin khi handshake | ✅ `verifyClient`                                                                        |
  | Xác thực khi handshake        | ✅ ticket dùng một lần (Redis `GETDEL`)                                                  |
  | Room / channel                | ✅ một phòng mỗi hội thoại (`ConnectionRegistry`, chỉ mục theo user / phiên / hội thoại) |
  | Ack / request-response        | ⏳ `clientMessageId` + idempotency đã có; chưa có ack/timeout, chưa tự gửi lại           |
  | Scale nhiều instance gateway  | ⏳ phòng nằm trong bộ nhớ một process; cần fan-out qua Redis pub/sub / RabbitMQ          |

### 2. Một gateway, nhưng backend chia theo domain thành lib

- `libs/api/auth` và `libs/api/chat` là hai module Nest độc lập, mỗi cái một database và một Prisma client, chỉ gặp nhau qua "port" (`USERS_PORT`). Lint chặn import chéo domain.
- Lý do: tách service ở giai đoạn 3 sẽ là đổi adapter và vận chuyển, không phải gỡ phụ thuộc chằng chịt.

### 3. Prisma 7 với driver adapter `pg`

- Bản stable 7.x (tag `latest` lúc làm đang trỏ tới 8.0 RC nên không dùng). Generator `prisma-client` với `moduleFormat = "cjs"` cho bundle webpack.
- Prisma 7 không còn `url` trong `schema.prisma`: mỗi database một `prisma.config.ts`. `@prisma/adapter-pg` tạo một `pg.Pool` (mặc định 10 kết nối) cho mỗi PrismaService, không phải một kết nối mỗi request.
- Với adapter, `$connect()` là lazy: `onModuleInit` chạy `SELECT 1` để lỗi kết nối lộ ra lúc khởi động.

### 4. Access token trong bộ nhớ, refresh token trong cookie httpOnly

- Access token không nằm trong storage của trình duyệt nên script độc (XSS) không đọc được để mang đi dùng lâu dài; tải lại trang thì refresh ngầm.
- Cookie refresh `SameSite=Strict`, `Path=/api/auth`: chỉ đi tới các route auth, trình duyệt không gửi nó cho request từ site khác (chống CSRF cho `/auth/refresh`).

### 5. `seq` theo hội thoại, phân trang con trỏ

- `seq` cấp trong transaction cùng lúc với insert, unique `(conversation_id, seq)`. Thứ tự toàn cục rõ ràng (không phụ thuộc đồng hồ), con trỏ `before=<seq>` ổn định khi có tin mới chen vào (khác `OFFSET`).
- Index unique đó cũng phục vụ truy vấn `WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?` (B-tree quét ngược).

### 6. Một kết nối, theo phiên đăng nhập, do shell sở hữu

- Socket mở khi có phiên, đóng khi phiên kết thúc; remote chỉ nói chuyện với Store. Nhiều remote (chat, notifications…) cần cùng một luồng realtime; mỗi remote tự mở socket sẽ nhân số kết nối.
- Remote phụ thuộc vào việc shell đã đăng ký provider; khi chạy độc lập, remote tự đăng ký trong `app.config.ts`.

### 7. NgRx (Store + Effects + Entity) cho state, Signals ở component

- Effects là chỗ duy nhất chạm socket và REST; reducer thuần. Component đọc bằng `store.selectSignal()` + `computed()`. Mọi subscription RxJS có điểm kết thúc rõ ràng (`takeUntil`, `takeUntilDestroyed`, `toSignal`).

### 8. NestJS 12, Vitest, workspace "integrated"

- NestJS 12 (chỉ ESM) với `overrides` cho `@nx/nest`; test Nest chạy bằng Vitest + `unplugin-swc` vì Jest (CJS) không nạp được. Bundle webpack vẫn CJS, `require()` package ESM nhờ `require(esm)` của Node ≥ 22.
- `libs/shared/ui` buildable (yêu cầu của zard-cli); các lib Angular khác non-buildable. Workspace chuyển về kiểu integrated (path alias + `project.json`).

## Hạn chế đã biết / việc cho giai đoạn sau

- **Phiên hết hạn tự nhiên không đóng socket.** Đăng xuất và phát hiện dùng lại refresh token mới đóng socket (4401); socket mở lâu vẫn sống sau khi phiên hết hạn. Hướng sửa: tuổi tối đa cho socket, hoặc kiểm tra lại `sid` định kỳ.
- **`/auth/ws-ticket` không kiểm tra phiên đã bị thu hồi chưa.** Access token là JWT không trạng thái: trong tối đa 15 phút sau khi bị thu hồi, token cũ vẫn xin được ticket.
- **Chưa giới hạn tần suất** (đăng nhập, đăng ký, `chat.send`, tìm user).
- **Một instance gateway:** phòng và socket nằm trong bộ nhớ process.
- **Thứ tự chỉ đảm bảo trong một socket:** hai tab của cùng một người gửi đồng thời thì thứ tự giữa hai tab do server quyết định.
- **Không có optimistic UI, chưa có trạng thái "đang gửi" / gửi lại**, chưa có đã đọc / đang gõ / presence, chưa có rời / thêm thành viên nhóm.
- Thành viên DM bị xoá tài khoản (chưa có tính năng) sẽ hiện "Former member".

## Bài học rút ra

### Giai đoạn 2

- **CORS không áp dụng cho WebSocket, và trình duyệt không cho đặt header khi mở socket.** Xác thực bằng ticket ngắn hạn dùng một lần trong query string; kiểm tra `Origin` trước khi đụng tới ticket.
- **Các frame của một socket xử lý song song thì `seq` theo thứ tự transaction commit**, không theo thứ tự gửi: gõ nhanh là đảo thứ tự. Xếp hàng theo socket.
- **Trình duyệt bỏ qua implicit submission (Enter trong ô nhập) khi nút submit đang `disabled`.** Với change detection zoneless, nút bật lại chậm hơn một nhịp → gõ nhanh là mất tin. Tự xử lý `keydown.enter`, và bỏ qua Enter khi bộ gõ đang ghép chữ (`isComposing`, quan trọng với Telex / VNI).
- **Banner nằm trong luồng nội dung phía trên danh sách làm lệch vị trí** khi chèn tin cũ; bù bằng chênh lệch `scrollHeight` không đủ. Neo vào chính tin đang đọc, và cho chỉ báo "đang tải" nổi lên trên.
- **Native Federation share code, không share CSS**: Tailwind của shell phải quét cả source của remote.
- **Build production khi dev server Native Federation đang chạy** ghi đè `dist` mà nó phục vụ → `ngDevMode is not defined`.
- **Plugin Playwright của Nx tự thêm `dependsOn: serve`** từ `webServer`, nên `nx e2e` mở bộ server thứ hai trùng cổng. Đặt `dependsOn: []` và để Playwright `reuseExistingServer`.
- **Global filter của Nest không áp dụng cho WebSocket gateway, nhưng global guard thì có**: guard HTTP phải bỏ qua context khác `http`.
- **Prisma 7 + driver adapter: `$connect()` lazy**, lỗi kết nối chỉ lộ ở query đầu tiên.
- **`ioredis.quit()` resolve trước khi socket đóng**: chờ sự kiện `end` khi shutdown, nếu không process thoát với kết nối còn mở.
- **`startsWith` của Prisma không escape `_` / `%`** trong `LIKE`: username có `_` khớp sai. Tự escape.
- **Angular không có API công khai để lib thêm interceptor dạng hàm**: `provideAuth` đăng ký qua `HTTP_INTERCEPTORS`, app cần `withInterceptorsFromDi()`.
- **`notDependOnLibsWithTags` của Nx xét bắc cầu**: muốn chặn import trực tiếp một lib mà vẫn cho dùng lib bọc nó, dùng allowlist `onlyDependOnLibsWithTags`.

### Giai đoạn 1

- **`WsAdapter` mặc định của Nest im lặng bỏ frame sai**: viết `messageParser` riêng để validate bằng schema chung và trả `system.error`.
- **`toObservable(signal)` gộp thay đổi trong cùng tick**: trạng thái socket phát qua `BehaviorSubject` (cho effect) song song với signal (cho component).
- **`exhaustMap` thay cho `switchMap` khi `connect` phải idempotent.**
- **`retry({ delay, resetOnSuccess: true })` + `defer()`** đủ cho reconnect có backoff; `defer` đảm bảo mỗi lần thử là một `WebSocket` mới (và, từ giai đoạn 2, một ticket mới).
- **Lib buildable không thể phụ thuộc lib non-buildable.**
- **`[textContent]` thay cho `{{ }}`** với `whitespace-pre-wrap`: định dạng template không chen khoảng trắng vào tin nhắn.
- **`getReadyUrl()` của Nx** không hợp với Playwright có nhiều `webServer`: dùng URL cố định.
- **`page.routeWebSocket()`** cắt kết nối giữa chừng để test reconnect mà không tắt server.
