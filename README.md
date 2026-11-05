# Realtime Chat

Dự án cá nhân để học: hệ thống chat realtime gồm **Angular micro-frontend (Native Federation)**, **NestJS microservices**, **WebSocket thuần (`ws`)** và **RabbitMQ**, gom trong một **Nx workspace**.

> Trạng thái: **Giai đoạn 1, chat realtime trong một phòng chung.** Mọi người mở `/chat` đều thấy tin nhắn của nhau ngay lập tức qua một WebSocket duy nhất do shell sở hữu. Chưa có xác thực, lịch sử tin nhắn hay microservice: gateway giữ kết nối trong bộ nhớ, tải lại trang là mất tin cũ.

## Kiến trúc đích

```
 Trình duyệt
 ┌──────────────────────────────────────────────┐
 │ shell (host, :4200)                          │
 │  ├─ mfe-auth          (:4201, giai đoạn 2)   │   Native Federation:
 │  ├─ mfe-chat          (:4202)                │   nạp remote lúc chạy qua
 │  └─ mfe-notifications (:4203, giai đoạn 4)   │   federation.manifest.json
 └──────────────┬───────────────────────────────┘
                │ HTTP (REST)  +  WebSocket thuần (WebSocket API của trình duyệt)
                ▼
 ┌──────────────────────────────────────────────┐
 │ api-gateway (NestJS, :3000)                  │
 │  REST /api/*  +  WsAdapter (@nestjs/platform-ws, thư viện `ws`)
 └──────────────┬───────────────────────────────┘
                │ AMQP
                ▼
 ┌──────────────────────────────────────────────┐
 │ RabbitMQ (:5672, UI quản trị :15672)         │
 └───────┬──────────────────────────┬───────────┘
         ▼                          ▼
   auth-service               chat-service          … (các giai đoạn sau)
         │                          │
         ▼                          ▼
   PostgreSQL auth_db         PostgreSQL chat_db      Redis (presence, pub/sub, cache)
```

