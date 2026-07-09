# AI 家庭保障顾问平台

面向保险业务员的多租户 SaaS 基础架构。第一阶段已搭好 Next.js App Router、Supabase Auth、多租户数据库、RLS、Storage bucket 和基础页面路由。
第二阶段已接入客户档案创建、客户绑定上传 PDF、`report_files` 文件记录和自动生成 `h5_reports` 草稿。
第三阶段已接入 AI 保单解析：从已上传 PDF 抽取文本，调用 OpenAI 输出结构化 JSON，并写入保单、受益人和保障责任。
第四阶段已完成微信可打开的公开 H5 客户报告页，并在后台报告列表提供发布和复制分享链接能力。
第五阶段已加入商业化 SaaS 能力：套餐额度、用量日志、超额限制、顾问品牌设置和 H5 品牌信息展示。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- OpenAI API 预留
- Vercel 部署

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 http://localhost:3000。

## Supabase 配置

1. 在 Supabase 创建新项目。
2. 进入 SQL Editor，按文件名顺序执行 `supabase/migrations/` 下的 SQL。
3. 在 Project Settings > API 获取：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 写入 `.env.local`。
5. 在 Authentication > Providers 启用 Email 登录。
6. 在 Authentication > URL Configuration 中加入本地和线上回调地址：
   - `http://localhost:3000/dashboard`
   - `https://你的域名/dashboard`

迁移会创建：

- 表：`profiles`、`agencies`、`customers`、`report_files`、`policies`、`beneficiaries`、`policy_benefits`、`h5_reports`、`subscriptions`、`usage_logs`
- 私有 bucket：`policy-pdfs`
- 公开素材 bucket：`report-assets`
- 所有业务表的 `user_id` 字段和 RLS 策略
- 注册后自动创建 `profiles` 和 `subscriptions` 的触发器
- 客户字段：姓名、手机号、微信号、性别、出生日期、城市、备注

## 多租户约定

所有业务数据都带 `user_id`，RLS 使用 `auth.uid() = user_id` 限制访问。前端上传文件时建议把对象路径设计为：

```text
{user_id}/{customer_id}/{file_id}.pdf
```

这样 Supabase Storage 策略可以用路径第一段隔离不同业务员的文件。

公开 H5 报告路由为：

```text
/reports/[slug]
```

`h5_reports` 支持已发布报告的匿名读取，用于客户在微信里打开链接。其他客户、保单、文件、订阅和用量数据仍只允许所属业务员读取。

## Vercel 部署

