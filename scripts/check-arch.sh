#!/usr/bin/env bash
# 防腐规矩的机器执行版。CI 里跑,几行 grep,不引入架构检查工具。
# 注意:先剥掉行注释再匹配,否则规矩的说明文字会被自己抓住。
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
strip() { sed -E 's://.*$::; s:/\*.*\*/::' "$1"; }

# rule <编号> <说明> <正则> <文件...>
rule() {
  local no="$1" desc="$2" re="$3"; shift 3
  echo "[$no] $desc"
  local f hit
  for f in "$@"; do
    [ -f "$f" ] || continue
    hit=$(strip "$f" | grep -nE "$re" || true)
    if [ -n "$hit" ]; then
      while IFS= read -r line; do echo "  ✗ $f:$line"; done <<< "$hit"
      fail=1
    fi
  done
}

shopt -s nullglob
TOOLS=(src/tools/*.js)
SHELL_=(src/shell/*.js)
LIB=(src/lib/*.js)
UI=(src/ui/*.js)
CORE=(src/core/*.js)

rule 1 "tools/ 不许 import 另一个 tools/"        "from '\.{1,2}/tools/" "${TOOLS[@]}"
rule 2 "shell/ 不许直接 import 具体工具"          "tools/"               "${SHELL_[@]}"
rule 3 "lib/ 不许出现 document / window"          "\b(document|window|navigator|localStorage)\b" "${LIB[@]}"
rule 4 "工具与 ui 不许直接 import platform"       "core/platform"        "${TOOLS[@]}" "${UI[@]}"
rule 5 "不联网:不许出现网络 API 与外链"           "fetch\(|XMLHttpRequest|new WebSocket|https?://[a-z]" \
       "${TOOLS[@]}" "${SHELL_[@]}" "${LIB[@]}" "${UI[@]}" "${CORE[@]}" index.html
rule 6 "工具里不许写字面量颜色(用 token)"        "background:\s*#[0-9a-fA-F]{3,6}|color:\s*#[0-9a-fA-F]{3,6}" "${TOOLS[@]}"

echo "[7] index.html 不许有内联脚本(script-src self 会挡掉它,页面会全白)"
inline=$(grep -n '<script' index.html | grep -v 'src=' || true)
if [ -n "$inline" ]; then
  while IFS= read -r line; do echo "  ✗ index.html:$line"; done <<< "$inline"
  fail=1
fi

echo "[8] 单文件超过 300 行就停下来想"
for f in "${TOOLS[@]}"; do
  n=$(wc -l < "$f")
  [ "$n" -gt 300 ] && echo "  ! $f 有 $n 行 —— 多半是两个工具,或有段逻辑该下沉到 lib/"
done

if [ $fail -eq 0 ]; then echo; echo "架构检查通过"; else echo; echo "架构检查未通过"; fi
exit $fail