Giai đoạn 1 mới dùng phần trên cùng: trình duyệt ↔ api-gateway qua WebSocket. Gateway tự broadcast trong bộ nhớ, chưa đi qua RabbitMQ.

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
npm run infra:up          # RabbitMQ, PostgreSQL, Redis (đợi tới khi healthy)
npm run serve:all         # shell + mfe-chat + api-gateway chạy song song
```

Sau đó mở:

- http://localhost:4200: shell (trang chủ gọi `GET /api/health`, header có badge trạng thái kết nối)
- http://localhost:4200/chat: phòng chat (mfe-chat nạp qua federation). Mở thêm một cửa sổ ẩn danh hoặc trình duyệt khác để chat với chính mình.
- http://localhost:4202: mfe-chat chạy độc lập (tự mở kết nối riêng)
- http://localhost:3000/api/health → `{"status":"ok"}`
- http://localhost:15672: RabbitMQ management (tài khoản lấy từ `.env`)

Giai đoạn 1 chưa cần hạ tầng Docker để chat; chỉ cần `serve:all`.

npm 11 chặn install script của dependency nếu chưa được duyệt. Danh sách đã duyệt nằm trong `allowScripts` của `package.json`. Khi `npm install` cảnh báo về gói mới, chạy `npm approve-scripts --allow-scripts-pending` để xem lại.

### Các lệnh

| Lệnh                              | Tác dụng                                            |
| --------------------------------- | --------------------------------------------------- |
| `npm run infra:up` / `infra:down` | Bật / tắt docker compose (dữ liệu giữ trong volume) |
| `npm run infra:logs`              | Theo dõi log hạ tầng                                |
| `npm run serve:all`               | Chạy shell, mfe-chat, api-gateway                   |
| `npm run lint` / `build` / `test` | Chạy trên toàn workspace (`nx run-many`)            |
| `npm run e2e`                     | Playwright (Chromium), xem [Kiểm thử](#kiểm-thử)    |
| `npm run format` / `format:check` | Prettier                                            |
| `npx nx serve <project>`          | Chạy riêng một project                              |
| `npx nx graph`                    | Xem đồ thị phụ thuộc                                |

## Cổng

| Cổng  | Thành phần             | Ghi chú                             |
| ----- | ---------------------- | ----------------------------------- |
| 4200  | `shell`                | host (dynamic-host)                 |
| 4201  | `mfe-auth`             | dành cho giai đoạn 2                |
| 4202  | `mfe-chat`             | remote                              |
| 4203  | `mfe-notifications`    | dành cho giai đoạn 4                |
| 3000  | `api-gateway`          | HTTP prefix `/api`, WebSocket `/ws` |
| 5672  | RabbitMQ AMQP          |                                     |
| 15672 | RabbitMQ management UI |                                     |
| 5432  | PostgreSQL 16          | `auth_db`, `chat_db`                |
| 6379  | Redis 7                |                                     |

## Biến môi trường

**api-gateway** đọc `.env` (mẫu: `.env.example`) và validate bằng zod lúc khởi động (`apps/api-gateway/src/config/env.schema.ts`). Thiếu hoặc sai định dạng thì process dừng ngay với thông báo dễ đọc.

| Biến                 | Mặc định                                      | Ý nghĩa                                                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`           | `development`                                 | `development` \| `production` \| `test`                                  |
| `API_GATEWAY_PORT`   | `3000`                                        | Cổng HTTP, WebSocket dùng chung cổng này                                 |
| `CORS_ORIGINS`       | `http://localhost:4200`                       | Origin được phép gọi REST (CORS **không** áp dụng cho WebSocket)         |
| `WS_PATH`            | `/ws`                                         | Đường dẫn WebSocket, mặc định lấy từ `shared/contracts`                  |
| `WS_ALLOWED_ORIGINS` | `http://localhost:4200,http://localhost:4202` | Origin được phép mở WebSocket, kiểm tra lúc upgrade; sai thì trả **403** |
| `WS_HEARTBEAT_MS`    | `30000`                                       | Chu kỳ ping; client lỡ một pong thì bị `terminate()`                     |

Các biến `RABBITMQ_*`, `POSTGRES_*`, `REDIS_*` trong `.env.example` dành cho docker compose và các giai đoạn sau.

**Frontend** không đọc được `.env`: code chạy trong trình duyệt, giá trị được đóng gói vào bundle **lúc build**.

| File                                                     | Khóa                  | Giá trị                                               |
| -------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| `apps/shell/src/environments/environment.ts` (prod)      | `apiBaseUrl`, `wsUrl` | `http://localhost:3000/api`, `ws://localhost:3000/ws` |
| `apps/shell/src/environments/environment.development.ts` | `apiBaseUrl`, `wsUrl` | giống prod                                            |
| `apps/mfe-chat/src/environments/environment.ts`          | `wsUrl`               | `ws://localhost:3000/ws`, chỉ dùng khi chạy độc lập   |

> **dev và prod hiện cùng `wsUrl`**, vì chưa có môi trường deploy thật. Khi deploy, có hai hướng:
>
> 1. **Lúc build:** tuỳ chọn `define` của `@angular/build:application`, CI đặt giá trị theo môi trường. Đơn giản, nhưng mỗi môi trường một bản build.
> 2. **Lúc chạy (nên dùng):** shell tải `config.json` trước khi bootstrap, giống cách nó đã tải `federation.manifest.json`. Một bản build dùng cho mọi môi trường; server/container ghi file đó từ biến môi trường. URL nên là `wss://` khi trang chạy `https://`.

## Cấu trúc thư mục

