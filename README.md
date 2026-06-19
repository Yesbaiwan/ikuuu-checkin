# ikuuu.org 登录签到分析

- login.py: 实现登录，获取账号 Cookie（内置极验 V4 验证码解决）
- checkin.py: 用 Cookie 签到

## 运行

```bash
uv sync
uv run src/login.py
uv run src/checkin.py
```

## 注意事项

- 先运行 `login.py` 获取 Cookie，再运行 `checkin.py` 签到
- 请求过快会失败，且不保证登录百分百成功
- 项目仅用于学习使用

## 项目结构

```
ikuuu-checkin/
├── src/                           # 源码
│   ├── login.py                   # 获取 Cookie
│   ├── checkin.py                 # 签到
│   └── signer.py                  # 极验 V4 w 参数加密
├── .env.example                   # 环境变量示例
├── pyproject.toml                 # Python项目配置
└── requirements.txt               # 依赖
```
