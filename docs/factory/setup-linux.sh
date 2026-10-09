#!/usr/bin/env bash
# HHL factory station setup for Linux (Google Chrome, Chromium, Microsoft Edge).
# HHL 工厂测试站设置（Linux，适用于 Google Chrome、Chromium、Microsoft Edge）
#
# 1. Browser policy WebUsbAllowDevicesForUrls: the factory station page connects to HOJA controllers
#    and their bootloaders without a permission prompt for every unit.
#    浏览器策略：工厂测试站页面可直接连接 HOJA 手柄及其引导程序，无需每台都点击授权。
# 2. udev rule: lets the browser open those USB devices (the same rule as the app's Linux setup).
#    udev 规则：允许浏览器访问这些 USB 设备（与应用中“Linux 设置”的规则相同）。
#
#   sudo bash setup-linux.sh            install / 安装
#   sudo bash setup-linux.sh --remove   remove  / 移除
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0 $*"
  echo "请用 sudo 运行：sudo bash $0 $*"
  exit 1
fi

POLICY_FILE=hhl-factory.json
POLICY_DIRS=(/etc/opt/chrome/policies/managed /etc/chromium/policies/managed /etc/opt/edge/policies/managed)
RULES=/etc/udev/rules.d/70-hhl-gamepad.rules

if [[ "${1:-}" == "--remove" ]]; then
  for d in "${POLICY_DIRS[@]}"; do rm -f "$d/$POLICY_FILE"; done
  echo "Browser policy removed. / 浏览器策略已移除。"
  echo "The udev rule ($RULES) was kept: the config app uses it too. / udev 规则已保留（配置应用也需要它）。"
  exit 0
fi

# HOJA controllers 2E8A:10C6/10DD/10DF, RP2040/RP2350 bootloaders 2E8A:0003/000F, Switch mode 057E:2009 (decimal).
POLICY='{"WebUsbAllowDevicesForUrls":[{"devices":[{"vendor_id":11914,"product_id":4294},{"vendor_id":11914,"product_id":4317},{"vendor_id":11914,"product_id":4319},{"vendor_id":11914,"product_id":3},{"vendor_id":11914,"product_id":15},{"vendor_id":1406,"product_id":8201}],"urls":["https://handheldlegend.github.io"]}]}'

for d in "${POLICY_DIRS[@]}"; do
  mkdir -p "$d"
  printf '%s\n' "$POLICY" > "$d/$POLICY_FILE"
  chmod 644 "$d/$POLICY_FILE"
done
echo "Browser policy set (Chrome, Chromium, Edge). / 浏览器策略已设置（Chrome、Chromium、Edge）。"

cat > "$RULES" <<'EOF'
# HHL / HOJA gamepads: browser config app (WebUSB) and gamepad modes in games (hidraw).
# https://handheldlegend.github.io/hoja3/
# Config app over WebUSB: Switch Pro mode, Steam (SInput) modes, RP2040/RP2350 bootloaders
SUBSYSTEM=="usb", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="2009", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="10c6|10dd|10df|0003|000f", TAG+="uaccess"
# Gamepad modes in games and Steam (SDL reads these through hidraw)
KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="10c6|10dd|10df", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="2009", TAG+="uaccess"
# Wireless module (ESP32) updates over WebUSB: the CH340 USB serial chip
SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7522", TAG+="uaccess"
EOF
udevadm control --reload-rules && udevadm trigger
echo "udev rule installed: $RULES / udev 规则已安装：$RULES"

echo
echo "Done. Close every browser window and open it again, then check chrome://policy (or edge://policy)."
echo "完成。请关闭所有浏览器窗口后重新打开，并在 chrome://policy（或 edge://policy）中确认策略已生效。"
