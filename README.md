# 足用

版本变更见 [CHANGELOG.md](CHANGELOG.md)。

纯本地工具箱。不卡顿、便捷、不联网。

## 跑起来

在项目根目录(有 `index.html` 那一层)开一个终端:

    py -m http.server 8080        # Windows
    python3 -m http.server 8080   # macOS / Linux

然后浏览器打开 **`http://localhost:8080/`**。终端窗口保持开着。

- 设备沙盘:`http://localhost:8080/src/dev/sandbox.html`
- 想在手机上试而不打包:`py -m http.server 8080 --bind 0.0.0.0`,
  查电脑内网 IP(`ipconfig`),手机连同一个 Wi-Fi 打开 `http://那个IP:8080/`。
  零成本,改一行刷新就能看到。

⚠️ 不能双击 `index.html`。`file://` 下动态 `import()` 会被 CORS 拦掉,
页面会显示一段「没有启动起来」的说明 —— 看见它就是走错了协议。

检查:

    node --test "test/**/*.test.mjs"   # 纯函数逻辑
    ./scripts/check-arch.sh            # 四条防腐规矩
    ./scripts/check-arch.test.sh       # 确认上面那条真的会拦

---

## 加一个工具

两步,没有第三步。

**一、** 新建 `src/tools/你的id.js`。

多数工具是文本进文本出,那就只写一个纯函数,输入框、粘贴、复制、
错误显示全部由外壳提供:

```js
export default {
  shape: 'text->text',
  placeholder: '粘一段 JSON',
  run(input) { return JSON.stringify(JSON.parse(input), null, 2); }
};
```

需要实时预览或非文本输入的,写 `mount`,照抄 `tools/contrast.js`:

```js
export default {
  mount(root, ctx) {
    // ctx.storage    只能读写属于本工具的键
    // ctx.platform   copy / readClipboard / pickFile / saveFile / share / can
    // ctx.toast      提示
    // ctx.back       回首页
    // ctx.initial    首页粘贴内容直达时带进来的原文,可能为 null
    return () => { /* 卸载时清理定时器和监听 */ };
  }
};
```

**二、** 在 `src/core/registry.js` 数组里加一条。

```js
{
  id: 'json',
  name: 'JSON 格式化',
  desc: '折行缩进与压缩',
  keywords: ['json', '格式化', '美化', '压缩', '解析'],
  sniff: (s) => (/^\s*[{[]/.test(s) ? 0.9 : 0),
  load: () => import('../tools/json.js'),
}
```

`sniff` 可选,但值得写:它让用户在首页粘贴一段内容就直接跳到你的工具。
这是分类网格结构上做不到的事。要求是纯函数、极快、无副作用。

---

## 为什么是这个形状

| 决定 | 换来什么 |
|---|---|
| registry 只存元数据,实现藏在 `load()` 后面 | 搜索不加载任何工具就能工作,冷启动只拉外壳 |
| `shapes.js` 提供标准形态 | 大半工具退化成三十行纯函数,且所有工具的复制按钮长在同一个位置 |
| 工具只能拿到 `ctx` 里那几样 | 够不着全局状态、别的工具、路由、`document.body`,物理上不可能互相污染 |
| `platform.js` 五个函数全返回 Promise,能力用 `can()` 查 | 工具里不会出现 `if (isAndroid)`,换外壳只改一个文件 |
| `styles/` 是布局契约,工具渲染在它里面 | 不给写死尺寸的机会,安卓适配那张表在源头解决 |
| 不联网写进 CSP 和 grep | 承诺变成物理不可能,手滑引个 CDN 只会当场白屏,不会悄悄发出去 |

### CSP 的两个坑(都踩过了)

`index.html` 里那份 CSP 会挡掉两样自己人,踩过一次值得记住:

1. **`script-src 'self'` 挡内联脚本。** 所以启动代码必须是独立的 `src/main.js`,
   不能内联写在 `index.html` 里。症状是纯白页,服务器日志里只有 HTML 和 CSS 的
   请求、没有 js 的 —— 日志本身就是诊断依据。`check-arch.sh` 第 7 条守这个。
2. **`style-src` 管 `style=""` 属性**,包括 `setAttribute('style', ...)` 设的。
   所以它带 `'unsafe-inline'`。这不带来任何网络能力 ——「不联网」的保证在
   `default-src` 和 `connect-src 'none'` 上,以及安卓不声明 INTERNET 权限。

打包时安卓侧的 `AndroidManifest.xml` 不声明 `INTERNET` 权限 —— 装完在系统
权限里一看就是空的,这是唯一一张用户能当场验证的牌。

---

## 打 APK

### 用 GitHub Actions(推荐)

每次 push 自动出包,也可以在 Actions 页面手动 Run workflow。
产物在 Artifacts 里的 `zuyong-apk`。