```
realtime-chat/
├── apps/
│   ├── shell/                  # Angular host: root Store, kết nối WebSocket duy nhất, badge trạng thái
│   │   └── src/app/chat/       #   provideChatConnection(), ConnectionBadge
│   ├── mfe-chat/               # Angular remote; expose ./routes → src/app/chat.routes.ts
│   │   └── src/app/chat/       #   ChatPage, MessageList, MessageBubble, MessageComposer, ChatErrorNotice
│   ├── api-gateway/            # NestJS: GET /api/health, WebSocket /ws (src/chat)
│   └── shell-e2e/              # Playwright: hai browser context chat với nhau
├── libs/shared/
│   ├── contracts/              # TypeScript thuần: DTO, đường dẫn API, giao thức WebSocket (zod)
│   ├── socket/                 # Angular: ChatSocketService (WebSocket gốc + RxJS reconnect)
│   ├── chat-data-access/       # Angular: NgRx actions, features, selectors, effects, provideChatData()
│   └── ui/                     # Angular lib: design tokens + component zard/ui
│       └── src/
│           ├── styles/theme.css        # nguồn duy nhất của design tokens (sáng/tối)
│           ├── lib/shared/components/  # source component do zard-cli copy vào
│           └── index.ts                # public API: app chỉ import từ @realtime-chat/ui
├── tools/federation/shared.mjs # chính sách share dependency dùng chung cho mọi app federation
├── infra/postgres/init/        # script tạo database lúc khởi tạo
├── docker-compose.yml
├── components.json             # cấu hình zard-cli (đích: libs/shared/ui)
└── .env.example
```

Path alias (trong `tsconfig.base.json`): `@realtime-chat/contracts`, `@realtime-chat/ui`, `@realtime-chat/socket`, `@realtime-chat/chat-data-access`.

## Giao thức WebSocket

Định nghĩa duy nhất ở `libs/shared/contracts/src/lib/ws/` (schema zod + type suy ra). Client và server đều validate bằng cùng schema.

**Kết nối:** `ws://<host>:3000/ws?clientId=<uuid>`

- `clientId`: UUID do client tạo một lần và lưu trong `localStorage` (`realtime-chat.clientId`). Đây là danh tính ẩn danh, **không phải xác thực** (giai đoạn 2).
- Upgrade bị từ chối nếu `Origin` không nằm trong `WS_ALLOWED_ORIGINS` (**403**) hoặc thiếu / sai `clientId` (**400**).

**Envelope:** mọi frame là JSON text `{ "event": string, "data": object }`.

| Hướng           | `event`           | `data`                                                                                                   |
| --------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| client → server | `chat.send`       | `{ clientMessageId: uuid, text: string }`: text được trim, 1–2000 ký tự                                  |
| server → client | `session.welcome` | `{ clientId, nickname }`: gửi ngay sau khi kết nối, nickname `guest-xxxx` (4 ký tự hex đầu của clientId) |
| server → client | `chat.message`    | `{ id, clientMessageId, senderId, senderNickname, text, sentAt }`                                        |
| server → client | `system.error`    | `{ code, message }`: `code` ∈ `INVALID_PAYLOAD`, `MESSAGE_TOO_LONG`, `UNKNOWN_EVENT`                     |

Quy tắc:

- **Server là nguồn sự thật** cho `id` (UUID) và `sentAt` (ISO 8601). Client sắp xếp theo `sentAt` rồi `id`, và bỏ tin trùng `id`.
- `clientMessageId` do client tạo, được server trả lại nguyên vẹn (để sau này đối chiếu tin "đang gửi").
- Frame sai (JSON hỏng, event lạ, payload sai schema) **không đóng kết nối**: chỉ người gửi nhận `system.error`.
- Frame lớn hơn 8 KB: `ws` đóng kết nối với **1009**.
- Heartbeat: server ping mỗi `WS_HEARTBEAT_MS`, client (trình duyệt tự trả pong) lỡ một pong thì bị ngắt.
- Server tắt: đóng mọi kết nối với **1001** (going away); client tự kết nối lại.
- Server không bao giờ log nội dung tin nhắn.

## Luồng tin nhắn

