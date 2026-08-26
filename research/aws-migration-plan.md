# Migrating Paper off Vercel Hobby onto AWS

Status: **still plan only — no files modified, no AWS resources created.**
Re-verified 2026-08-26: no `cdk.json`, no `infra/`, no `aws-cdk` or `@aws-sdk`
dependency, and `vercel.json` is still the live deployment contract. The stack
remains Vercel + MongoDB Atlas.
Date: 2026-07-25 (plan) · status re-verified 2026-08-26
Target: steady-state $0/month inside AWS always-free allowances

> **Numbers that have drifted since 2026-07-25** — none of them change a decision,
> but do not quote them as current:
>
> - §0 says "14 plain Node handlers … grouped behind 4 thin dispatchers". It is now
>   **18 handlers behind 5 dispatchers** (`api/shell.ts` landed 2026-07-30, plus the
>   brews routes). The 12-function cap in §11 is therefore *closer*, not further away
>   — 5 of 12 used.
> - The `dist/` size in §1 and the traffic inputs in §2 were measured in July and have
>   not been re-measured.
>
> §11's conclusion is unchanged and is the reason nothing has been built: at this
> traffic the migration saves no money, and the only real motive is escaping the
> function cap.

---

## 0. Premise correction

The original brief assumed a Next.js app to be migrated with OpenNext (Lambda SSR, S3
assets, CloudFront, DynamoDB for the ISR/tag cache).

**Paper is not a Next.js app.** Verified: no `next` dependency in `package.json`, zero
hits for `"node_modules/next"` in `package-lock.json`, no `next.config.*`, no `app/` or
`pages/` directory, no `middleware.ts`. The sibling `../paper-pure` is the same Vue app.

Paper is:

- **Vue 3.5.25 + Vite 7.3.1** SPA, client-side routing via `vue-router` `createWebHistory`
- **14 plain Node `(req, res)` handlers** in `server/routes/`, grouped behind 4 thin
  dispatchers in `api/`
- **MongoDB Atlas** via Mongoose 9

Consequences for the migration:

| Original assumption | Reality |
|---|---|
| OpenNext / SST Next.js construct | Not applicable — nothing to adapt |
| Next.js Deployment Adapters API | Not applicable |
| Lambda for SSR | No SSR exists; frontend is already fully static |
| DynamoDB for ISR/tag cache | No such cache exists — see §7 |
| Heavy middleware per request | No middleware; rewrites are declarative |

The migration is therefore **substantially simpler** than the brief assumed: a static
bucket, one Lambda, one CloudFront distribution. No framework adapter is involved.

---

## 1. Recommended stack

| Layer | Choice | Reasoning |
|---|---|---|
| Static assets | **S3 (private) + CloudFront OAC** | `dist/` is 664 KB of hashed files. Bucket stays private; only CloudFront reads it. |
| API compute | **One Lambda, `nodejs24.x`, arm64, 512 MB** | See §1.1. Newest supported runtime (deprecates 2028-04-30); Node 20 is already deprecated. |
| API ingress | **Lambda Function URL + CloudFront OAC (`AWS_IAM`)** | **Not API Gateway** — HTTP API's 1M requests/month free tier is 12-month only, not always-free. Function URLs have no per-request charge beyond Lambda itself. |
| CDN / TLS / DNS / WAF | **CloudFront flat-rate Free plan ($0)** | See §3. Bundles WAF + Route 53 + ACM + 5 GB S3 credits at $0. |
| Database | **MongoDB Atlas — unchanged, not migrated** | See §7. Sits outside AWS billing entirely. |
| Secrets | **SSM Parameter Store, Standard tier** | Standard parameters are free; Secrets Manager is $0.40/secret/month. |
| IaC | **AWS CDK (TypeScript)** | See §1.2. |

### 1.1 Why one Lambda, not four or fourteen

The 4-dispatcher grouping in `api/` exists *only* to stay under Vercel Hobby's 12-function
cap (`server/routes/index.ts:20`). On AWS that constraint disappears — but the answer is
to go the other way and collapse to **one** function:

- **Fewer cold starts.** At ~12k invocations/month, a single function keeps one warm
  execution environment serving all routes. Four functions means four independent cold-start
  populations at a quarter of the traffic each.
- **One Mongo connection pool.** `server/lib/db.ts` caches on `globalThis`; a single
  function maximises reuse.
- **The code already supports it.** `resolveRouteName()` (`server/lib/dispatch.ts:11`)
  already falls back to the last path segment when no `?route=` query param is present.
  A single Lambda dispatching `allRoutes` on the path works with **zero changes** to the
  route table.
- **`server/dev.ts` is the template.** It already maps a raw Node request onto the
  `ApiRequest`/`ApiResponse` shape and dispatches `allRoutes`. The Lambda handler is the
  same ~60 lines against the Function URL event shape.

### 1.2 Why CDK over SST / Terraform / SAM

- The repo is TypeScript end to end. CDK infra lives in the same repo under the same
  `tsconfig`/eslint, reviewed like the rest of the code.
- This stack is roughly 150 lines of CDK: `Bucket`, `Distribution`, `NodejsFunction`,
  `FunctionUrl`, `BucketDeployment`.
- `NodejsFunction` bundles with esbuild, which handles the `.js`-suffixed ESM imports in
  `server/` without configuration.
- SST v3 is excellent but its headline value is its Next.js/OpenNext component, which is
  irrelevant here. It would add a Pulumi state backend for no benefit.
- Terraform would mean a second language and toolchain for ~150 lines of infra.

> **Open question — flag before committing.** CloudFront flat-rate pricing plans are new.
> I could not confirm whether a plan can be subscribed via CloudFormation/CDK or is
> console-only. Assume **console-only**: let CDK create the distribution, then subscribe
> to the Free plan in the CloudFront console. Note the plan requires an attached WAF web
> ACL, which may cause CDK drift on subsequent deploys. Verify before step 6.

---

## 2. Cost model

### Inputs

Page weight is **measured from the actual `dist/` build**, not estimated:

| Asset | Raw | Gzip | Brotli |
|---|---|---|---|
| `index.html` | 1,515 B | 623 B | 416 B |
| `assets/index-*.js` | 564,081 B | 190,353 B | 162,214 B |
| `assets/index-*.css` | 29,210 B | 6,461 B | 5,711 B |
| **Cold first load** | **581 KB** | **193 KB** | **164 KB** |

CloudFront serves brotli to modern browsers → **165 KB per cold first load**.
Repeat visit ≈ 8 KB (`index.html` + API JSON; hashed assets are browser-cached).

Cover images are operator-supplied **remote https URLs** and Google Fonts is external —
**neither is our egress**. There is no image pipeline (see §5).

Traffic assumption: **5,000 page views/month** (stated: under 10k). Ceiling checked at 10k.
Mix: 40% cold / 60% warm.

### Lambda

Assumed **512 MB, arm64**. Rationale: CPU scales linearly with memory, and importing
Mongoose + bcryptjs + five models is init-heavy; 128 MB makes cold starts materially worse
for the same or greater GB-second cost.

> **These durations are estimates, not measurements.** Cold 2,500 ms assumes Node init +
> Mongoose import + Atlas TLS handshake + topology discovery. Warm 80 ms assumes a reused
> connection and one indexed query. Measure before trusting — see §4 step 9.

Invocations per page view: 1 content GET + 1 `post-view` POST + ~0.3 `post-completion`
= **2.3**. Every one of these is forced by `Cache-Control: no-store` (see §6, row 1).

```
Invocations  = 5,000 × 2.3 + ~200 admin/auth      = 11,700 /month
Cold (8%)    = 936 × 2.5 s                        = 2,340 s
Warm (92%)   = 10,764 × 0.08 s                    =   861 s
Total        = 3,201 s × 0.5 GB                   = 1,600 GB-seconds
```

- Invocations: **11,700 / 1,000,000 = 1.2%**
- Compute: **1,600 / 400,000 = 0.4%**

### CloudFront

Requests per page view: 1 html + 0.8 assets (40% × 2) + 2.3 API = **4.1**

