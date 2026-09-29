#!/usr/bin/env python3
"""Check a loose-pages proof with Lean.

The browser POSTs only the theorem declarations. We refuse anything outside
the small vocabulary the book's generator uses (so no #eval, imports, macros
or options can get in), wrap it in our own fixed prelude, and run Lean on it
one request at a time. Results are cached by content hash.
"""

import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

# Overridable for local development; the web server never sets these.
LEAN = os.environ.get("LOOSE_PAGES_LEAN", "/opt/lean/bin/lean")
CACHE = os.environ.get("LOOSE_PAGES_CACHE", "/var/cache/lean-check")
MAX_BODY = 512 * 1024
MAX_THEOREMS = 80

# Must match LEAN_PRELUDE / LEAN_POSTLUDE in cat-theory/src/engine/lean.ts (a test checks).
PRELUDE = """class LeftGroup (G : Type) extends Mul G, Inv G where
  e : G
  assoc : ∀ {x y z : G}, (x * y) * z = x * (y * z)
  e_mul : ∀ {x : G}, e * x = x
  inv_mul : ∀ {x : G}, x⁻¹ * x = e

namespace LeftGroup
variable {G : Type} [LeftGroup G]
"""
POSTLUDE = """end LeftGroup
"""

TOKEN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|:=|=>|⁻¹|[():=*._{}·]|[ \n]+")
WORD = re.compile(r"^(theorem|calc|fun|congrArg|symm|assoc|e_mul|inv_mul|mul_inv_rev|e|lemma\d{1,3}|G|[xyzuvwpqrst])$")


def reply(status, payload):
    sys.stdout.write(f"Status: {status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n\r\n")
    sys.stdout.write(json.dumps(payload))
    sys.exit(0)


def validate(body):
    pos = 0
    for m in TOKEN.finditer(body):
        if m.start() != pos:
            return f"unexpected character at offset {pos}"
        tok = m.group(0)
        if tok[0].isalpha() or tok[0] == "_":
            if not WORD.match(tok) and tok != "_":
                return f"unexpected word {tok[:20]!r}"
        pos = m.end()
    if pos != len(body):
        return f"unexpected character at offset {pos}"
    if body.count("theorem") > MAX_THEOREMS:
        return "too many theorems"
    return None


def run_lean(body):
    source = PRELUDE + "\n" + body + "\n\n" + POSTLUDE
    offset = PRELUDE.count("\n") + 1
    with tempfile.NamedTemporaryFile("w", suffix=".lean", dir=CACHE, delete=False, encoding="utf-8") as f:
        f.write(source)
        path = f.name
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [LEAN, path],
            capture_output=True,
            text=True,
            timeout=120,
            env={"PATH": "/usr/bin:/bin", "HOME": CACHE},
        )
        output = proc.stdout + proc.stderr
        code = proc.returncode
    except subprocess.TimeoutExpired:
        output, code = "timeout", -1
    finally:
        os.unlink(path)
    elapsed = round((time.monotonic() - started) * 1000)
    errors = []
    for line in output.splitlines():
        m = re.match(r"^.*?:(\d+):(\d+): (error|warning): (.*)$", line)
        if m:
            errors.append({"line": int(m.group(1)) - offset, "col": int(m.group(2)), "kind": m.group(3), "msg": m.group(4)[:300]})
    ok = code == 0 and not any(e["kind"] == "error" for e in errors)
    if not ok and not errors:
        errors.append({"line": 0, "col": 0, "kind": "error", "msg": output.strip()[:300] or "lean failed"})
    return {"ok": ok, "errors": errors[:20], "ms": elapsed}


def version():
    try:
        return subprocess.run([LEAN, "--version"], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return "Lean"


def main():
    if os.environ.get("REQUEST_METHOD") != "POST":
        reply("405 Method Not Allowed", {"error": "POST a proof"})
    try:
        length = int(os.environ.get("CONTENT_LENGTH", "0"))
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY:
        reply("413 Payload Too Large", {"error": "proof too large"})
    try:
        body = sys.stdin.buffer.read(length).decode("utf-8")
    except UnicodeDecodeError:
        reply("400 Bad Request", {"error": "not utf-8"})
    problem = validate(body)
    if problem:
        reply("400 Bad Request", {"error": problem})

    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    cached = os.path.join(CACHE, digest + ".json")
    if os.path.exists(cached):
        with open(cached, encoding="utf-8") as f:
            result = json.load(f)
        result["cached"] = True
        reply("200 OK", result)

    # One Lean at a time; don't queue forever.
    with open(os.path.join(CACHE, "lock"), "w") as lock:
        deadline = time.monotonic() + 30
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > deadline:
                    reply("503 Service Unavailable", {"error": "lean is busy"})
                time.sleep(0.2)
        if os.path.exists(cached):
            with open(cached, encoding="utf-8") as f:
                reply("200 OK", {**json.load(f), "cached": True})
        result = run_lean(body)
        result["version"] = version()
        if result["ok"] or all(e["msg"] != "timeout" for e in result["errors"]):
            tmp = cached + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(result, f)
            os.replace(tmp, cached)
    result["cached"] = False
    reply("200 OK", result)


main()
