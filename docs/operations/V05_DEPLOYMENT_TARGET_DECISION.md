# V0.5 Deployment Target Decision Package

状态：AWAITING USER APPROVAL

本文件基于 `docs/operations/v0.5-deployment-readiness.json` 和 G4 交付材料形成部署目标决策包。本任务只提供决策材料，不执行部署，不创建 Git remote，不创建平台项目，不绑定域名，不写入凭据。

## 1. 结论摘要

- 项目要求 Node Runtime：是。
- Static export 支持：否。
- 推荐优先评估：托管 Node 平台。
- 当前部署目标决策状态：awaiting_user_approval。
- 本文件不代表用户已经批准任何部署方案。

G4 矩阵确认当前版本使用 `next start` 作为生产启动方式，输出目录为 `.next`，并且 `next.config.ts` 未配置 `output: "export"`。因此 V0.5 当前不能按纯静态站点发布。

## 2. 运行时要求

| 项目 | 结论 |
| --- | --- |
| Node Runtime | 需要 |
| 构建命令 | `npm run build` |
| 启动命令 | `npm run start -- -p <port>` |
| 输出目录 | `.next` |
| 健康检查页面 | `/login` |
| Static export | 不支持 |
| 服务端数据库 | 不需要 |
| 后端 API | 不需要 |
| 服务端文件上传存储 | 不需要 |
| WebSocket | 不需要 |
| 私密服务端环境变量 | 不需要 |

浏览器侧必须支持 IndexedDB、localStorage、File API、Web Crypto 和 TextEncoder。

## 3. 数据边界

V0.5 是 local-first 浏览器应用，生产数据主要保存在当前浏览器 origin 下的 IndexedDB 和 localStorage。

必须注意：

1. `localhost`、平台默认域名、正式域名、子域名、HTTP/HTTPS 和不同端口都属于不同 origin。
2. 在一个 origin 导入的数据不会自动出现在另一个 origin。
3. 先用平台默认域名导入的数据，在切换到正式域名后不会自动迁移。
4. 切换正式域名后，首次使用通常需要重新导入四源数据，或另行设计明确的导出/导入迁移方案。
5. 回滚或重新部署不得清空 IndexedDB 或 legacy localStorage key。
6. 当前版本不支持多用户共享、跨浏览器同步、跨电脑同步或账号级云端数据同步。

## 4. 方案对比

### 4.1 托管 Node 平台

示例类型：支持 Next.js Node runtime 的托管平台。

- 适配性：高。符合 `next build` + `next start` 或平台等价 Node runtime 的要求。
- 运维复杂度：中低。平台通常处理 HTTPS、构建、进程托管和静态资源服务。
- 数据边界：数据仍在用户浏览器 origin 中，不在平台服务器数据库中。
- 风险：
  - 通常需要平台账号。
  - 通常需要 Git remote 或平台可访问的代码来源。
  - 平台默认域名切换到正式域名会改变 origin，本地浏览器数据不会自动迁移。
  - 必须确认平台不会在部署或回滚流程中要求清理浏览器存储。
- 适用判断：最适合作为 V0.5 首选评估方向。

### 4.2 静态托管

示例类型：只托管静态 HTML/CSS/JS 文件的对象存储或静态站点平台。

- 适配性：低。当前 V0.5 不支持 static export。
- 运维复杂度：低，但与当前构建合同不匹配。
- 数据边界：若未来支持静态发布，数据仍是 origin-scoped 浏览器本地数据。
- 风险：
  - 当前无法直接使用 `.next` 产物作为纯静态站点发布。
  - 若强行改造会涉及 Next.js 输出模式和回归验证，超出本任务边界。
- 适用判断：当前不推荐，除非后续单独实施并冻结 static export 能力。

### 4.3 自托管 Node

示例类型：自有服务器、内网服务器、云主机上的 Node 进程。

- 适配性：高。可直接运行 `npm run build` 与 `npm run start -- -p <port>`。
- 运维复杂度：高。需要自行负责 Node 版本、进程守护、HTTPS、域名、日志、备份、回滚和安全更新。
- 数据边界：服务器不保存业务数据；浏览器数据仍绑定访问 origin。
- 风险：
  - 必须配置稳定 HTTPS origin。
  - 运维不当可能导致访问地址变化，从而让浏览器本地数据看起来“消失”。
  - 需要明确回滚流程，不能通过清理浏览器数据解决问题。
- 适用判断：适合有明确服务器运维能力的场景。

### 4.4 其他符合合同的方案

示例类型：内网单人 Node 服务、受控桌面服务器、临时演示环境。

- 适配性：取决于是否满足 Node runtime、HTTPS、固定 origin 和浏览器 API 要求。
- 运维复杂度：中到高。
- 数据边界：仍是单浏览器、单 origin 本地数据；不支持共享多用户。
- 风险：
  - 若使用临时 URL 或频繁变化的端口，会破坏固定 origin 假设。
  - 若使用 HTTP 生产访问，不满足 G4 的 HTTPS 要求。
  - 不应被解释为正式多用户生产方案。
- 适用判断：可用于受控验收或单人试运行，不建议作为长期正式方案。

## 5. Git Remote、平台账号和域名

| 问题 | 决策材料结论 |
| --- | --- |
| 是否需要 Git remote | 应用本身不强制；多数托管 Node 平台为了自动构建会需要 Git remote 或等价代码来源。 |
| 是否需要部署平台账号 | 托管 Node 平台需要；自托管 Node 不一定需要平台账号，但需要服务器权限。 |
| 是否需要正式域名 | 正式对外使用建议需要；技术上可先使用平台默认 HTTPS 域名验收。 |
| 是否可先使用平台默认域名 | 可以，前提是该默认域名为稳定 HTTPS origin。 |
| 是否要求 HTTPS | 生产使用要求 HTTPS。 |
| 是否要求固定 origin | 要求。IndexedDB/localStorage 与 origin 强绑定。 |

## 6. 正式域名切换提醒

如果先使用平台默认域名，例如 `https://example-platform.app`，后续再切换到正式域名，例如 `https://data.example.com`，浏览器会把它们视为两个不同 origin。

因此：

1. 默认域名下导入的 V0.5 数据不会自动出现在正式域名下。
2. 正式域名首次使用需要重新导入四源数据。
3. 除非后续新增明确的本地导出/导入或迁移工具，否则不得承诺自动迁移。
4. 这不是部署失败，而是浏览器本地数据边界。

## 7. 推荐方案

推荐优先评估托管 Node 平台。

理由：

1. 当前项目明确需要 Node Runtime。
2. 当前不支持 static export。
3. 托管 Node 平台通常能提供 HTTPS、固定域名、构建和运行进程管理。
4. V0.5 不需要服务器数据库、后端 API 或服务端文件存储，适合轻量 Node 托管。

该推荐不是最终选择。最终部署平台、Git remote、账号、域名和上线时间必须由用户确认后才能执行。

## 8. 当前不执行

本任务不执行以下事项：

1. 不部署。
2. 不创建 Git remote。
3. 不创建部署平台项目。
4. 不绑定域名。
5. 不写入凭据。
6. 不新增 provider 配置文件。
7. 不修改业务代码。
8. 不新增依赖。

## 9. 下一步等待用户确认

待用户选择：

1. 托管 Node 平台。
2. 自托管 Node。
3. 其他符合合同的 Node 运行方案。
4. 是否先使用平台默认域名。
5. 是否准备正式域名。
6. 是否允许创建 Git remote 或连接现有 remote。

在用户明确批准前，机器状态保持 `awaiting_user_approval`。