```
Requests = 5,000 × 4.1                            = 20,500 /month
Egress   = (2,000 × 165 KB) + (3,000 × 8 KB)      = 346 MB  (0.34 GB)
Worst case, 100% cold = 5,000 × 165 KB            = 806 MB  (0.79 GB)
```

### S3, DynamoDB, SQS

- **S3 storage:** `dist/` is 664 KB. With 20 retained versions ≈ 13 MB. **Note: the S3
  free tier is no longer always-free** — as of 2025-07-15 it was replaced by the $200
  credit model. So this is a real cost of roughly **$0.0003/month**, and the CloudFront
  Free plan's 5 GB S3 Standard credit covers it entirely regardless.
- **S3 requests:** only on CloudFront cache miss. A few thousand/month; cents.
- **DynamoDB:** not used. See §7.
- **SQS:** not used.

### Which allowance breaks first

| Allowance | Limit | Page views/month to exhaust |
|---|---|---|
| **CloudFront Free plan — requests** | 1 M | **~244,000** |
| **Lambda — invocations** | 1 M | **~427,000** |
| CloudFront Free plan — transfer | 100 GB | ~1,450,000 |
| Lambda — GB-seconds | 400,000 | ~1,250,000 |
| CloudFront PAYG — requests | 10 M | ~2,440,000 |
| CloudFront PAYG — transfer | 1 TB | ~14,800,000 |

**At 5,000 views/month you use ~2% of the tightest allowance — roughly 48× headroom.**
At 10,000 views/month, ~4%.

---

## 3. CloudFront Free plan vs pay-as-you-go always-free

### They are mutually exclusive

AWS documentation, *Account-level constraints*:

> AWS accounts are not eligible for pricing plans if they meet any of the following
> conditions: [...] Your account is using AWS Free Tier.

> ⚠️ **This is the single most important thing to verify before building anything.**
> The clause is ambiguous. It could mean (a) the account is on the **Free plan account
> type** — the 6-month auto-closing one you already ruled out — or (b) the account is
> **consuming always-free allowances** such as Lambda's 1M requests. Reading (b) would
> mean that using free-tier Lambda disqualifies you from the CloudFront Free plan, making
> the two genuinely un-combinable. Reading (a) is more likely given the plan is marketed
> at ordinary paid accounts, but **I could not confirm this from AWS documentation.**
> Ask AWS Support to confirm before committing. Everything below assumes reading (a).

### The comparison for these specific numbers

| | Free plan | PAYG always-free |
|---|---|---|
| Requests | 1 M | 10 M |
| Transfer | 100 GB | 1 TB |
| Your usage | 20,500 req / 0.34 GB | same |
| % of allowance | **2.1% / 0.3%** | 0.2% / 0.03% |
| Overage behaviour | **Never billed.** Sustained excess may degrade routing | Billed per GB / per 10k requests |
| WAF web ACL + 5 rules | **Included** | ~$10/month |
| Route 53 hosted zone | **Included** | $0.50/month (no free tier) |
| ACM TLS cert | Included | Free anyway |
| CloudFront Functions | **Included** | Billed |
| S3 Standard credits | **5 GB** | None |
| DDoS protection, IP rate limiting, geo blocking | **Included** | Extra |
| Distributions / apex domains | 1 / 1 | Unlimited |
| Cache behaviours | 5 | Unlimited |
| Custom cache policies | ❌ Business+ | ✅ |
| Custom response-header policies | ❌ Business+ | ✅ |
| Access logs | ❌ Pro+ | ✅ |

### Recommendation: **the CloudFront Free plan**

1. **It matches your hard constraint more precisely.** You asked for steady-state cost
   inside always-free. The Free plan's defining property is *no overage charges, ever*.
   PAYG bills you the moment you cross a line. The Free plan converts cost risk into
   performance risk, which is the correct trade for this requirement.
2. **PAYG's 10× larger allowance buys only 1.75× real headroom.** Because Lambda
   invocations bind at ~427k views/month regardless of CDN plan, PAYG's binding
   constraint is 427k vs the Free plan's 244k. The extra CDN allowance is unreachable.
