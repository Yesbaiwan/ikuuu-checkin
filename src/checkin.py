"""
ikuuu.org 自动签到
使用保存的Cookie进行批量签到
"""

import time
from pathlib import Path
import requests

# ==================== 配置 ====================

OUTPUT_DIR = ".output"  # Cookie文件目录
CHECKIN_URL = "https://ikuuu.win/user/checkin"


def get_cookie_files():
    """获取所有Cookie文件"""
    output_path = Path(OUTPUT_DIR)
    if not output_path.exists():
        print(f"错误: 目录 {OUTPUT_DIR} 不存在")
        return []

    cookie_files = list(output_path.glob("*.txt"))
    return cookie_files


def read_cookie(filepath):
    """读取Cookie文件内容"""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read().strip()


def checkin(cookie_str: str) -> dict:
    """
    执行签到
    返回 {"success": True, "msg": "..."} 或 {"success": False, "error": "..."}
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "Cookie": cookie_str,
    }

    try:
        response = requests.post(CHECKIN_URL, headers=headers)
        result = response.json()

        ret = result.get("ret")
        msg = result.get("msg", "")

        if ret == 1:
            return {"success": True, "msg": msg}
        else:
            return {"success": False, "error": msg or "签到失败"}
    except Exception as e:
        return {"success": False, "error": f"请求异常: {str(e)}"}


def batch_checkin():
    """批量签到所有账号，单账号间隔2秒防止限流"""
    cookie_files = get_cookie_files()

    if not cookie_files:
        print("没有找到Cookie文件，请先运行登录脚本")
        return

    print(f"批量签到 {len(cookie_files)} 个账号")

    results = []
    for i, cookie_file in enumerate(cookie_files, 1):
        account_id = cookie_file.stem
        print(f"[{i}/{len(cookie_files)}] {account_id}")

        cookie_str = read_cookie(cookie_file)
        result = checkin(cookie_str)

        if result["success"]:
            print(f"  成功: {result['msg']}")
            results.append({"account": account_id, "success": True, "msg": result["msg"]})
        else:
            print(f"  失败: {result['error']}")
            results.append({"account": account_id, "success": False, "error": result["error"]})

        # 单账号间隔2秒，防止限流（最后一个账号后不需要等待）
        if i < len(cookie_files):
            time.sleep(2)

    success_count = sum(1 for r in results if r["success"])
    print(f"完成: {success_count}/{len(cookie_files)}")

    return results


if __name__ == "__main__":
    batch_checkin()