1. 将项目推送到 Git 仓库。
2. 在 Vercel 导入项目。
3. 配置环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`，仅服务端使用，用于公开 H5 附件生成临时访问链接
   - `OPENAI_API_KEY`，使用 OpenAI 官方 API 时填写
   - `DEEPSEEK_API_KEY`，使用 DeepSeek 时填写，填写后会优先使用 DeepSeek
   - `DEEPSEEK_MODEL`，可选，默认 `deepseek-v4-flash`
   - `OPENROUTER_API_KEY`，使用 OpenRouter 时填写，填写后会优先使用 OpenRouter
   - `OPENROUTER_MODEL`，可选，默认 `openai/gpt-4o-mini`
   - `OPENAI_MODEL`，可选，默认 `gpt-4o-mini`
   - `NEXT_PUBLIC_APP_URL`
4. Build Command 使用 `npm run build`。
5. 部署完成后，把线上域名加入 Supabase Authentication URL Configuration。

## 第一阶段页面

- `/login` 登录页
- `/register` 注册页
- `/dashboard` 工作台
- `/customers` 客户管理
- `/reports` 报告管理
- `/upload` 上传保单
- `/reports/[slug]` 客户公开 H5 报告页

## 第二阶段流程

1. 业务员登录后进入 `/customers` 新建客户。
2. 进入 `/upload` 选择客户并上传 PDF。
3. PDF 存入 `policy-pdfs` bucket，路径格式为 `{user_id}/{customer_id}/{file_id}-文件名.pdf`。
4. 上传成功后写入 `report_files`，同时创建一条 `h5_reports` 草稿。
5. 进入 `/reports` 查看当前业务员自己的报告列表。

## 第三阶段流程

1. 进入 `/reports`，点击报告卡片上的“开始解析”。
2. 服务端接口 `/api/reports/[id]/parse` 会用当前登录态读取报告和上传文件。
3. 系统从 `policy-pdfs` 下载 PDF，抽取文本并调用 OpenAI。
4. 解析结果写入：
   - `policies`
   - `beneficiaries`
   - `policy_benefits`
5. 系统按“被保人 + 主险名称 + 生效日”去重。
6. 核验结果会保存到 `h5_reports.summary.verification`，报告列表会展示总保单数、年缴总保费、待缴总保费、是否重复、是否缺字段。

## 第四阶段公开 H5

- 客户访问路径：`/reports/[slug]`
- 后台复制分享链接格式：`/reports/[slug]`
- 公开页不需要登录，但只展示 `status = 'published'` 的报告。
- 公开页包含封面、客户姓名、顾问信息、家庭保障总览、被保人分组、保单卡片、保障类型标签、保费金额、受益人、保障内容详解、缴费账户和免责声明。
- 新增 RLS 策略仅允许匿名读取已发布报告关联的客户、顾问 profile、保单、受益人和保障责任数据。

## 第五阶段商业化功能

套餐额度：

- 体验版：每月 3 份报告
- 智惠版：每月 150 份报告
- 智优版：每月 600 份报告

用量记录：

- 上传 PDF：`usage_logs.action = upload_policy_pdf`
- 生成报告草稿：`usage_logs.action = generate_h5_report`
- AI 解析：`usage_logs.action = parse_policy_pdf`
- 发布 H5：`usage_logs.action = publish_h5_report`

额度控制：

- `/upload` 会读取当前业务员 `subscriptions` 和当月 `usage_logs`。
- 当月已生成报告数达到套餐上限后，会禁止继续上传并生成新报告草稿。

品牌设置：

- 后台页面：`/brand`
- 可维护顾问姓名、手机号、公司名称、头像、微信号、服务编号、品牌名称、品牌 Logo。
- 公开 H5 报告会展示这些品牌资料。

## 第六阶段注册码激活套餐

- 后台页面：`/usage`
- 新用户默认体验版。
- 输入注册码后调用数据库函数 `activate_subscription_code`，成功后升级为智惠版或智优版。
- 注册码只能使用一次，支持过期时间。
- 激活记录会写入 `usage_logs.action = activate_subscription_code`。

后台发码 SQL 示例：

```sql
insert into public.activation_codes (code, plan_code, monthly_report_limit, expires_at)
values ('ZH-2026-0001', 'zhihui', 150, now() + interval '1 year');

insert into public.activation_codes (code, plan_code, monthly_report_limit, expires_at)
values ('ZY-2026-0001', 'zhiyou', 600, now() + interval '1 year');
```

## OpenRouter 配置

项目兼容 OpenRouter、DeepSeek 和 OpenAI。优先级为：

```text
OPENROUTER_API_KEY > DEEPSEEK_API_KEY > OPENAI_API_KEY
```

使用 DeepSeek 时，在 `.env.local` 或 Vercel 环境变量里填写：

```env
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

使用 OpenRouter 时填写：

```env
OPENROUTER_API_KEY=你的 OpenRouter Key
OPENROUTER_MODEL=deepseek/deepseek-chat
```

## 后续阶段建议

- 接入真实文件上传和 `report_files` 写入。
- 使用 OpenAI API 将 PDF 解析为 `policies`、`beneficiaries`、`policy_benefits`。
- 生成并发布 `h5_reports`。
- 加入套餐计费、用量限制和团队协作权限。