```
 shell (root injector)                                         api-gateway
 ┌───────────────────────────────────────────────┐
 │ provideAppInitializer → dispatch Chat.Connect │
 │            │                                  │
 │            ▼ connect$ effect (exhaustMap)     │   ws://…/ws?clientId=…
 │  ChatSocketService.connect() ─────────────────┼──────────────────────▶ verifyClient (Origin, clientId)
 │    state$  → Connection Status Changed        │◀── session.welcome ── handleConnection
 │    events$ → Welcome / Message / Server Error │
 │            │                                  │
 │            ▼                                  │
 │  Store: connection + chat (entity adapter)    │
 └────────────┬──────────────────────▲───────────┘
              │ selectSignal         │ dispatch Send Message
              ▼                      │
 mfe-chat ChatPage ──────────────────┘
              send$ effect: validate (zod) → socket.send('chat.send') ─────▶ handleChatSend
                                                                              gán id + sentAt
 mọi client trong phòng ◀──────────────────── chat.message (broadcast) ──────┘
```

1. Shell khởi động, `provideChatConnection()` dispatch `connect` **một lần**. Kết nối tồn tại suốt vòng đời app, kể cả khi người dùng chưa vào `/chat`.
2. Effect `connect$` gọi `ChatSocketService.connect()` (idempotent) và đổi `state$` / `events$` của socket thành action.
3. `ChatPage` của mfe-chat chỉ **đọc selector** (`selectSignal`) và **dispatch action**. Nó không biết socket tồn tại.
4. Gửi: `sendMessage({ text })` → effect `send$` validate bằng schema của contracts, tạo `clientMessageId`, gửi `chat.send`. Text sai hoặc socket chưa mở → action lỗi cục bộ (`NOT_CONNECTED`, `MESSAGE_TOO_LONG`…), không gửi gì.
5. Tin chỉ hiện khi server **broadcast lại** `chat.message` (kể cả cho người gửi). Không có "optimistic UI" ở giai đoạn này.
6. Mất kết nối: `retry` của RxJS kết nối lại với exponential backoff + jitter (0,5 s → tối đa 10 s), trạng thái `reconnecting`. Badge và nút Send phản ánh trạng thái qua store.

### Ai sở hữu cái gì

| Thành phần                                                        | Đăng ký ở đâu                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `provideStore()`, `provideStoreDevtools()`                        | shell (`app.config.ts`)                                          |
| `provideChatSocket()`, `provideChatData()`, initializer `connect` | shell, qua `provideChatConnection()`                             |
| Như trên, khi mfe-chat chạy **độc lập** (:4202)                   | `apps/mfe-chat/src/app/app.config.ts`, không nằm trong `exposes` |

