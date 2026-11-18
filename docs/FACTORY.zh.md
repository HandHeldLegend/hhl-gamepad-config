# 工厂测试站

[English](FACTORY.md) | 中文

HHL Gamepad Config 应用中供产线使用的全屏页面。它为每台手柄烧录或更新固件、检查硬件、完成校准、测试所有输入，
并逐台记录“通过 / 不通过”。

## 设置测试站电脑

1. 安装 **Google Chrome** 或 **Microsoft Edge**。
2. 下载设置脚本：
   [**hhl-factory-setup.zip**](https://handheldlegend.github.io/hoja3/docs/factory/hhl-factory-setup.zip)，
   并先解压（不要直接在压缩包里运行文件）。
3. 以管理员身份运行一次脚本（见[设置脚本](#设置脚本chrome-和-edge)）。
4. 关闭所有浏览器窗口，重新打开浏览器，并把本产线的测试站地址加入书签（见[打开页面](#打开页面)）。
5. 在电脑联网时打开一次测试站页面，让产线的固件下载并缓存好。

## 打开页面

```
https://handheldlegend.github.io/hoja3/?lang=zh#/factory?build=gcu_2,gcu_2s      （中文）
https://handheldlegend.github.io/hoja3/#/factory?build=gcu_2,gcu_2s
```

| 参数 | 含义 |
|---|---|
| `build` | 产线的型号：构建 ID，用逗号分隔（例如 `gcu_2,gcu_2s`）。每台产品都单独识别，所以混线生产也可以：已运行 HOJA 的手柄按它自己报告的构建来识别（必须是列表中的型号，并更新到该构建的最新固件）；处于引导模式的空白主板由操作员在产线有多个型号时选择型号。每个型号的固件只下载一次并缓存。不填则接受所有型号（此时空白主板会询问是哪个型号）。 |
| `skip` | 要跳过的步骤，用逗号分隔：`flash`（烧录）、`calibrate`（校准）、`inputs`（输入测试）、`operator`（人工检查）。 |
| `triggers` | 仅用于可以装配机械扳机的手柄（GCU 1）：产线的扳机配置，`analog`（模拟）、`mechanical`（机械）、`left` 或 `right`（仅该侧为机械）。不填时，操作员在第一台上选择一次，之后的产品沿用。 |
| `lang` | `zh`、`en`、`es`、`ja` 或 `fr`。它要写在 `#` 之前，如上面第一个地址。也可以在测试站页面顶部切换语言。 |

这个页面不在应用的菜单里。请在每台测试站电脑上把地址加入书签。

## 每台产品的流程

1. **插入。** 已运行 HOJA 的手柄按其构建识别，固件较旧时更新到该构建的最新固件。处于引导模式（BOOTSEL）的空白主板
   会烧录操作员选择的型号（或产线唯一的型号）。运行旧固件（HOJA2 之前）的手柄会被重启进入更新模式，并装上其型号的
   当前固件。构建不属于产线型号的产品会判为不通过并说明原因；绝不会给它烧录其他型号的固件。
2. **自检**（自动）：设置存储、充电芯片（PMIC）、电池组、电量计、无线模块及其固件。该构建没有的部件显示为“未安装”，
   不计入结果。没有正常工作的无线模块的 GCU 2 会在“固件与硬件匹配”一项不通过：它可能是运行着 GCU 2 固件的其他型号。
3. **Switch 颜色：** 设置 Switch 上显示的手柄颜色（外壳、按键、左握把、右握把）。GC Ultimate 2 和 2S 需确认颜色
   SKU（与上一台相同时只需点一下）。其他型号是定制外壳：选择四种颜色（从该产品自身的颜色开始），或点选最近用过的
   颜色组合。保存后会再次核对，并逐台记录。
4. **校准摇杆**（与“摇杆”页面相同的对话框）。
5. **扳机类型**（仅限可装机械扳机的手柄，GCU 1）：每个扳机按五次。手柄自己判断的结果（机械或模拟）必须与产线的
   扳机配置一致。
6. **校准模拟扳机**（与“输入”页面相同）。对于按到底还会“咔嗒”一下的 GameCube 式扳机，之后还有一项检查：
   每个扳机必须在压到胶垫时读数已满，然后才触发按键。
7. **输入测试：** 按下每个按键，把每个扳机按到底，把每个摇杆向各个方向推到边缘，并转动手柄，让陀螺仪和加速度计的
   每个轴都有数据。
8. **人工检查：** 后壳上的 FCC ID 标签（GCU 2：页面会显示该产品报告的 FCC ID 供对照）、振动和 LED，用
   “通过 / 不通过”判定。
9. **保存，** 然后显示结果：大大的“通过”或“不通过”。拔下手柄，换下一台。

页面顶部统计本班次的测试数量和通过数量。**下载 CSV** 保存记录：产品序号、时间、名称、构建、固件、MAC 地址、是否更新过、
颜色 SKU、颜色、每一项检查（包括 FCC 标签）、总结果和备注。记录保存在该浏览器中，直到点击**清空记录**，
所以请在每个班次结束时下载。

## 免点击连接（推荐）

Chrome 和 Edge 对每个物理 USB 设备都要询问一次权限，所以每台新产品都需要点一下。在测试站电脑上，可以用浏览器策略
为本网站预先授权 HOJA 手柄以及 RP2040 / RP2350 引导程序。这样产品一插上就会自动连接并烧录。

### 设置脚本（Chrome 和 Edge）

下载 [**hhl-factory-setup.zip**](https://handheldlegend.github.io/hoja3/docs/factory/hhl-factory-setup.zip)
（相同的文件也在 [docs/factory](https://github.com/HandHeldLegend/hhl-gamepad-config/tree/main/docs/factory)）
并解压。脚本的提示信息为中英文双语。

- **Windows：** 双击 `setup-windows.bat` 并允许管理员权限。如果 Windows 显示“Windows 已保护你的电脑”，
  点击**更多信息**，再点击**仍要运行**。脚本会为 Google Chrome 和 Microsoft Edge 设置策略，并安装空白 RP2040
  主板所需的驱动（见下一节）。全部撤销：`setup-windows.bat -Remove`。只设置策略、不装驱动：
  `setup-windows.bat -NoDriver`。
- **Linux：** `sudo bash setup-linux.sh` 会为 Chrome、Chromium 和 Edge 设置策略并安装 udev 规则。
  撤销策略：`sudo bash setup-linux.sh --remove`。Linux 不需要驱动。

然后关闭所有浏览器窗口，重新打开，并在 `chrome://policy` 或 `edge://policy` 中确认。

### 空白 RP2040 主板的 Windows 驱动

处于引导模式的空白 RP2040 主板显示为“RP2 Boot”。Windows 自身没有它的烧录接口的驱动，所以浏览器无法直接写入。
`setup-windows.bat` 会安装驱动：把 Windows 自带的 WinUSB 驱动指定给这个接口（`USB\VID_2E8A&PID_0003&MI_01`）。

- Windows 只安装来自受信任发布者的驱动。脚本会在这台电脑上生成一个证书，用它给驱动的小描述文件签名，并立即删除
  证书的私钥，所以它无法再用来签名其他任何东西。`-Remove` 会把驱动和证书一并移除。
- **以下情况不需要：** RP2350 主板（“RP2350 Boot”）和已运行 HOJA 的手柄，Windows 会自行处理；Linux 和 macOS。
- **没有这个驱动**时测试站仍可使用：每遇到一块空白 RP2040 主板，它会让操作员点击**选择驱动器**并选中主板的驱动器
  （RPI-RP2），然后把固件复制到该驱动器上。
- 也可以手动安装：使用 [Zadig](https://zadig.akeo.ie)，插上一块空白主板，选择“RP2 Boot (Interface 1)”并安装
  WinUSB。

### 手动设置

脚本设置的就是下面这条策略，你也可以自己设置。

策略 `WebUsbAllowDevicesForUrls`（数值为十进制）：

```json
[
  {
    "devices": [
      { "vendor_id": 11914, "product_id": 4294 },
      { "vendor_id": 11914, "product_id": 4317 },
      { "vendor_id": 11914, "product_id": 4319 },
      { "vendor_id": 11914, "product_id": 3 },
      { "vendor_id": 11914, "product_id": 15 },
      { "vendor_id": 1406, "product_id": 8201 }
    ],
    "urls": ["https://handheldlegend.github.io"]
  }
]
```

（0x2E8A = 11914：HOJA 手柄 0x10C6 / 0x10DD / 0x10DF 以及引导程序 0x0003 / 0x000F；
0x057E:0x2009 = 1406:8201，Switch 模式。）

- **Windows：** 注册表值 `WebUsbAllowDevicesForUrls`（REG_SZ，内容为上面的 JSON，写成一行），位于
  `HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome`；Edge 则位于 `...\Policies\Microsoft\Edge`。
- **Linux：** 把 `{"WebUsbAllowDevicesForUrls": [ ...上面的列表... ]}` 保存为 `hhl-factory.json`，放在
  `/etc/opt/chrome/policies/managed/`（Chromium：`/etc/chromium/...`，Edge：`/etc/opt/edge/...`）。
  Linux 还需要应用中“帮助与关于 → Linux 配置”里的 udev 规则。

## 开发者和改装者

测试站也可以用来快速检测任何 HOJA 手柄（ProGCC、Super Gamepad+ 等）：

```
https://handheldlegend.github.io/hoja3/#/factory
https://handheldlegend.github.io/hoja3/#/factory?build=progcc_3s
```

不填 `build` 时接受所有型号，每台产品更新到其自身构建的最新固件；空白主板会询问要安装哪个型号。运行旧固件
（HOJA2 之前）的手柄会被重启进入更新模式，并装上其型号的当前固件。没有浏览器策略时，每块主板需要点一次
“连接”或“授权”。

## 颜色 SKU

iFixit Blue、Atomic Purple、Funtastic Orange、Transparent Blue / White、Ghost Black、Indigo / Clear。
它们的颜色值在 `src/sections/factory/skus.js` 中（一张表）；需要检查 FCC 标签的构建也列在那里。

## 注意事项

- 测试站页面只保留一个浏览器标签页。关闭其他会使用手柄的标签页。
- 在出结果之前被拔下的产品记为“不通过”（CSV 备注为 "unplugged before finishing"）。
- 测试站依据固件报告的内容来判定。通过无线模块读取的电量计（GCU 1）只在蓝牙下报告，所以在这里显示为“未安装”。
