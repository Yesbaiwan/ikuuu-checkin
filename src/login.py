"""
极验 V4 验证码解决器 + ikuuu.win 登录
"""

import json
import random
import time
import os
from pathlib import Path
from uuid import uuid4
from curl_cffi import requests
import httpx

from signer import Signer, lotParser

# 项目根目录
BASE_DIR = Path(__file__).parent.parent

# 加载 .env 文件
env_file = BASE_DIR / ".env"
if env_file.exists():
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def load_accounts_from_env() -> list[dict]:
    """从环境变量加载账号信息

    格式: IKUUU_ACCOUNTS=email1:password1,email2:password2
    示例: IKUUU_ACCOUNTS=user1@gmail.com:pass1,user2@qq.com:pass2
    """
    accounts_env = os.getenv("IKUUU_ACCOUNTS", "")
    if not accounts_env:
        return []

    accounts = []
    for account_str in accounts_env.split(","):
        if ":" not in account_str:
            continue
        email, password = account_str.split(":", 1)
        accounts.append({"email": email.strip(), "password": password.strip()})
    return accounts


ACCOUNTS = load_accounts_from_env()

CAPTCHA_ID = "cc96d05ba8b60f9112f76e18526fcb73"
LOGIN_URL = "https://ikuuu.win/auth/login"
OUTPUT_DIR = ".output"  # Cookie 输出目录


def random_callback() -> str:
    """生成随机回调函数名"""
    return f"geetest_{int(random.random() * 10000) + int(time.time() * 1000)}"


def sleep_random(min_ms: int = 500, max_ms: int = 1500):
    """随机延迟"""
    time.sleep(random.randint(min_ms, max_ms) / 1000)


def solve_captcha(captcha_id: str = CAPTCHA_ID, max_retries: int = 10) -> dict:
    """
    解决验证码，返回 seccode
    """
    session = requests.Session(impersonate="chrome124")

    try:
        for attempt in range(max_retries):
            # 1. 加载验证码
            sleep_random(800, 1500)
            callback = random_callback()
            challenge = str(uuid4())

            resp = session.get(
                "https://gcaptcha4.geevisit.com/load",
                params={
                    "captcha_id": captcha_id,
                    "challenge": challenge,
                    "client_type": "web",
                    "lang": "zh-cn",
                    "callback": callback,
                },
            )
            data = json.loads(resp.text.split(f"{callback}(")[1].rstrip(")"))["data"]
            lot_number = data["lot_number"]

            # 2. 构建 w 参数
            sleep_random(2000, 4000)
            pow_detail = data["pow_detail"]
            pt = data.get("pt", "1")

            base = {
                **Signer.generate_pow(
                    lot_number,
                    captcha_id,
                    pow_detail["hashfunc"],
                    pow_detail["version"],
                    pow_detail["bits"],
                    pow_detail["datetime"],
                    "",
                ),
                **lotParser.get_dict(lot_number),
                "biht": "1426265548",
                "device_id": "",
                "em": {
                    "cp": 0,
                    "ek": "11",
                    "nt": 0,
                    "ph": 0,
                    "sc": 0,
                    "si": 0,
                    "wd": 1,
                },
                "gee_guard": {
                    "roe": {
                        "auh": "3",
                        "aup": "3",
                        "cdc": "3",
                        "egp": "3",
                        "res": "3",
                        "rew": "3",
                        "sep": "3",
                        "snh": "3",
                    }
                },
                "ep": "123",
                "geetest": "captcha",
                "lang": "zh",
                "lot_number": lot_number,
                "passtime": random.randint(3000, 5000),
            }
            w = Signer.encrypt_w(json.dumps(base), pt)

            # 3. 提交验证
            callback = random_callback()
            resp = session.get(
                "https://gcaptcha4.geevisit.com/verify",
                params={
                    "callback": callback,
                    "captcha_id": captcha_id,
                    "client_type": "web",
                    "lot_number": lot_number,
                    "payload": data["payload"],
                    "process_token": data["process_token"],
                    "payload_protocol": "1",
                    "pt": pt,
                    "w": w,
                },
            )
            result = json.loads(resp.text.split(f"{callback}(")[1].rstrip(")"))

            if result.get("status") == "success":
                result_data = result.get("data", {})
                if "seccode" in result_data:
                    return result_data
    finally:
        session.close()

    return None


def login(email: str, password: str) -> dict:
    """
    登录 ikuuu.win
    返回 {"success": True, "cookies": "..."} 或 {"success": False, "error": "..."}
    """
    # 1. 解决验证码
    captcha_result = solve_captcha()
    if not captcha_result:
        return {"success": False, "error": "验证码解决失败"}

    seccode = captcha_result["seccode"]

    # 2. 登录
    with httpx.Client(follow_redirects=True, timeout=60) as client:
        resp = client.post(
            LOGIN_URL,
            data={
                "host": "ikuuu.win",
                "email": email,
                "passwd": password,
                "code": "",
                "remember_me": "on",
                "pageLoadedAt": str(int(time.time() * 1000)),
                "captcha_result[lot_number]": captcha_result["lot_number"],
                "captcha_result[captcha_output]": seccode["captcha_output"],
                "captcha_result[pass_token]": seccode["pass_token"],
                "captcha_result[gen_time]": seccode["gen_time"],
            },
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
        )
        result = resp.json()

        if result.get("ret") == 1:
            cookies = "; ".join([f"{k}={v}" for k, v in resp.cookies.items()])
            return {"success": True, "cookies": cookies}
        else:
            return {"success": False, "error": result.get("msg", "登录失败")}


def save_cookie(email: str, cookies: str):
    """保存Cookie到文件"""
    # 创建输出目录
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    # 使用完整邮箱作为文件名
    filename = email + ".txt"
    filepath = os.path.join(OUTPUT_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(cookies)

    return filepath


def batch_login():
    """批量登录所有账号"""
    print(f"批量登录 {len(ACCOUNTS)} 个账号")

    results = []
    for i, account in enumerate(ACCOUNTS, 1):
        email = account["email"]
        password = account["password"]

        print(f"[{i}/{len(ACCOUNTS)}] {email}")
        result = login(email, password)

        if result["success"]:
            filepath = save_cookie(email, result["cookies"])
            print(f"  成功: {filepath}")
            results.append(
                {
                    "email": email,
                    "success": True,
                    "cookies": result["cookies"],
                    "filepath": filepath,
                }
            )
        else:
            print(f"  失败: {result['error']}")
            results.append({"email": email, "success": False, "error": result["error"]})

    success_count = sum(1 for r in results if r["success"])
    print(f"完成: {success_count}/{len(ACCOUNTS)}")

    return results


if __name__ == "__main__":
    batch_login()
