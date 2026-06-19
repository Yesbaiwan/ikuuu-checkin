/**
 * ikuuu.win 自动签到 - Cloudflare Workers 版本
 */

// ==================== 配置区 ====================
const ACCOUNTS = [
  { email: "你的邮箱", pwd: "你的密码" },
  { email: "你的邮箱", pwd: "你的密码" },
  // 按照个人需求增删...
];

const LOGIN_URL = "https://ikuuu.win/auth/login";
const CHECKIN_URL = "https://ikuuu.win/user/checkin";
const CAPTCHA_ID = "cc96d05ba8b60f9112f76e18526fcb73";
const GEETEST_BASE = "https://gcaptcha4.geevisit.com";

const RSA_N = BigInt(
  "0x00C1E3934D1614465B33053E7F48EE4EC87B14B95EF88947713D25EECBFF7E74C7977D02DC1D9451F79DD5D1C10C29ACB6A9B4D6FB7D0A0279B6719E1772565F09AF627715919221AEF91899CAE08C0D686D748B20A3603BE2318CA6BC2B59706592A9219D0BF05C9F65023A21D2330807252AE0066D59CEEFA5F2748EA80BAB81",
);
const RSA_E = BigInt("0x10001");

// ==================== 工具 ====================
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buf2hex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ==================== 加密 ====================
async function md5(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("MD5", buf);
  return buf2hex(hash);
}

async function sha1(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return buf2hex(hash);
}

async function sha256(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return buf2hex(hash);
}

function randUid() {
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += Math.floor(65536 * (1 + Math.random()))
      .toString(16)
      .padStart(4, "0")
      .slice(-4);
  }
  return result;
}

function parseLotNumber(lotNumber) {
  const mapping = { "(n[17:18]+n[9:10])+.+(n[16:19])+.+(n[23:30])": "n[10:15]" };

  function parseSlice(s) {
    return s.split(":").map((x) => parseInt(x));
  }

  function extract(part) {
    const match = part.match(/\[(.*?)\]/);
    return match ? match[1] : "";
  }

  function parse(s) {
    const parts = s.split("+.+");
    const parsed = [];
    for (const part of parts) {
      if (part.includes("+")) {
        const subs = part.split("+");
        parsed.push(subs.map((sub) => parseSlice(extract(sub))));
      } else {
        parsed.push([parseSlice(extract(part))]);
      }
    }
    return parsed;
  }

  function buildStr(parsed, num) {
    const result = [];
    for (const p of parsed) {
      const current = [];
      for (const s of p) {
        const start = s[0];
        const end = s.length > 1 ? s[1] + 1 : start + 1;
        current.push(num.slice(start, end));
      }
      result.push(current.join(""));
    }
    return result.join(".");
  }

  for (const [k, v] of Object.entries(mapping)) {
    const lot = parse(k);
    const lotRes = parse(v);
    const i = buildStr(lot, lotNumber);
    const r = buildStr(lotRes, lotNumber);
    const parts = i.split(".");
    const a = {};
    let current = a;
    parts.forEach((part, idx) => {
      if (idx === parts.length - 1) {
        current[part] = r;
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    });
    return a;
  }
  return {};
}

async function generatePow(lotNumber, captchaId, hashFunc, version, bits, date) {
  const prefix = "0".repeat(Math.floor(bits / 4));
  const powString = `${version}|${bits}|${hashFunc}|${date}|${captchaId}|${lotNumber}||`;

  while (true) {
    const h = randUid();
    let hashedValue;
    if (hashFunc === "md5") {
      hashedValue = await md5(powString + h);
    } else if (hashFunc === "sha1") {
      hashedValue = await sha1(powString + h);
    } else if (hashFunc === "sha256") {
      hashedValue = await sha256(powString + h);
    } else {
      throw new Error(`Unknown hash function: ${hashFunc}`);
    }
    if (hashedValue.startsWith(prefix)) {
      return { pow_msg: powString + h, pow_sign: hashedValue };
    }
  }
}

function bigIntToBytes(bigInt, length) {
  const bytes = new Uint8Array(length);
  let temp = bigInt;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return bytes;
}

function bytesToBigInt(bytes) {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

function pkcs1v15Pad(message, keySize) {
  const messageBytes = new TextEncoder().encode(message);
  if (messageBytes.length > keySize - 11) {
    throw new Error("Message too long for RSA key");
  }
  const paddingLength = keySize - messageBytes.length - 3;
  const padded = new Uint8Array(keySize);
  padded[0] = 0x00;
  padded[1] = 0x02;
  for (let i = 2; i < 2 + paddingLength; i++) {
    padded[i] = Math.floor(Math.random() * 255) + 1;
  }
  padded[2 + paddingLength] = 0x00;
  padded.set(messageBytes, 3 + paddingLength);
  return padded;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  base = base % modulus;
  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function rsaEncrypt(message) {
  const padded = pkcs1v15Pad(message, 128);
  const m = bytesToBigInt(padded);
  const c = modPow(m, RSA_E, RSA_N);
  return bigIntToBytes(c, 128);
}

async function aesEncrypt(plaintext, key) {
  const keyData = new TextEncoder().encode(key);
  const iv = new TextEncoder().encode("0000000000000000");
  const data = new TextEncoder().encode(plaintext);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "AES-CBC" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, cryptoKey, data);
  return new Uint8Array(encrypted);
}

async function generateW(data, captchaId) {
  const lotNumber = data.lot_number;
  const powDetail = data.pow_detail;
  const powResult = await generatePow(lotNumber, captchaId, powDetail.hashfunc, powDetail.version, powDetail.bits, powDetail.datetime);

  const base = {
    "9zXN": "NYzS",
    ...powResult,
    ...parseLotNumber(lotNumber),
    biht: "1426265548",
    device_id: "",
    em: { cp: 0, ek: "11", nt: 0, ph: 0, sc: 0, si: 0, wd: 1 },
    gee_guard: {
      roe: { auh: "3", aup: "3", cdc: "3", egp: "3", res: "3", rew: "3", sep: "3", snh: "3" },
    },
    ep: "123",
    geetest: "captcha",
    lang: "zh",
    lot_number: lotNumber,
    passtime: Math.floor(Math.random() * 2000) + 3000,
    userresponse: Math.random() * 2 + 1,
  };

  const randomUid = randUid();
  const encryptedData = await aesEncrypt(JSON.stringify(base), randomUid);
  const encryptedKey = rsaEncrypt(randomUid);

  return buf2hex(encryptedData) + buf2hex(encryptedKey);
}

function parseJsonp(text, callback) {
  try {
    const prefix = `${callback}(`;
    const suffix = ")";
    if (text.startsWith(prefix) && text.endsWith(suffix)) {
      const jsonStr = text.slice(prefix.length, -suffix.length);
      return JSON.parse(jsonStr).data;
    }
    return JSON.parse(text).data;
  } catch (e) {
    throw new Error(`JSONP parse failed: ${text.substring(0, 200)}`);
  }
}

// ==================== 验证码 ====================
async function solveGeetest() {
  const callback = `geetest_${Math.floor(Math.random() * 10000) + Date.now()}`;
  const challenge = crypto.randomUUID();

  const loadUrl = `${GEETEST_BASE}/load?captcha_id=${CAPTCHA_ID}&challenge=${challenge}&client_type=web&lang=zh-cn&callback=${callback}`;
  await sleep(Math.floor(Math.random() * 700) + 800);
  const loadResp = await fetch(loadUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://ikuuu.win/",
      Accept: "*/*",
    },
  });
  const loadText = await loadResp.text();

  let loadData;
  try {
    loadData = parseJsonp(loadText, callback);
  } catch (e) {
    throw new Error(`Load failed: ${e.message}`);
  }
  if (!loadData) throw new Error("Load returned no data");
  if (loadData.captcha_type !== "ai") throw new Error(`Unexpected captcha type: ${loadData.captcha_type}`);

  const w = await generateW(loadData, CAPTCHA_ID);

  await sleep(Math.floor(Math.random() * 2000) + 2000);

  const verifyCallback = `geetest_${Math.floor(Math.random() * 10000) + Date.now()}`;
  const pt = loadData.pt || "1";
  const verifyUrl = `${GEETEST_BASE}/verify?callback=${verifyCallback}&captcha_id=${CAPTCHA_ID}&client_type=web&lot_number=${loadData.lot_number}&payload=${loadData.payload || ""}&process_token=${loadData.process_token || ""}&payload_protocol=1&pt=${pt}&w=${w}`;

  const verifyResp = await fetch(verifyUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://ikuuu.win/",
      Accept: "*/*",
    },
  });
  const verifyText = await verifyResp.text();

  let verifyData;
  try {
    verifyData = parseJsonp(verifyText, verifyCallback);
  } catch (e) {
    throw new Error(`Verify parse failed: ${verifyText.substring(0, 300)}`);
  }
  if (!verifyData) throw new Error(`Verify no data: ${verifyText.substring(0, 300)}`);

  if (verifyData.result !== "success") {
    throw new Error(`Geetest verification failed: ${JSON.stringify(verifyData)}`);
  }

  const seccode = verifyData.seccode || {};
  return {
    lot_number: seccode.lot_number || "",
    captcha_output: seccode.captcha_output || "",
    pass_token: seccode.pass_token || "",
    gen_time: seccode.gen_time || "",
  };
}

