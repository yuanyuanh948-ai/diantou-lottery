# 保姆级教程：Cloudflare 账号 + 域名接入 + API Token

> ✅ **2026-09-08 更新：本教程流程已全部走完**（账号注册、域名接入、API 令牌创建均已完成）。
> 现在的访问地址、密码和日常操作见《部署清单.md》。本文保留作过程记录，日后新增域名/令牌时可再参考。

全程约 20 分钟操作 + 等待生效（几分钟到几小时）。Cloudflare 界面是英文的，对照下面给的英文按钮名找即可。

---

## 第一件事：注册 Cloudflare 账号（5 分钟）

1. 浏览器打开 **https://dash.cloudflare.com/sign-up**
2. 输入邮箱 → 设置密码（这个密码记好，是 Cloudflare 的登录密码）→ 点 **Create Account**
3. 登录邮箱收验证邮件，点里面的链接完成验证（没收到看垃圾箱）

## 第二件事：把域名接入 Cloudflare（10 分钟操作 + 等待生效）

### 2.1 在 Cloudflare 添加域名

1. 登录后首页点 **Add a domain**（添加域）
2. 输入你的域名，如 `example.com`（**不带 www、不带 http**），点 Continue
3. 选套餐：页面往下拉到底，选 **Free $0**，点 Continue
4. Cloudflare 会自动扫描这个域名现有的解析记录，列出来给你确认：
   - 如果域名是闲置的，列表可能是空的，直接 Continue
   - 如果有在用的记录，确认没漏（漏了后面可补）
5. 到了 **Change your nameservers** 页面，会给你**两个地址**，形如：
   ```
   xxx.ns.cloudflare.com
   yyy.ns.cloudflare.com
   ```
   **把这两个复制下来**（后面要用），这个页面先别关。

### 2.2 去阿里云改 DNS 服务器

1. 打开 **https://dc.console.aliyun.com** （阿里云域名控制台），用你的阿里云账号登录
2. 域名列表里找到你的域名，点右侧 **管理**
3. 左侧菜单点 **DNS 修改**（有的版本叫 "DNS 修改 / 修改DNS服务器"）
4. 点 **修改 DNS 服务器** → 选 **使用自定义 DNS**（或"填入自定义DNS服务器"）
5. 把 Cloudflare 给的**两个地址分别填进两个输入框**（一个框填一个）
6. 点确认保存——可能要求**手机短信验证码**，按提示操作

### 2.3 回 Cloudflare 等生效

1. 回到刚才没关的 Cloudflare 页面，点 **Check nameservers**（或 Done, check nameservers）
2. 域名状态变成 **Active**（绿色）就成功了
3. 生效时间：快的几分钟，慢的几小时，**这不影响你现在电脑上正在跑的本地测试**，等就行
4. Cloudflare 会发一封 "your site is active" 的邮件通知你

> ⚠️ 唯一注意：改 DNS 服务器后，域名解析从阿里云切到 Cloudflare。Cloudflare 第 4 步扫描到的记录会自动带过去，闲置域名无感；如果这域名上还挂着网站/邮箱，切换后去 Cloudflare 左侧 **DNS** 菜单核对一遍记录是否齐全。

---

## 第三件事：创建 API Token（5 分钟）

> Token 相当于一把授权钥匙，我用它替你执行部署。它能做的事仅限你勾选的范围，部署完成后随时可以删掉它。

1. 回到 Cloudflare 首页，**右上角点头像** → **My Profile**（我的个人资料）
2. 左侧点 **API Tokens** → 点 **Create Token**
3. 在模板列表里找 **Edit Cloudflare Workers**，点它右边的 **Use template**
4. 进到编辑页面，在权限列表里点 **+ Add more**，**追加以下三条**（模板自带的不用动）：
   | 类型 | 项目 | 权限 |
   |---|---|---|
   | Account | D1 | Edit |
   | Zone | DNS | Edit |
   | Zone | Workers Routes | Edit |
   - 每一行是三个下拉框：先选 **Account**（或 Zone），再选项目（如 D1），最后选 **Edit**
5. 下面 Zone Resources 如果显示 "All zones" 可以不用改；也可以改成 **Include → Specific zone → 你的域名**（更安全）
6. 拉到底点 **Continue to summary** → 再点 **Create Token**
7. 页面会显示一长串 Token——**点 Copy 复制**，这个只显示这一次！
8. 把 Token 发给我（部署完成后你随时可以回这个页面把它 Delete 吊销）

---

## 第四件事：你只需要做三个决定 + 一张图

| 事项 | 怎么定 | 例子 |
|---|---|---|
| **子域名** | 就是给抽奖页起个访问地址的前缀，定个名字告诉我就行 | `draw.example.com`、`hd.example.com`（hd=活动）、`choujiang.example.com` |
| **管理后台密码** | 自己定一个：10 位以上、字母+数字混合，发给我，我设置进服务器 | 如 `Dt2026@live`（别用这个，自己编） |
| **logo 图片** | **透明底 PNG，白色或浅金色图案**——页面是深红色底，深色 logo 会看不见；尺寸建议高 ≥120px | 存到桌面，告诉我文件名即可，我来嵌入页面 |

---

## 完成后把这 4 样发给我

1. API Token（那串长字符）
2. 子域名前缀（如 `draw`）
3. 管理后台密码
4. logo 文件（放桌面告诉我文件名，或直接说"先不要 logo"）

我拿到后：创建数据库 → 建表 → 设密码 → 绑定子域名 → 部署 → 自检 → 把正式网址发你验收。

## 常见问题

- **Q：改 NS 期间域名会失效吗？** 闲置域名无感；有在用服务的域名，切换瞬间可能闪断几秒。
- **Q：Active 一直不变绿怎么办？** 超过 6 小时还没 Active，把 Cloudflare 报的错误信息截图发我。
- **Q：Token 会不会很危险？** 它只授权了上面勾的三项权限，且可以随时吊销；正规做法，CF 官方就这么设计的。
- **Q：不想弄了怎么办？** 每一步都是可逆的：NS 可以改回阿里云默认，Token 可以删，账号可以注销。