3. **It bundles ~$10/month of otherwise-billed services** — WAF (mandatory on a plan
   anyway) and the Route 53 hosted zone, neither of which has a free tier.
4. You need 2 cache behaviours (`default` → S3, `/api/*` → Lambda); Free allows 5.

**Accepted downsides**, all manageable:

- **No custom response-header policies.** Your CSP is custom (allows hCaptcha + Google
  Fonts), so the AWS-managed `SecurityHeadersPolicy` won't cover it. Workaround in §6 row 3.
- **No custom cache policies.** You must use AWS-managed policies (`CachingDisabled` for
  `/api/*`, `CachingOptimized` for assets). Adequate here, but it constrains the
  `Cache-Control` improvements in §6 row 1 — verify managed policies honour origin
  `Cache-Control` headers before relying on it.
- **No access logs.** CloudWatch Logs from Lambda still work; you lose CDN-level logs.
- **One distribution, one apex domain.** No preview environments on this plan. Note
  `JWT_AUDIENCE` (`server/lib/auth.ts:23`) was designed for exactly that use case and
  becomes moot.
- **WAF is mandatory** on a plan and cannot be detached without leaving the plan. Free
  tier inspects only the first 16 KB of a request body — admin post saves with large
  TipTap JSON exceed that and simply go uninspected. Not a blocker.

---

## 4. Migration steps

Each step states the command and how to verify it worked.

**1. Pin the Node version.**
Add `"engines": { "node": ">=24" }` and an `.nvmrc` containing `24`. The repo currently
pins nothing, and Lambda `nodejs24.x` must match local.
*Verify:* `node -v` matches `.nvmrc`; `npm run typecheck && npm run lint && npm test` pass.

**2. Confirm the CloudFront Free plan eligibility question in §3.**
Open an AWS Support case asking whether a Paid-plan account consuming always-free Lambda
allowances is eligible for a CloudFront flat-rate Free plan.
*Verify:* a written answer. **Do not build until this is answered** — it determines the
whole CDN design.

**3. Write the Lambda adapter.** New file `server/lambda.ts`, modelled directly on
`server/dev.ts`: map the Function URL event to `ApiRequest`, build an `ApiResponse` that
accumulates status/headers/body, dispatch via `allRoutes` keyed on the URL path.
*Verify:* a unit test in `tests/server/lambda.test.ts` asserting a synthetic Function URL
event for `/api/posts` returns 200 with the same body shape as the dev server.

**4. Bootstrap CDK.**
```bash
npx cdk bootstrap aws://<account-id>/us-east-1
```
Use **us-east-1** — CloudFront requires its ACM certificate in that region.
*Verify:* `CDKToolkit` stack shows `CREATE_COMPLETE` in CloudFormation.

**5. Define the stack** in `infra/` — private `Bucket`, `NodejsFunction` (arm64, 512 MB,
`nodejs24.x`, `NODE_ENV=production`, `logRetention: 14 days`), `FunctionUrl` with
`authType: AWS_IAM`, `Distribution` with two behaviours and `errorResponses` mapping
403/404 → `/index.html` (200).
*Verify:* `npx cdk synth` emits a template with exactly one Lambda, one bucket, one
distribution, and **no VPC and no NAT Gateway** (grep the template).

**6. Deploy infrastructure.**
```bash
npx cdk deploy
```
*Verify:* the distribution domain returns the SPA shell over HTTPS; `curl -I` on a hashed
asset shows `x-cache: Hit from cloudfront` on the second request.

**7. Upload secrets to SSM Parameter Store** (Standard tier, `SecureString`):
`MONGODB_URI`, `JWT_SECRET`, `INVITE_CODE`, `HCAPTCHA_SECRET`, `HCAPTCHA_SITEKEY`.
*Verify:* `aws ssm get-parameter --name /paper/JWT_SECRET --with-decryption` returns the
value; the Lambda role has `ssm:GetParameter` on `/paper/*` only.

