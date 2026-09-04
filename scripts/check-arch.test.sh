#!/usr/bin/env bash
# 反向验证:故意造几个违规文件,确认检查脚本真的会拦。
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p src/tools src/lib
cat > src/tools/__bad.js <<'EOF'
import other from '../tools/timestamp.js';
import { copy } from '../core/platform.js';
const x = fetch('https://example.com');
EOF
cat > src/lib/__bad.js <<'EOF'
export const w = window.innerWidth;
EOF
cp index.html /tmp/__index.bak
printf '<script>console.log(1)</script>\n' >> index.html

out=$(bash ./scripts/check-arch.sh); code=$?
rm -f src/tools/__bad.js src/lib/__bad.js
cp /tmp/__index.bak index.html && rm -f /tmp/__index.bak
n=$(grep -c '✗' <<< "$out")
if [ $code -ne 0 ] && [ "$n" -ge 5 ]; then echo "自检通过:拦到 $n 处违规"; else echo "自检失败"; echo "$out"; exit 1; fi
