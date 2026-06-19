# ikuuu 登录签到

## 运行

**Python:**

```bash
uv sync
uv run src/login.py
uv run src/checkin.py
```

**Cloudflare Workers:**

1. [新建 Worker](https://dash.cloudflare.com/)，粘贴 `src/worker.js` 代码并部署
2. 设置 → 触发事件 → 添加 Cron 触发器，表达式 `0 8 * * *`（北京时间下午 4 点）

## 项目结构

```
├── src/
│   ├── login.py    # 登录（含极验 V4 验证码解决）
│   ├── checkin.py  # 签到
│   ├── signer.py   # 加密
│   └── worker.js   # Workers 单文件版
└── .env            # 账号配置
```

## ikuuu 域名

> 研究过程中收集的域名，部分可能已失效

- `ikuuu.win`
- `ikuuu.fyi`
- `ikuuu.de`
- `ikuuu.org`