**8. Deploy the frontend.**
```bash
npm run build && aws s3 sync dist/ s3://<bucket> --delete
```
*Verify:* deep-link directly to `/writing/<known-slug>` — it must render, not 404. This
is the SPA-fallback test.

**9. Measure the cold/warm durations assumed in §2.**
```bash
aws logs filter-log-events --log-group-name /aws/lambda/<fn> --filter-pattern "REPORT"
```
*Verify:* read `Init Duration` and `Billed Duration` from the REPORT lines. If cold start
materially exceeds 2,500 ms, re-run the §2 arithmetic and consider AWS Lambda Power Tuning
before changing memory.

**10. Subscribe to the CloudFront Free plan** in the console (per §1.2 caveat), attaching
the Route 53 hosted zone and using an **ALIAS** record (ALIAS queries to CloudFront are
free and don't count against the DNS allowance; CNAMEs do).
*Verify:* the CloudFront console shows the plan active and usage tracking at ~0%.

**11. Full functional pass on the CloudFront domain before any DNS change.**
*Verify, explicitly:* admin login sets the cookie and persists across reload (this is the
`SameSite=Strict` same-origin test); publish a post; view count increments; search returns
results; a deep link loads; browser console shows no CSP violations.

**12. Cut DNS over.** See §9.

---

## 5. Incompatibility table

| # | Issue | Location | Impact | Workaround | Effort |
|---|---|---|---|---|---|
| 1 | `Cache-Control: no-store` on every content read | `posts.ts:66`, `post.ts:47`, `post-view.ts:57`, `notes.ts` | **Dominant Lambda cost driver** — CDN caches nothing, every view hits Lambda | Change *public GETs only* to `s-maxage=60, stale-while-revalidate=300`; invalidate on publish. Leave metric POSTs alone. Cuts invocations ~40%. | **M** (~3h + tests) |
| 2 | `SameSite=Strict` cookie + `credentials: 'same-origin'` | `auth.ts:105`, `store.ts:32` | Login breaks silently if API is on a different host | Single distribution; `/api/*` behaviour → Lambda origin. Never use the raw Function URL as the public endpoint. | **S** (config) |
| 3 | Custom CSP can't use a response-header policy on the Free plan | `vercel.json`, `security.ts:5` | Static assets ship without CSP/HSTS | Set `Content-Security-Policy` as **S3 object metadata at upload time** (`aws s3 sync --metadata`), or a CloudFront Function on viewer-response (included on Free). API responses already set headers in `sendJson`. | **M** (~3h) |
| 4 | SPA fallback rewrite | `vercel.json` last rewrite | Deep links 404 | CloudFront `errorResponses`: 403 and 404 → `/index.html`, status 200 | **S** |
| 5 | `NODE_ENV` not set by Lambda | `auth.ts:112`, `security.ts:35` | **Silently** loses `Secure` cookie flag and HSTS | Set `NODE_ENV=production` in function env | **XS** |
| 6 | `?route=` grouping is Hobby-cap scaffolding | `routes/index.ts:20` | Unnecessary indirection | Optional cleanup. `resolveRouteName` already falls back to path segment, so it works untouched — defer. | **S** or skip |
| 7 | Mongo connect on every cold start | `db.ts:30` | ~0.5–1.5 s cold latency | Keep the `globalThis` cache (already correct). Single Lambda maximises reuse. | **XS** |
| 8 | `JWT_SECRET` read at module load | `auth.ts:31` | Misconfiguration = init crash = 502, not a clean error | Acceptable (fails fast). Add a CloudWatch alarm on init errors. | **XS** |
| 9 | ESM `.js` import suffixes throughout `server/` | all of `server/` | Bundler must resolve them | `NodejsFunction` esbuild handles this; set `format: ESM` | **S** |
| 10 | `better-sqlite3` devDependency has native bindings | `package.json` | Would break an arm64 bundle if pulled in | It's only used by `agent-benchmark/`. Ensure esbuild doesn't reach it — verify bundle contents. | **S** (verify) |
| 11 | hCaptcha requires outbound internet from Lambda | `hcaptcha.ts:71` | Fails if Lambda is placed in a VPC without NAT | **Keep the Lambda out of any VPC.** See §8. | **XS** (critical) |
| 12 | No per-post OG/meta tags | `index.html` | Pre-existing SEO/social gap, unchanged by migration | Optional: CloudFront Function injecting meta for crawler UAs | **M** — out of scope |

---

## 6. Vercel feature replacements

| Vercel feature | Used? | AWS replacement |
|---|---|---|
| Git-push deploys | Yes | GitHub Actions: `npm run build` → `aws s3 sync` → `cdk deploy` → CloudFront invalidation (`/*`) |
| `vercel.json` API rewrites | Yes (14) | One CloudFront `/api/*` cache behaviour → Lambda Function URL origin. The `?route=` params become unnecessary. |
| `vercel.json` SPA fallback | Yes | CloudFront `errorResponses` 403/404 → `/index.html` |
| `vercel.json` headers (6) | Yes | S3 object metadata on upload + AWS-managed response-header policy (Free plan constraint — see §5 row 3) |
| Serverless functions (12-fn cap) | Yes | One Lambda. **Cap no longer exists.** |
| Automatic HTTPS | Yes | ACM certificate in **us-east-1**, included in the Free plan |
| Env var management | Yes | SSM Parameter Store (Standard, free) + Lambda env vars for non-secrets |
| Cron jobs | **No** — none in `vercel.json` | N/A |
| Vercel KV / Postgres / Blob | **No** | N/A — Atlas unchanged |
| Preview deployments | Assumed | Not available on the Free plan (1 distribution). `JWT_AUDIENCE` becomes moot. |
| Build logs / runtime logs | Yes | CloudWatch Logs — **set retention** (see §8) |
| DDoS protection | Implicit | AWS WAF + Shield Standard, included in the Free plan |

---

## 7. Data layer: DynamoDB verdict

**DynamoDB is the wrong tool here, and adopting it would be forcing it.** Direct answer to
the brief's question:

1. **Search makes it infeasible.** `server/routes/posts.ts:52` runs an un-anchored,
   case-insensitive regex across `title`, `excerpt`, `tags` *and the full essay body*
   (`contentText`). DynamoDB has no equivalent. You would need a full `Scan` with a
   `FilterExpression` — which consumes RCU proportional to **table size, not result
   size** — or bolt on OpenSearch, which has no meaningful always-free tier and would
   itself break the cost constraint.
2. **It is a rewrite, not a migration.** Mongoose is woven through every model, every
   route, and every test. You would lose `runValidators: true`, the pre-save bcrypt hook
   (`User.ts:41`), and the duplicate-key `11000` handling that both `post.ts` and
   `posts.ts` depend on for slug conflicts.
3. **The stated motivation is void.** DynamoDB was proposed for the Next.js ISR/tag cache.
   There is no such cache, because there is no Next.js.

The only genuinely DynamoDB-shaped tables are `AuthThrottle` and `MetricThrottle` — pure
key-value with TTL expiry. They are also the lowest-value tables in the system, and
splitting them out would mean running two databases to save nothing.

**Keep MongoDB Atlas.** It sits entirely outside AWS billing, which *helps* the cost
constraint. Atlas M0 (free) is sufficient at this traffic.

**The honest weak joint in this architecture** is Atlas + Lambda, not Atlas itself:

- Every cold start pays a TLS handshake and topology discovery (~0.5–1.5 s).
- `requireAuth` (`vercel-auth.ts:38`) hits Mongo on **every** authenticated request to
  check `tokenVersion`.
- Combined with `no-store`, essentially every request is a DB round-trip.
- Atlas M0 caps connections; Lambda burst concurrency can exhaust connection limits.

None of this bites at 10k views/month. All of it is what degrades first if traffic grows
20×. Fixing §5 row 1 is the highest-leverage change available.

---

## 8. Cost-traps checklist

- [ ] **NAT Gateway — the single biggest trap.** ~$32/month plus per-GB, and it is *never*
      free-tier. It appears the moment you put a Lambda in a VPC private subnet "for
      security". This app needs outbound internet (Atlas + hCaptcha) and has **no VPC
      resources at all**. **Keep the Lambda out of any VPC.** Grep the synthesized
      template for `AWS::EC2::NatGateway` before every deploy.
- [ ] **CloudWatch Logs retention.** Log groups default to **Never Expire** and accumulate
      forever at $0.50/GB ingested. Set `logRetention` explicitly (14 days is ample).
      Note `finishRequest` (`logger.ts:52`) logs every request when `NODE_ENV !== production`
      — another reason step 4/§5 row 5 matters.
- [ ] **Secrets Manager vs SSM Parameter Store.** Secrets Manager is **$0.40 per secret per
      month** — with 5 secrets that is $24/year for nothing. **SSM Parameter Store Standard
      tier is free.** Use Standard `SecureString`. Avoid Advanced parameters ($0.05/param/month).
- [ ] **Lambda memory sizing.** 128 MB is not automatically cheapest — CPU scales with
      memory, so a slower function can cost the same or more GB-seconds. Measure with AWS
      Lambda Power Tuning rather than guessing. 512 MB is the starting assumption in §2.
- [ ] **ARM vs x86.** arm64 is **20% cheaper per GB-second** ($0.0000133334 vs
      $0.0000166667); request price is identical. `bcryptjs` is pure JS with no native
      binding, so arm64 is safe. Confirm `better-sqlite3` (native, devDependency) never
      enters the bundle.
- [ ] **Image-optimisation compute.** N/A — there is no image pipeline, and **do not build
      one**. Cover images are remote URLs, so they cost nothing. Adding S3-hosted images
      later would introduce resize-Lambda compute; keep remote URLs.
- [ ] **CloudFront invalidations.** First 1,000 paths/month are free, then $0.005/path.
      Invalidate `/*` (counts as **one** path), never per-file lists.
- [ ] **Orphaned resources.** CloudFront distributions must be *disabled* then deleted
      (~15 min). Watch for: accumulated S3 object versions if versioning is on, old Lambda
      versions against the 300 GB code-storage quota, log groups surviving deleted
      functions, unattached Elastic IPs (charged when idle).
- [ ] **Route 53 hosted zone.** $0.50/month, **no free tier** — but included if attached to
      the CloudFront plan. Use **ALIAS** records: ALIAS queries to CloudFront are free and
      exempt from the DNS allowance; CNAME queries are not.
- [ ] **Billing alarm.** Set an AWS Budget at $1/month with an email alert. Cheap insurance
      against every trap above.

---

## 9. Rollback plan and parallel running

**The key property: there is no data migration.** Both stacks read and write the same
MongoDB Atlas cluster, so there is no cutover, no dual-write, and no split-brain on
content. Rollback is purely a DNS change. This makes the migration unusually safe.

*Shared-state note:* while both stacks are live they both write `AuthThrottle` and
`MetricThrottle`. This is harmless — rate-limit counters are keyed by IP and bucket, and
double-counting only makes throttling slightly stricter.

**Sequence**

1. Deploy the AWS stack; access it via the CloudFront domain only. Vercel remains live and
   authoritative. **Duration: as long as needed.**
2. Complete the step-11 functional pass on the CloudFront domain.
3. **48 hours before cutover**, lower the DNS TTL on the apex record to **60 seconds**.
   Verify with `dig +short <domain>` that the TTL has actually dropped — this is what makes
   rollback fast, and it must propagate before you cut.
4. Cut DNS to the CloudFront ALIAS record. Watch CloudWatch for 30 minutes: Lambda errors,
   4xx/5xx rates, cold-start durations.
5. **Run Vercel in parallel for 2 full weeks.** Rationale: two weeks covers a full billing
   cycle boundary, at least one AWS log-retention rotation, and enough traffic at ~5k
   views/month (~1,150 sessions) to surface intermittent cold-start and auth-cookie issues
   that a smoke test misses. Do not shorten this to a few days — the failure modes here
   (cookie `Secure` flag, CSP violations, cold-start timeouts) are exactly the intermittent
   kind.
6. After two clean weeks, delete the Vercel project. Keep the `vercel.json` in git as
   documentation of the original header/rewrite contract.

**Rollback trigger and procedure**

Roll back immediately if any of: admin login fails to persist, published content 404s,
view counts stop incrementing, or Lambda error rate exceeds 1%.

Procedure: repoint the apex DNS record back to Vercel. With a 60 s TTL, recovery is
**~1–2 minutes**. No data restore is required, because no data ever moved.

---

## 10. Open questions and flagged uncertainties

1. **CloudFront Free plan eligibility (§3).** The clause "Your account is using AWS Free
   Tier" is genuinely ambiguous and the entire CDN recommendation depends on it. **Confirm
   with AWS Support before building.**
2. **Can a flat-rate plan be managed via CloudFormation/CDK?** Unconfirmed. Assume
   console-only and expect possible CDK drift on the WAF web ACL.
3. **Do AWS-managed cache policies honour origin `Cache-Control`?** Matters for the §5 row 1
   optimisation, since custom cache policies are Business+. Verify before relying on
   `s-maxage`.
4. **Lambda cold/warm durations (§2) are estimates.** Measure at step 9 and re-run the
   arithmetic. They do not change the recommendation — you are at ~2% of allowance, so even
   a 5× error leaves large headroom — but they change the growth ceiling.
5. **arm64 vs x86 unit pricing.** The AWS Lambda pricing page fetch returned identical
   figures for both architectures, which contradicts multiple secondary sources reporting
   arm64 at 20% less. Confirm in the AWS Pricing Calculator. Immaterial at current traffic
   (both are free), material if you grow past ~400k views/month.

## 11. Is this migration worth doing?

Stated plainly, since the cost case does not carry it: at under 10k page views/month,
**Vercel Hobby is already $0 and this AWS stack will also be ~$0.** The migration will not
save money.

The legitimate reasons to do it anyway are: escaping the 12-serverless-function cap that
currently distorts `api/` and `server/routes/index.ts`; Vercel Hobby's prohibition on
commercial use, if that ever applies; wanting full control over caching and headers; and
learning the stack. Those are good reasons. "It will be cheaper" is not one of them —
budget the effort accordingly.

---

## Sources

- [AWS Free Tier](https://aws.amazon.com/free/) — Free plan vs Paid plan, 6-month auto-close
- [CloudFront flat-rate pricing plans (AWS docs)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html) — tier allowances, feature matrix, eligibility clause, quotas, S3 credits, Route 53 coverage
- [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) — flat-rate plan tiers
- [AWS Free Tier data transfer expansion — 1 TB from CloudFront](https://aws.amazon.com/blogs/aws/aws-free-tier-data-transfer-expansion-100-gb-from-regions-and-1-tb-from-amazon-cloudfront-per-month/) — CloudFront PAYG always-free tier
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/) — 1M requests + 400,000 GB-seconds always-free
- [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html) — 6 MB sync payload, 200 MB streamed, 900 s timeout, 50 MB zipped / 250 MB unzipped package, 128–10,240 MB memory, 1,000 default concurrency
- [Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) — `nodejs24.x` newest supported (deprecates 2028-04-30); `nodejs20.x` deprecated 2026-04-30; all runtimes support x86_64 and arm64
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) — free tier replaced by $200 credits as of 2025-07-15
- [Route 53 pricing](https://aws.amazon.com/route53/pricing/) — $0.50/hosted zone/month, no free tier; ALIAS queries to CloudFront free
- [AWS WAF pricing](https://aws.amazon.com/waf/pricing) — $5/web ACL/month, $1/rule/month, $0.60/M requests
- [AWS Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/) — Parameter Store Standard free; Advanced $0.05/param/month

*Unverified against a primary AWS source — confirm before relying on:* Secrets Manager
$0.40/secret/month; CloudFront invalidation first 1,000 paths free then $0.005/path;
CloudWatch Logs $0.50/GB ingestion; arm64 Lambda at $0.0000133334/GB-s vs x86
$0.0000166667/GB-s. These come from secondary sources only.
