# Realtime Chat

Dự án cá nhân để học: hệ thống chat realtime gồm **Angular micro-frontend (Native Federation)**, **NestJS microservices**, **WebSocket thuần (`ws`)** và **RabbitMQ**, gom trong một **Nx workspace**.

> Trạng thái: **Giai đoạn 0, mới dựng khung.** Chưa có tính năng chat, xác thực hay microservice; mới có shell, một remote, gateway với `/api/health`, UI nền (Tailwind CSS v4 + zard/ui) và hạ tầng Docker.

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

- http://localhost:4200: shell (trang chủ gọi `GET /api/health`)
- http://localhost:4200/chat: mfe-chat được nạp qua federation
- http://localhost:4202: mfe-chat chạy độc lập
- http://localhost:3000/api/health → `{"status":"ok"}`
- http://localhost:15672: RabbitMQ management (tài khoản lấy từ `.env`)

npm 11 chặn install script của dependency nếu chưa được duyệt. Danh sách đã duyệt nằm trong `allowScripts` của `package.json`. Khi `npm install` cảnh báo về gói mới, chạy `npm approve-scripts --allow-scripts-pending` để xem lại.

### Các lệnh

| Lệnh                              | Tác dụng                                            |
| --------------------------------- | --------------------------------------------------- |
| `npm run infra:up` / `infra:down` | Bật / tắt docker compose (dữ liệu giữ trong volume) |
| `npm run infra:logs`              | Theo dõi log hạ tầng                                |
| `npm run serve:all`               | Chạy shell, mfe-chat, api-gateway                   |
| `npm run lint` / `build` / `test` | Chạy trên toàn workspace (`nx run-many`)            |
| `npm run format` / `format:check` | Prettier                                            |
| `npx nx serve <project>`          | Chạy riêng một project                              |
| `npx nx graph`                    | Xem đồ thị phụ thuộc                                |

## Cổng

| Cổng  | Thành phần             | Ghi chú              |
| ----- | ---------------------- | -------------------- |
| 4200  | `shell`                | host (dynamic-host)  |
| 4201  | `mfe-auth`             | dành cho giai đoạn 2 |
| 4202  | `mfe-chat`             | remote               |
| 4203  | `mfe-notifications`    | dành cho giai đoạn 4 |
| 3000  | `api-gateway`          | prefix `/api`        |
| 5672  | RabbitMQ AMQP          |                      |
| 15672 | RabbitMQ management UI |                      |
| 5432  | PostgreSQL 16          | `auth_db`, `chat_db` |
| 6379  | Redis 7                |                      |

## Cấu trúc thư mục