Khi chạy trong shell, route của remote dùng injector của shell, nên `inject(Store)` trong mfe-chat nhận đúng Store của shell. Điều này chỉ đúng vì `@ngrx/*`, `rxjs` và các lib `@realtime-chat/*` được share **singleton** (xem [Native Federation](#native-federation)).

## Ranh giới module

Mỗi project có ba nhóm tag (khai báo trong `project.json`), và `@nx/enforce-module-boundaries` (trong `eslint.config.mjs`) chặn import sai ngay khi lint:

| Project            | Tag                                            |
| ------------------ | ---------------------------------------------- |
| `shell`            | `scope:shell`, `type:app`, `platform:angular`  |
| `mfe-chat`         | `scope:mfe`, `type:app`, `platform:angular`    |
| `api-gateway`      | `scope:api`, `type:app`, `platform:node`       |
| `shell-e2e`        | `scope:e2e`, `type:e2e`                        |
| `contracts`        | `scope:shared`, `type:lib`, `platform:any`     |
| `ui`               | `scope:shared`, `type:lib`, `platform:angular` |
| `socket`           | `scope:shared`, `type:lib`, `platform:angular` |
| `chat-data-access` | `scope:shared`, `type:lib`, `platform:angular` |

Quy tắc:

- `shell` và `mfe-*` chỉ import lib `scope:shared`. Các `mfe-*` **không import lẫn nhau** và không import `shell`.
- `api` chỉ import lib `platform:any`, tức `shared/contracts`, và không được import `@angular/*`.
- `shared/contracts` không phụ thuộc project nào khác, cũng không import framework (`@angular/*`, `@nestjs/*`, `rxjs`, `ws`…).
- Lib không bao giờ import app.
- **Quy ước (lint chưa chặn):** remote không inject `ChatSocketService` và không gọi `provideChatData()`; chỉ dùng `ChatActions` + selector của `@realtime-chat/chat-data-access`. Ngoại lệ duy nhất là `app.config.ts` của chế độ chạy độc lập. Lint chưa chặn được vì `socket` là `scope:shared`, nên đây là điểm cần soi khi review.

Muốn giao tiếp giữa các MFE thì đi qua contract chung, store dùng chung, hoặc qua sự kiện/URL, không import trực tiếp.

## UI: Tailwind CSS v4 + zard/ui

- Tailwind v4 cấu hình bằng CSS, không có `tailwind.config.js`. Mỗi app có `.postcssrc.json` và `src/styles.css`:
  `@import 'tailwindcss' source(none)` → `@import` theme của `libs/shared/ui` → `@source './'`.
- Design tokens (màu, bán kính, font) nằm ở **một chỗ**: `libs/shared/ui/src/styles/theme.css`. Dark mode bật bằng class `dark` trên `<html>`.
- zard/ui copy source component vào repo, không phải package runtime. Thêm component:

  ```bash
  npx zard-cli@latest add dialog          # ghi vào libs/shared/ui/src/lib/shared/components
  ```

  sau đó export nó trong `libs/shared/ui/src/index.ts`. Chạy lại `zard-cli init` sẽ **ghi đè** `theme.css`, nên phải áp dụng lại các chỉnh sửa ghi ở đầu file đó.

- Chữ hiển thị trên giao diện viết bằng **tiếng Anh**.

## Native Federation

- `shell` là **dynamic host**: danh sách remote đọc lúc chạy từ `apps/shell/public/federation.manifest.json`. `mfe-chat` là remote, expose `./routes`.
- Route `/chat` của shell nạp `CHAT_ROUTES` một cách lazy. Nếu remote không phản hồi, shell hiện trang lỗi thân thiện (có nút "Try again") thay vì trắng trang.
- Mọi app dùng chung một chính sách share ở `tools/federation/shared.mjs`, tất cả với `singleton: true`, `strictVersion: true`, `requiredVersion: 'auto'`:
  - các gói Angular cốt lõi, `@angular/cdk`, `@ng-icons/core`;
  - `rxjs`, `@ngrx/store`, `@ngrx/effects`, `@ngrx/entity`, `@ngrx/store-devtools`. Hai bản `@ngrx/store` nghĩa là hai DI token `Store`, và remote sẽ không tìm thấy Store của shell.
  - Các lib `@realtime-chat/*` được share tự động (mặc định `sharedMappings` lấy từ path alias), nên cả app chỉ có một `ChatSocketService` và một bộ action/selector.
- Native Federation **bỏ khỏi `remoteEntry.json`** những package shared mà app chưa import. Muốn kiểm tra việc share, xem `dist/apps/<app>/browser/remoteEntry.json` sau khi build bản có dùng package đó.

## Kiểm thử

| Loại             | Công cụ                                                                                             | Nơi                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit / component | Vitest (Angular: `@angular/build:unit-test`; lib non-buildable: `@nx/vitest` + jsdom + TestBed JIT) | `*.spec.ts` cạnh code                             |
| Tích hợp gateway | Vitest + `unplugin-swc`, app Nest thật trên cổng 0, client `ws` thật                                | `apps/api-gateway/src/chat/*.integration.spec.ts` |
| End-to-end       | Playwright (Chromium)                                                                               | `apps/shell-e2e/src`                              |

E2E (`npm run e2e`):

- Nếu `serve:all` đang chạy, Playwright **dùng lại** các server đó (`reuseExistingServer`, trừ khi `CI` được đặt); nếu không, nó tự khởi động gateway, mfe-chat và shell.
- Các kịch bản:
  - hai browser context (hai `clientId`) nhắn tin qua lại, kiểm tra nhãn "You" / nickname và thứ tự;
  - đi qua lại home ↔ `/chat` mà vẫn chỉ có **một** WebSocket;
  - kết nối bị cắt (qua `page.routeWebSocket`, không cần tắt server) → `reconnecting` → tự nối lại và gửi được.
- Tin nhắn test đi vào phòng chung thật: nếu bạn đang mở `/chat`, bạn sẽ thấy chúng.

## Quyết định kiến trúc

### 1. WebSocket thuần (`ws`) thay vì Socket.IO

- **Quyết định:** gateway dùng `@nestjs/websockets` với `WsAdapter` của `@nestjs/platform-ws` (thư viện `ws`). Trình duyệt dùng WebSocket API gốc. Workspace không có dependency Socket.IO nào.
- **Lý do:** mục tiêu của dự án là học giao thức ở mức thấp: frame, vòng đời kết nối, close code, backpressure, thay vì dựa vào lớp trừu tượng của Socket.IO.
- **Hệ quả:** phải tự cài những gì Socket.IO vốn có sẵn. Trạng thái sau giai đoạn 1:

  | Việc                          | Trạng thái                                                                                   |
  | ----------------------------- | -------------------------------------------------------------------------------------------- |
  | Định dạng message và routing  | ✅ envelope `{ event, data }`, schema trong `shared/contracts`, `messageParser` riêng        |
  | Reconnect phía client         | ✅ RxJS `retry` + exponential backoff + jitter. Chưa đồng bộ lại tin đã lỡ (chưa có lịch sử) |
  | Heartbeat                     | ✅ ping/pong phía server (`isAlive`)                                                         |
  | Kiểm tra Origin khi handshake | ✅ `verifyClient`                                                                            |
  | Room / channel                | ⏳ mới có một phòng `lobby`, registry đã có `roomId`                                         |
  | Ack / request-response        | ⏳ `clientMessageId` đã có, chưa có ack/timeout                                              |
  | Xác thực khi handshake        | ⏳ giai đoạn 2. WebSocket API của trình duyệt không cho đặt header tuỳ ý                     |
  | Scale nhiều instance gateway  | ⏳ cần fan-out qua RabbitMQ / Redis pub/sub và presence registry                             |

### 2. NestJS 12 dù `@nx/nest` 24 mới khai báo hỗ trợ tới Nest 11

- NestJS 12 là bản stable mới nhất. `package.json` dùng `overrides` để `@nx/nest` chấp nhận Nest 12. Build và serve đã được kiểm tra chạy được.
- Nest 12 chỉ phát hành dạng ESM, nên Jest (CJS) không nạp được. Test của `api-gateway` vì thế chạy bằng **Vitest + `unplugin-swc`** (SWC phát sinh decorator metadata mà DI của Nest cần).
- Bundle webpack vẫn ở dạng CommonJS và `require()` các package ESM nhờ `require(esm)` của Node ≥ 22. Nên bỏ `overrides` khi `@nx/nest` chính thức hỗ trợ Nest 12.

### 3. `libs/shared/ui` là lib buildable, các lib Angular mới thì không

zard-cli chỉ ghi import tương đối giữa các component khi lib có `ng-package.json` (lib buildable). Nếu không, nó thêm alias toàn cục `@/*` vào `tsconfig.base.json`, và alias này cho phép app import sâu, vượt qua public API. Ứng dụng vẫn biên dịch lib từ source qua path alias.

`socket` và `chat-data-access` thì **không buildable**: một lib buildable không được phụ thuộc lib non-buildable (`contracts`). Vì `@nx/angular:unit-test` cần target build, hai lib này test bằng `@nx/vitest` + jsdom + `src/test-setup.ts` (khởi tạo TestBed ở chế độ JIT).

### 4. Workspace "integrated"

`create-nx-workspace` 24 luôn tạo kiểu "TS solution" (npm workspaces + project references). Cấu hình đã được chuyển về kiểu integrated (path alias trong `tsconfig.base.json`, `project.json`), vì đây là kiểu Nx hỗ trợ cho Angular.

### 5. Một kết nối, do shell sở hữu; remote chỉ nói chuyện với Store

- **Quyết định:** shell mở WebSocket lúc khởi động và giữ nó suốt vòng đời app. Remote chỉ dispatch action và đọc selector.
- **Lý do:** nhiều remote (chat, notifications…) cần cùng một luồng realtime; mỗi remote tự mở socket sẽ nhân số kết nối, nhân danh tính và khó đồng bộ trạng thái. Store là "hợp đồng" ổn định giữa host và remote.
- **Hệ quả:** remote phụ thuộc vào việc shell đã đăng ký `provideChatData()`; khi chạy độc lập, remote phải tự đăng ký (chỉ trong `app.config.ts`). `rxjs`, `@ngrx/*` và lib workspace bắt buộc phải share singleton.

### 6. NgRx (Store + Effects + Entity) cho trạng thái chat, Signals ở component

- Effects là chỗ duy nhất chạm vào socket; reducer thuần, dễ test. `createEntityAdapter` lo sắp xếp và chống trùng.
- Component đọc state bằng `store.selectSignal()`, dùng `computed()`, không `subscribe` thủ công. Mọi subscription RxJS đều có điểm kết thúc rõ ràng (`takeUntil(disconnect)`, `unsubscribe()` trong `disconnect()`).

## Bài học rút ra (giai đoạn 1)

- **CORS không áp dụng cho WebSocket.** Trang web bất kỳ có thể mở socket tới server, trình duyệt vẫn gửi kèm cookie. Phải tự kiểm tra `Origin` lúc upgrade (`verifyClient`). Đây không phải xác thực: client ngoài trình duyệt giả được header.
- **`WsAdapter` mặc định của Nest im lặng bỏ frame sai** (JSON hỏng, event lạ). Viết `messageParser` riêng để mọi frame được validate bằng schema chung và lỗi được trả về bằng `system.error`.
- **`toObservable(signal)` gộp các thay đổi trong cùng một tick**, nên `connecting → open` có thể chỉ còn `open`. Trạng thái socket vì thế phát qua `BehaviorSubject` (cho effect) song song với signal (cho component).
- **`exhaustMap` thay cho `switchMap` khi `connect` phải idempotent.** `switchMap` huỷ rồi subscribe lại, `BehaviorSubject` phát lại trạng thái hiện tại, tạo action trùng.
- **`retry({ delay, resetOnSuccess: true })` + `defer()`** là đủ để reconnect có backoff; `defer` đảm bảo mỗi lần thử tạo một `WebSocket` mới.
- **Native Federation bỏ package shared chưa dùng** khỏi `remoteEntry.json`; đừng kết luận "chưa share" khi app chưa import package đó.
- **Lib buildable không thể phụ thuộc lib non-buildable**, nên chọn kiểu lib từ đầu theo phụ thuộc của nó.
- **Template Angular + `whitespace-pre-wrap`:** Prettier xuống dòng quanh `{{ text }}` làm tin nhắn có thêm khoảng trắng. Dùng `[textContent]` để định dạng code không ảnh hưởng nội dung (và cũng không render HTML).
- **`getReadyUrl()` của Nx** không hợp với Playwright có nhiều `webServer`: dưới `nx e2e` nó đổi cổng theo task serve báo "ready" (có thể là gateway), làm Playwright chờ shell ở sai cổng. Dùng URL cố định.
- **`page.routeWebSocket()`** của Playwright cho phép cắt kết nối giữa chừng để test reconnect mà không phải tắt server.
- **Angular Language Service đôi khi giữ chẩn đoán cũ** (ví dụ `'imports' must be an array… could not be determined statically`) sau khi thêm path alias, dù `ngc` biên dịch sạch. Chạy "Angular: Restart Angular Language server".
- **Hai tab cùng trình duyệt dùng chung `clientId`** (cùng `localStorage`), nên được coi là cùng một người. Muốn thử hai người: cửa sổ ẩn danh hoặc trình duyệt khác (E2E dùng hai browser context).
