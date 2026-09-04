# 更新记录

版本号同时出现在 `src/core/version.js` 和 `android/app/build.gradle`,
两处必须一致,`scripts/check-arch.sh` 会核对。

---

## 0.4

修 0.3 引入的白屏。

`Capacitor 6` 的 `App.addListener` **直接返回 handle**,不返回 Promise。
0.2 里我按更早版本的 API 写了 `.then()`,于是 `start()` 在注册返回处理器
那一步同步抛异常,整个外壳没启动 —— 表现就是所有页面全白。

- `onBack` 同时接受两种返回形态(handle 与 Promise\<handle\>)
- 外壳给 `onBack` 包一层 try:它是可选增强,挂了顶多返回键退化成系统默认,
  不该让整个应用起不来
- `test/back.smoke.mjs` 现在跑三种情形:浏览器、Capacitor 6 同步 handle、
  Capacitor 5 Promise;另加一条「插件直接抛异常时外壳仍要启动」

### 为什么测试没拦住

因为 0.2 的 mock 里我也写的是 Promise 形态 —— 测试验证的是我的错误假设,
不是真实 API。**mock 是自己写的,它不会告诉你假设错了。**
凡是跨端 API,mock 要覆盖所有已知形态,否则测试只是把假设复述一遍。

不过 0.3 的诊断是有效的:手机上直接显示了
`TypeError: App.addListener(...).then is not a function` 和调用栈,
一眼定位。没有那一版,这个问题还得靠连线猜。

---

## 0.3

装成 APK 后工具页空白,但看不到原因 —— 因为 `toolhost.js` 里那个
`catch` 没有绑定异常对象,把原因整个吞了。这一版先解决「看不见」。

- 工具加载失败、运行出错,都把异常原文显示在页面上,可选中复制。
- 全局兜底:未捕获异常和未处理的 Promise 拒绝都渲染到屏幕上。
- **监听 `securitypolicyviolation`**。CSP 挡东西时浏览器不报常规错误,
  只发这个事件;不听它,「被自己的 CSP 挡住」的表现就是一片空白。
  这个坑已经踩过两次(内联脚本、style 属性),不该有第三次。

手机上没有控制台。一个被吞掉的异常表现为空白页只能靠猜,
显示出来就是一句可以截图发出去的话。

新增 `test/errors.smoke.mjs`。

---

## 0.2

装成安卓应用之后暴露的三处「网页习惯」,全部改在布局契约层或外壳层,
以后每加一个工具自动继承,不需要各自再修一遍。

- **返回手势不再直接退出应用**。接管安卓返回键与返回手势:在工具里回首页,
  已经在首页才退出。浏览器分支特意留空 —— hash 路由天然进浏览历史,
  浏览器自己的后退就是对的。
- **界面文字不再能长按选中**。长按按钮跳出「复制/全选」菜单加一对蓝色手柄,
  这是网页习惯。现在默认关掉,只在输入框和 `.u-selectable` 上开回来。
- **点击不再有蓝色高亮层**。原生应用里没有这东西。

打包相关:

- CI 在编译前用 `keytool -list` 校验 keystore,把「base64 不合法」
  「密码不对」「别名不存在」三种情况分别报清楚,不用从 gradle 的
  `Tag number over 30 is not supported` 里猜。
- 自动去掉 base64 里的换行,以及 `certutil -encode` 会加的 BEGIN/END 头尾。

新增回归测试 `test/back.smoke.mjs`,三条断言守住返回行为。

### 一个记下来的坑

给浏览器也加 popstate 兜底是错的,测试当场抓到:浏览器里
`location.hash = x` 会**同时**触发 `hashchange` 和 `popstate`,
于是每次进工具都被自己的返回处理器立刻弹回首页。
给不需要的平台加机关,反而制造问题。

---

## 0.1

第一版骨架,加四个工具。

**外壳**

- `registry.js` 只存元数据,实现藏在动态 `import()` 后面 ——
  搜索不加载任何工具就能工作,冷启动只拉外壳。
- `shapes.js` 提供 `text->text` 标准形态,多数工具因此退化成一个纯函数,
  输入框、粘贴、复制、错误显示、空态全由外壳提供。
- 工具能拿到的东西限死在 `ctx` 里:够不着全局状态、别的工具、路由、
  `document.body`,工具之间物理上不可能互相污染。
- `platform.js` 五个跨端函数全返回 Promise,能力用 `can()` 查,
  工具里不会出现 `if (isAndroid)`。
- 首页搜索优先。粘贴一段内容能被工具认领时直接给直达 ——
  粘 `1757000000` 冒出「用时间戳处理这段内容」,点进去结果已经算好。

**工具**

- **调色台** — Kubelka–Munk 颜料混合、光混合、算术平均三模型对比,
  混色结果与原版 `color-mixer.html` 逐位一致。
- **图片取色** — 单击取色、整图主色、取色历史。
- **对比度检查** — WCAG AA / AAA 判定。
- **时间戳** — Unix 时间与日期互转。

原来的 `color-mixer.html` 拆成三个入口共享 `lib/color.js`。拆的理由是
首页搜索优先:人会搜「对比度」、搜「取色」,不会搜「调色台」,
三样挤在一个工具里,另外两样在搜索里是隐身的。

**约束落地**

- 不联网写进 CSP;`AndroidManifest.xml` 用 `tools:node="remove"` 拆掉
  INTERNET 权限;CI 在合并后的 manifest 上核对该权限确实不存在。
- 四条防腐规矩是 `scripts/check-arch.sh`,几行 grep;
  另有反向自检,故意造违规文件确认它真的会拦。

### 两个记下来的坑

- `script-src 'self'` 会挡掉内联脚本,所以启动代码必须是独立的
  `src/main.js`。症状是纯白页,服务器日志里只有 HTML 和 CSS 的请求、
  没有 js 的 —— 日志本身就是诊断依据。
- `style-src` 管 `style=""` 属性,包括 `setAttribute` 设的。
  不放开会让所有工具的布局塌掉,所以它带 `'unsafe-inline'`。
  这不带来任何网络能力。