```
realtime-chat/
├── apps/
│   ├── shell/                  # Angular host; public/federation.manifest.json liệt kê các remote
│   ├── mfe-chat/               # Angular remote; expose ./routes → src/app/chat.routes.ts
│   └── api-gateway/            # NestJS; config validate bằng zod, GET /api/health
├── libs/shared/
│   ├── contracts/              # TypeScript thuần: DTO, đường dẫn API, (sau này) tên event
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

Path alias (trong `tsconfig.base.json`): `@realtime-chat/contracts`, `@realtime-chat/ui`.

## Ranh giới module

Mỗi project có ba nhóm tag (khai báo trong `project.json`), và `@nx/enforce-module-boundaries` (trong `eslint.config.mjs`) chặn import sai ngay khi lint:

| Project       | Tag                                            |
| ------------- | ---------------------------------------------- |
| `shell`       | `scope:shell`, `type:app`, `platform:angular`  |
| `mfe-chat`    | `scope:mfe`, `type:app`, `platform:angular`    |
| `api-gateway` | `scope:api`, `type:app`, `platform:node`       |
| `contracts`   | `scope:shared`, `type:lib`, `platform:any`     |
| `ui`          | `scope:shared`, `type:lib`, `platform:angular` |

Quy tắc:

- `shell` và `mfe-*` chỉ import lib `scope:shared`. Các `mfe-*` **không import lẫn nhau** và không import `shell`.
- `api` chỉ import lib `platform:any`, tức `shared/contracts`, và không được import `@angular/*`.
- `shared/contracts` không phụ thuộc project nào khác, cũng không import framework (`@angular/*`, `@nestjs/*`, `rxjs`, `ws`…).
- Lib không bao giờ import app.

Muốn giao tiếp giữa các MFE thì đi qua contract chung, hoặc qua sự kiện/URL, không import trực tiếp.

## UI: Tailwind CSS v4 + zard/ui

- Tailwind v4 cấu hình bằng CSS, không có `tailwind.config.js`. Mỗi app có `.postcssrc.json` và `src/styles.css`:
  `@import 'tailwindcss' source(none)` → `@import` theme của `libs/shared/ui` → `@source './'`.
- Design tokens (màu, bán kính, font) nằm ở **một chỗ**: `libs/shared/ui/src/styles/theme.css`. Dark mode bật bằng class `dark` trên `<html>`.
- zard/ui copy source component vào repo, không phải package runtime. Thêm component:

  ```bash
  npx zard-cli@latest add dialog          # ghi vào libs/shared/ui/src/lib/shared/components
  ```

  sau đó export nó trong `libs/shared/ui/src/index.ts`. Chạy lại `zard-cli init` sẽ **ghi đè** `theme.css`, nên phải áp dụng lại các chỉnh sửa ghi ở đầu file đó.

## Native Federation

- `shell` là **dynamic host**: danh sách remote đọc lúc chạy từ `apps/shell/public/federation.manifest.json`. `mfe-chat` là remote, expose `./routes`.
- Route `/chat` của shell nạp `CHAT_ROUTES` một cách lazy. Nếu remote không phản hồi, shell hiện trang lỗi thân thiện (có nút "Thử lại") thay vì trắng trang.
- Mọi app dùng chung một chính sách share ở `tools/federation/shared.mjs`: các gói Angular cốt lõi, `@angular/cdk` và `@ng-icons/core` được share với `singleton: true`, `strictVersion: true`, `requiredVersion: 'auto'`. Các lib `@realtime-chat/*` được share tự động.
- **Giai đoạn 1** sẽ thêm `rxjs` và `@ngrx/*` vào danh sách này (đã có chỗ chờ sẵn trong file).

## Quyết định kiến trúc

### 1. WebSocket thuần (`ws`) thay vì Socket.IO

- **Quyết định:** gateway dùng `@nestjs/websockets` với `WsAdapter` của `@nestjs/platform-ws` (thư viện `ws`). Trình duyệt dùng WebSocket API gốc. Workspace không có dependency Socket.IO nào. Các package WebSocket sẽ được cài từ giai đoạn 1.
- **Lý do:** mục tiêu của dự án là học giao thức ở mức thấp: frame, vòng đời kết nối, close code, backpressure, thay vì dựa vào lớp trừu tượng của Socket.IO.
- **Hệ quả:** phải tự cài những gì Socket.IO vốn có sẵn:
  - **Định dạng message và routing**: envelope `{ event, data, id? }`, tên event đặt trong `shared/contracts`.
  - **Room / channel**: tự quản lý ánh xạ room → tập kết nối.
  - **Reconnect** phía client: exponential backoff + jitter, đồng bộ lại trạng thái sau khi nối lại.
  - **Ack / request-response**: gắn `id` vào message, timeout, retry.
  - **Heartbeat**: ping/pong để phát hiện kết nối chết (proxy, mạng di động).
  - **Scale nhiều instance gateway**: không có adapter Redis dựng sẵn. Phải fan-out qua RabbitMQ hoặc Redis pub/sub, và cần sticky session hoặc presence registry.
  - **Xác thực khi handshake**: token trong query hoặc message đầu tiên, vì WebSocket API của trình duyệt không cho đặt header tuỳ ý.

### 2. NestJS 12 dù `@nx/nest` 24 mới khai báo hỗ trợ tới Nest 11

- NestJS 12 là bản stable mới nhất. `package.json` dùng `overrides` để `@nx/nest` chấp nhận Nest 12. Build và serve đã được kiểm tra chạy được.
- Nest 12 chỉ phát hành dạng ESM, nên Jest (CJS) không nạp được. Test của `api-gateway` vì thế chạy bằng **Vitest + `unplugin-swc`** (SWC phát sinh decorator metadata mà DI của Nest cần).
- Bundle webpack vẫn ở dạng CommonJS và `require()` các package ESM nhờ `require(esm)` của Node ≥ 22. Nên bỏ `overrides` khi `@nx/nest` chính thức hỗ trợ Nest 12.

### 3. `libs/shared/ui` là lib buildable

zard-cli chỉ ghi import tương đối giữa các component khi lib có `ng-package.json` (lib buildable). Nếu không, nó thêm alias toàn cục `@/*` vào `tsconfig.base.json`, và alias này cho phép app import sâu, vượt qua public API. Ứng dụng vẫn biên dịch lib từ source qua path alias.

### 4. Workspace "integrated"

`create-nx-workspace` 24 luôn tạo kiểu "TS solution" (npm workspaces + project references). Cấu hình đã được chuyển về kiểu integrated (path alias trong `tsconfig.base.json`, `project.json`), vì đây là kiểu Nx hỗ trợ cho Angular.