function extractCookies(response) {
  const setCookie = response.headers.getSetCookie();
  if (!setCookie || setCookie.length === 0) return "";
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

// ==================== 主流程 ====================
async function runCheckin() {
  let log = `检测到 ${ACCOUNTS.length} 个账号，开始执行...\n\n`;

  for (let i = 0; i < ACCOUNTS.length; i++) {
    const account = ACCOUNTS[i];
    log += `[${i + 1}/${ACCOUNTS.length}] ${account.email}\n`;

    try {
      const captchaResult = await solveGeetest();

      const loginData = new URLSearchParams({
        host: "ikuuu.win",
        email: account.email,
        passwd: account.pwd,
        code: "",
        remember_me: "on",
        pageLoadedAt: Date.now().toString(),
        "captcha_result[lot_number]": captchaResult.lot_number,
        "captcha_result[captcha_output]": captchaResult.captcha_output,
        "captcha_result[pass_token]": captchaResult.pass_token,
        "captcha_result[gen_time]": captchaResult.gen_time,
      });

      const loginResp = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: loginData,
      });

      const cookies = extractCookies(loginResp);
      const loginJson = await loginResp.json();

      if (loginJson.ret !== 1) {
        log += `  失败: ${loginJson.msg}\n`;
        continue;
      }

      const checkinResp = await fetch(CHECKIN_URL, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
          Cookie: cookies,
        },
      });
      const checkinJson = await checkinResp.json();

      if (checkinJson.ret === 1) {
        log += `  成功: ${checkinJson.msg}\n`;
      } else {
        log += `  失败: ${checkinJson.msg || "签到失败"}\n`;
      }
    } catch (e) {
      log += `  失败: ${e.message}\n`;
    }

    if (i < ACCOUNTS.length - 1) await sleep(2000);
  }

  log += "\n全部完成!";
  return log;
}

// ==================== Workers 入口 ====================
export default {
  async fetch(request) {
    const log = await runCheckin();
    return new Response(log, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCheckin());
  },
};
