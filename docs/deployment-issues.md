# 部署问题与解决记录

> 记录 FlowLens 部署到公网过程中遇到的问题与解决方案。
> 对应 CLAUDE.md 的「问题/BUG 记录规范」：写清楚问题描述和解决方案。
> 关联：`design-decisions.md` §11（静态导出与部署）。

## 背景

FlowLens 为纯前端项目（Next.js 16 App Router + `output: "export"` 静态导出，无后端/无 API Route/无 SSR），需部署到公网（CLAUDE.md 硬性要求）。

## 问题 1：Vercel 无法注册

- **问题描述**：Vercel 注册流程走不通（国内网络环境，Vercel 注册依赖 Google reCAPTCHA，不可用）。
- **解决方案**：改用 **Cloudflare Pages**（`cloudflare.com` 国内可访问，验证码为 Cloudflare 自家 Turnstile，可通过）。

## 问题 2：构建失败 ENOENT .next/standalone/pages-manifest.json

- **问题描述**：Cloudflare Pages 首次构建报错：
  ```
  Error: ENOENT: no such file or directory,
  open '/opt/buildhome/repo/.next/standalone/.next/server/pages-manifest.json'
  ```
  堆栈中出现 `@opennextjs/cloudflare`。
- **原因**：项目创建时 Framework preset 被默认选成「Next.js（完整适配器）」——该预设走 `@opennextjs/cloudflare`，期望 Next.js 以 `standalone`（服务端）模式构建；但本项目是 `output: "export"`（静态导出），`next build` 生成的是 `out/` 而非 `.next/standalone`，故找不到目标文件。
- **解决方案**：改用「Next.js (Static HTML Export)」预设（见文末「最终正确配置」）。

## 问题 3：wrangler 部署 Missing Pages project name

- **问题描述**：尝试把「部署命令」改成 `npx wrangler pages deploy out` 时，报错：
  ```
  [ERROR] Missing Pages project name. Use --project-name <name> or
  set the name in your Wrangler configuration file.
  ```
- **原因**：仓库无 wrangler 配置文件（`wrangler.toml`/`wrangler.jsonc`），且命令未带 `--project-name`。
- **解决方案（临时）**：命令加 `--project-name flowlens`。（该路线最终未采用，见问题 4。）

## 问题 4：Authentication error [code: 10000]

- **问题描述**：`npx wrangler pages deploy out --project-name flowlens` 报：
  ```
  [ERROR] A request to the Cloudflare API (.../pages/projects/flowlens) failed.
  Authentication error [code: 10000]
  ```
  提示「authenticating Wrangler via a custom API token」、token 权限不足。
- **原因**：Cloudflare 为「Next.js 完整适配器（Worker 类型）」项目注入的 `CLOUDFLARE_API_TOKEN` 只有 **Worker 权限**，没有 **Pages 权限**，因此无法调用 Pages API。
- **解决方案**：**删除错误类型的项目，重建为静态 Pages 项目**（根本解决，而非继续用 wrangler 硬绕）。

## 根本原因总结

问题 2 / 3 / 4 是**同一个根因的三种表现**：项目创建时 **Framework preset 选错**（默认「Next.js 完整适配器」而非「Next.js (Static HTML Export)」），导致：

- 构建走 OpenNext 适配器（期望 `standalone`，与静态导出 `out/` 冲突）
- 部署走 Worker 流程（`wrangler deploy` / `wrangler versions upload`）
- 注入的 token 无 Pages 权限

## 最终正确配置（Cloudflare Pages）

| 配置项 | 值 |
|--------|-----|
| Framework preset | Next.js (Static HTML Export) |
| Build command | `npm run build` |
| Build output directory | `out` |

- 前提：`next.config.ts` 已设 `output: "export"`（详见 `design-decisions.md` §11）。
- 部署结果：**https://flowlens-3jx.pages.dev/**（HTTP 200，正常渲染 FlowLens 页面）。

## 经验教训

1. 纯前端 Next.js 项目上 Cloudflare Pages 时，**务必选「Next.js (Static HTML Export)」预设**（或选 `None` 后手动填 Build command = `npm run build`、Build output directory = `out`），**不要**选默认的「Next.js」完整适配器。
2. **判断是否选错类型的标志**：构建配置里出现「部署命令」「版本命令」这类 wrangler / Worker 字段，说明建成了 Worker / 完整适配器类型，而非静态 Pages。
3. **报错关键词定位**：看到 `@opennextjs/cloudflare` 或 `.next/standalone` 找不到，即预设选错（用了完整适配器）。
4. 静态 Pages 项目**不需要**手动跑 `wrangler pages deploy`——Cloudflare 会在构建后自动上传「Build output directory」，无需项目名、无需额外 token 权限。