**首次要先配四个 Secret**(Settings → Secrets and variables → Actions):

    KEYSTORE_BASE64      keystore 文件的 base64,一整行
    KEYSTORE_PASSWORD
    KEY_ALIAS
    KEY_PASSWORD

生成 base64,PowerShell 里:

    [Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\路径\你的.keystore")) | Set-Clipboard

**不要用 `certutil -encode`**,它会加 `-----BEGIN CERTIFICATE-----` 头尾,
解码出来不是合法 keystore,gradle 会报 `Tag number over 30 is not supported`
—— 那是 ASN.1 解析失败,意思是文件内容不对,不是密码错。
(流水线现在会自动剥掉这类头尾,但一开始就转对更省事。)

没有现成 keystore 就新建一个,足用 跟「记问」不必共用:

    keytool -genkeypair -v -keystore zuyong.keystore -alias zuyong \
      -keyalg RSA -keysize 2048 -validity 10000

流水线在编译前会先把 keystore 解出来用 `keytool -list` 验一遍,
base64 坏了、密码不对、别名不存在,三种情况分别报清楚,不用从 gradle 的报错里猜。

**为什么非要固定签名**:不配的话每次 CI 出的 debug 包签名都不同,
装第二次要先卸载,`localStorage` 里的取色历史、最近使用、调色台状态全丢。
配了就能直接覆盖升级。

流水线出包前会跑纯函数测试、架构检查、外壳冒烟,不合格就不出包。
出包后还会**在合并后的 manifest 上核对没有 INTERNET 权限** ——
「不联网」不能只是一句注释,得在最终产物上验。

### 本地打

要装 Android SDK 和 JDK 21:

    npm run apk
    # 产物在 android/app/build/outputs/apk/debug/

---

## 关于「不联网」在安卓上怎么落实

`AndroidManifest.xml` 里那一行不是声明,是**删除**:

    <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />

Capacitor 的 AAR 自己带了 INTERNET 权限,manifest 合并时会塞回来,
`tools:node="remove"` 把它拆掉。装完在系统「权限」里一看是空的 ——
这是唯一一张用户能当场验证的牌。

Capacitor 通过 WebViewAssetLoader 从 apk 内部读资源,走本地拦截,不需要网络权限。

**万一装上是白屏**,按这个顺序查:

1. 数据线连手机,电脑 Chrome 开 `chrome://inspect`,页面跑在真机 WebView 里,
   DevTools 完整可用,Console 里有确切原因
2. 如果 Console 说被 CSP 拦了,看 `index.html` 里那段注释 —— 两个坑都记在那儿了
3. 如果怀疑是没有 INTERNET 权限导致的,临时把 manifest 那行的 `tools:node="remove"`
   删掉再打一次包对比。**如果真是这个原因,那要重新想「不联网」这条怎么落地,
   而不是默默把权限加回去** —— 这条是产品的根,不是实现细节

---

## 目录

    index.html                入口。CSP 在这里焊死「不联网」
    src/
      shell/   app.js router.js home.js search.js toolhost.js
      core/    registry.js platform.js storage.js shapes.js
      styles/  reset.css theme.css layout.css        ← 布局契约
      ui/      index.js  imagePicker.js   共用 DOM 组件(无业务、无平台)
      lib/     time.js color.js 纯函数,无 DOM
      tools/   color-mixer.js color-picker.js
               timestamp.js contrast.js
      dev/     sandbox.html     设备沙盘,六种尺寸并排
    test/      lib.test.mjs  shell.smoke.mjs  cleanup.smoke.mjs
    scripts/   check-arch.sh  check-arch.test.sh  build-www.mjs
    android/   Capacitor 安卓工程(图标、启动图、无权限 manifest 都已配好)
    www/       打包中间产物,由 scripts/build-www.mjs 生成,不进版本库

`timestamp` 演示标准形态(只写一个纯函数),`contrast` 演示自定义 mount。
照着这两个往里塞就行。

---

## 已接入的工具

| 工具 | 形态 | 说明 |
|---|---|---|
| 时间戳 | `text->text` | 样板。整个文件没有一行 DOM |
| 调色台 | `mount` | Kubelka–Munk 颜料混合 + 光混合 + 算术平均三模型对比 |
| 图片取色 | `mount` | 单击取色、整图主色、取色历史 |
| 对比度检查 | `mount` | 样板。WCAG AA / AAA 判定 |

原来的 `color-mixer.html` 拆成了三个入口,共享 `lib/color.js`。
拆的理由是首页搜索优先:人会搜「对比度」、搜「取色」,不会搜「调色台」;
三样挤在一个工具里,另外两样在搜索里是隐身的。

图片取色区做成了 `ui/imagePicker.js`,调色台和图片取色共用同一份 ——
这正是 `ui/` 这层存在的理由(`tools/` 之间不许互相 import)。
