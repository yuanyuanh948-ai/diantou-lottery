# 开箱抽奖 · Lottery Box

一个跑在 [Cloudflare Workers](https://workers.cloudflare.com) 上的开箱抽奖小工具：学员填昵称和手机号，一键开出一张带兑奖码的奖券；管理后台可核销、导出、对账。

> 为「点头 AI 就业班」开营活动而做，线上跑在自定义域名 dtgift.hyyuan.me。

## 功能

**学员端**（单文件 H5，墨绿×香槟金礼盒风格）
- 一键抽奖：老虎机滚动动画 → 弹出兑奖券（含兑奖码）
- 同一手机号全局只能抽一次，重复请求原样返回首次结果
- localStorage 记住上次的昵称和手机号
- 入场动效 / 光晕旋转 / 金色纸屑 Canvas，尊重 `prefers-reduced-motion`

**管理端**（`/admin/`，密码登录，12 小时会话）
- 抽奖名单、中奖统计、一键核销 / 取消核销
- 删除单条记录、导出 CSV（Excel 直接打开不乱码）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 HTML/CSS/JS，单文件，无框架无依赖 |
| 后端 | Cloudflare Workers（JS 模块格式，一个 `fetch` 函数 + 路由分发） |
| 数据库 | Cloudflare D1（SQLite），唯一索引防重复 |
| 部署 | wrangler CLI，一条命令全球生效 |

## 目录结构

```
worker/
├── public/            # 静态资源：学员页 index.html、管理页 admin/
├── src/
│   ├── index.js       # 后端全部逻辑（约 220 行）
│   └── config.js      # 奖品与权重配置，改奖品只改这里
├── schema.sql         # 数据库建表语句（含唯一索引）
├── wrangler.toml      # 部署配置：名字、域名、D1 绑定
├── deploy.sh.example  # 部署脚本模板（真实 deploy.sh 含密钥，不入库）
├── e2e-online.py      # 线上验收脚本：17 项检查，跑完自动清理测试数据
└── e2e-server.mjs     # 本地联调用的备用静态服务器（可选）
```

## 快速开始

前置要求：Node.js ≥ 18、一个 Cloudflare 账号（免费额度足够）。

```bash
npm install

# 1. 创建 D1 数据库，把输出的 database_id 填进 wrangler.toml
npx wrangler d1 create lottery

# 2. 建表
npx wrangler d1 execute lottery --remote --file=schema.sql

# 3. 设置两个机密（存放在 Cloudflare，不进代码）
npx wrangler secret put ADMIN_PASSWORD     # 管理后台密码
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET   # 登录签名密钥

# 4. 部署（或按 deploy.sh.example 自建一键脚本）
npx wrangler deploy
```

绑定自定义域名：编辑 `wrangler.toml` 顶层 `routes`，`custom_domain = true` 会自动创建 DNS 记录（域名需已接入同一 Cloudflare 账号）。

## 测试

```bash
python e2e-online.py
# 或把密码放进环境变量：ADMIN_PASSWORD=你的密码 python e2e-online.py
```

脚本对线上环境做 17 项断言：健康检查、页面在线、配置不泄露概率、正常抽奖、一号一抽、换昵称不可重抽、脏输入拦截、后台登录、伪造 Cookie 必 401、名单/CSV/核销/删除……全部通过后自动删除测试记录，不留脏数据。

## 安全设计（这个项目最有意思的部分）

- **概率永不下发前端**：`/api/config` 只返回奖品名单，权重只存在于服务端，开奖在后端完成；
- **一号一抽靠数据库而非代码自觉**：`phone` 列唯一索引 + 插入冲突捕获，并发"同一毫秒同一手机号"也只会成功一个；
- **登录态不可伪造**：HMAC-SHA256 签名的 `过期时间.签名` 令牌，签名密钥只在服务端；伪造令牌必然 401；
- **防刷**：同 IP 10 分钟内限 20 次抽奖；
- **参数化查询**：所有 SQL 用 `?` 占位 + `bind` 填值，杜绝 SQL 注入；
- **密钥分离**：API Token、后台密码、签名密钥全部走 Cloudflare Secrets / 本地 gitignore 文件，仓库里只有模板。

## 说明

- 本仓库仅供学习交流；活动物料（海报、二维码等）不在仓库范围内。
- 欢迎提 Issue 指正。
