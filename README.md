# ikuuu.org 登录签到分析

使用 https://github.com/xKiian/GeekedTest 此项目过验证，下载项目代码到本地，放在根目录下。

- captcha_solver.py: 实现登录，获取账号 Cookie
- checkin.py: 用 Cookie 签到

## 运行

```bash
git clone https://github.com/xKiian/GeekedTest.git
uv sync
uv run src/captcha_solver.py
uv run src/checkin.py
```

## 注意事项

- 自行下载 GeekedTest 项目代码到本地，放在根目录下
- 先运行 `captcha_solver.py` 获取 Cookie，再运行 `checkin.py` 签到
- 请求过快会失败，且不保证登录百分百成功
- 项目仅用于学习使用

## 项目结构

```
ikuuu-checkin/
├── GeekedTest/                    # 极验验证码识别模块（依赖项目）
├── src/                           # 源码
│   ├── captcha_solver.py          # 获取 Cookie
│   └── checkin.py                 # 签到
├── .env.example                   # 环境变量示例
├── pyproject.toml                 # Python项目配置
└── requirements.txt               # 依赖
```
