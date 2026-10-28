// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { patchFclInput } = require('./moteur/patch-compat.cjs');
const shellTransforms = require('./moteur/patch-shell.cjs');

const root = path.resolve(process.argv[2] || '');
const pin = require('./upstream.json');
// Public client configuration; desktop compatibility uses the PC library's default.
const microsoft = require('./microsoft.json');
if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16})$/i.test(microsoft.clientId)) {
  throw new Error('Identifiant public Microsoft du launcher invalide.');
}
const androidVersion = require('./version.json');
const version = androidVersion.version;
const parts = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?/.exec(version);
if (!parts) throw new Error('Version du launcher invalide.');
const [major, minor, patchVersion, build = 0] = parts.slice(1).map(value => Number(value || 0));
if ([minor, patchVersion, build].some(value => value >= 100)) throw new Error('Version trop grande pour le code Android.');
const versionCode = androidVersion.versionCode;
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) throw new Error('Code de version Android hors limites.');
if (!/^\d+\.\d+\.\d+(?:-\d+)?(?:-(?:alpha|beta|rc)\.\d+)?-A$/.test(version)) throw new Error('Version de la série Android invalide (exemple : 1.0.0-A).');
if (!process.argv[2]) throw new Error('Indiquez le dossier source FCL.');
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== pin.commit) throw new Error('Révision FCL différente de la révision verrouillée.');
const controlsCompanions = ['yapapouaiye-controls-26.2.jar', 'yapapouaiye-controls-1.21.1.jar'];
const controlsCompanionDirectory = path.join(__dirname, 'companion/dist');
for (const file of controlsCompanions) {
  const artifact = path.join(controlsCompanionDirectory, file);
  if (!fs.existsSync(artifact) || !fs.statSync(artifact).isFile()) {
    throw new Error(`Compagnon de commandes absent : ${file}. Compilez-le avec Android/build-companion.ps1 avant de préparer l’APK.`);
  }
}

// Always start from the pinned upstream file; repeat builds do not stack patches.
function patch(relative, transform) {
  const original = execFileSync('git', ['-C', root, 'show', `${pin.commit}:${relative}`], { encoding: 'utf8', maxBuffer: 8e6 });
  fs.writeFileSync(path.join(root, relative), transform(original));
}
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Point d’intégration absent ou ambigu : ${before}`);
  return text.replace(before, after);
}
patch('FCL/build.gradle.kts', text => {
  text = replaceOnce(text, 'val oauthApiKey = System.getenv("OAUTH_API_KEY") ?: localProperty?.getProperty("oauth.api.key")', `val oauthApiKey = System.getenv("OAUTH_API_KEY") ?: localProperty?.getProperty("oauth.api.key") ?: ${JSON.stringify(microsoft.clientId)}`);
  text = replaceOnce(text, 'applicationId = "com.tungsten.fcl"', 'applicationId = "fr.yapapouaiye.launcher.android"');
  text = replaceOnce(text, 'versionName = "1.3.4.0"', `versionName = ${JSON.stringify(version)}`);
  text = replaceOnce(text, 'versionCode = 1340', `versionCode = ${versionCode}`);
  text = replaceOnce(text, 'signingConfig = signingConfigs.getByName("FCLDebugKey")', 'signingConfig = signingConfigs.getByName("debug")');
  text = replaceOnce(text, 'resValue("string", "file_browser_provider", "com.tungsten.fcl.debug.provider")', 'resValue("string", "file_browser_provider", "fr.yapapouaiye.launcher.android.debug.provider")');
  text = replaceOnce(text, 'implementation(libs.commons.io)', 'implementation("androidx.webkit:webkit:1.12.1")\n    implementation(libs.commons.io)');
  text = replaceOnce(text, 'implementation(libs.commons.io)', 'implementation(project(":YapapouaiyeEngine"))\n    implementation(libs.commons.io)');
  text = replaceOnce(text, '    testBuildType = "fordebug"', '    defaultConfig.testInstrumentationRunner = "fr.yapapouaiye.moteur.test.ControlsInstrumentation"\n    testBuildType = "fordebug"');
  return text;
});
patch('settings.gradle.kts', text => text + '\ninclude(":YapapouaiyeEngine")\n');
for (const [relative, transform] of Object.entries(shellTransforms)) patch(relative, text => transform(text, replaceOnce));
patch('FCL/src/main/java/com/tungsten/fcl/activity/MainActivity.kt', text => {
  text = replaceOnce(text, '    lateinit var binding: ActivityMainBinding', '    var yapapouaiyeHome: YapapouaiyeHome? = null\n    lateinit var binding: ActivityMainBinding');
  const start = text.indexOf('                playAnim()');
  const end = text.indexOf('\n            }\n        }\n        permissionResultLauncher =', start);
  if (start < 0 || end < start) throw new Error('Bloc d’accueil FCL introuvable.');
  text = text.slice(0, start) + '                yapapouaiyeHome = YapapouaiyeHome(this@MainActivity)' + text.slice(end);
  text = replaceOnce(text, '        setContentView(binding.root)', '        setContentView(binding.root)\n        val loadingCover = android.widget.TextView(this).apply {\n            text = "YAPAPOUAIYE\\nOuverture du launcher…"\n            gravity = android.view.Gravity.CENTER\n            setTextColor(android.graphics.Color.rgb(66, 224, 113))\n            setTextSize(20f)\n            setBackgroundColor(android.graphics.Color.rgb(11, 17, 23))\n        }\n        addContentView(loadingCover, android.view.ViewGroup.LayoutParams(-1, -1))');
  for (const name of ['Resume', 'Pause']) text = replaceOnce(text, `        super.on${name}()\n`, `        super.on${name}()\n        yapapouaiyeHome?.on${name}()\n`);
  text = replaceOnce(text, '        super.onDestroy()\n', '        yapapouaiyeHome?.destroy()\n        yapapouaiyeHome = null\n        super.onDestroy()\n');
  text = replaceOnce(text, '        if (keyCode == KeyEvent.KEYCODE_BACK) {', '        if (keyCode == KeyEvent.KEYCODE_BACK && yapapouaiyeHome != null) {\n            if (yapapouaiyeHome?.onBack() != true) finish()\n            return true\n        }\n        if (keyCode == KeyEvent.KEYCODE_BACK) {');
  return replaceOnce(text, '        setupLiveBackground()', '        // The Yapapouaiye home owns its background.');
});
patch('FCL/src/main/java/com/tungsten/fcl/game/FCLGameRepository.java', text => text);
patch('FCL/src/main/java/com/tungsten/fcl/control/FCLInput.java', text => patchFclInput(text, replaceOnce));
patch('FCL/src/main/java/com/tungsten/fcl/game/OAuthServer.java', text => {
  text = replaceOnce(text, 'return FCLApp.getAppContext().getString(R.string.oauth_api_key);', 'return fr.yapapouaiye.moteur.android.MicrosoftSettings.clientId(FCLApp.getAppContext());');
  text = replaceOnce(text, '        public OAuth.Session startServer() throws IOException, AuthenticationException {', '        public OAuth.Session startServer() throws IOException, AuthenticationException {\n            if (com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.compatible(getClientId())) return com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.start();');
  return replaceOnce(text, '            lastlyOpenedURL = url;', '            if (com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.compatible(getClientId())) url = com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.authorizationUrl(url);\n            lastlyOpenedURL = url;');
});
patch('FCL/src/main/java/com/tungsten/fclcore/auth/OAuth.java', text => {
  text = replaceOnce(text, '            options.callback.loginCompletedDeviceCode();', '            handleErrorResponse(tokenResponse);\n            options.callback.loginCompletedDeviceCode();');
  text = replaceOnce(text, '        } catch (ExecutionException e) {', '        } catch (ExecutionException e) {\n            if (e.getCause() instanceof AuthenticationException) throw (AuthenticationException) e.getCause();');
  return replaceOnce(text, 'RefreshResponse response = HttpRequest.POST(tokenURL)', 'RefreshResponse response = HttpRequest.POST(com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.compatible(options.callback.getClientId()) ? accessTokenURL : tokenURL)');
});
patch('FCL/src/main/java/com/tungsten/fclcore/auth/microsoft/MicrosoftService.java', text => replaceOnce(text,
  'OAuth.MICROSOFT.authenticate(OAuth.GrantFlow.DEVICE,',
  'OAuth.MICROSOFT.authenticate(com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.compatible(callback.getClientId()) ? OAuth.GrantFlow.AUTHORIZATION_CODE : OAuth.GrantFlow.DEVICE,'));
patch('FCL/src/main/java/com/tungsten/fcl/ui/account/CreateAccountDialog.kt', text => replaceOnce(text,
  '        if (useExternalBrowser) {',
  '        if (useExternalBrowser && !com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.compatible(Accounts.OAUTH_CALLBACK.clientId)) {'));
patch('FCL/src/main/java/com/tungsten/fcl/ui/account/OAuthAccountLoginDialog.java', text => replaceOnce(text,
  '        if (useExternalBrowser) {',
  '        if (useExternalBrowser && !com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.compatible(Accounts.OAUTH_CALLBACK.getClientId())) {'));
patch('FCL/src/main/java/com/tungsten/fcl/activity/WebActivity.java', text => {
  text = replaceOnce(text, '        settings.setJavaScriptEnabled(true);', '        settings.setJavaScriptEnabled(true);\n        settings.setDomStorageEnabled(true);\n        settings.setAllowFileAccess(false);\n        settings.setAllowContentAccess(false);\n        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);');
  text = replaceOnce(text, '    class WebViewTrackClient extends WebViewClient {', `    private boolean handleDesktopCallback(String url) {
        if (!com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.completeCallback(url)) return false;
        webView.stopLoading();
        finish();
        return true;
    }

    class WebViewTrackClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleDesktopCallback(url) || super.shouldOverrideUrlLoading(view, url);
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
            return (request.isForMainFrame() && handleDesktopCallback(request.getUrl().toString())) || super.shouldOverrideUrlLoading(view, request);
        }`);
  text = replaceOnce(text, '            progressBar.setVisibility(View.VISIBLE);', '            if (handleDesktopCallback(url)) return;\n            progressBar.setVisibility(View.VISIBLE);');
  return replaceOnce(text, '        super.onDestroy();', '        com.tungsten.fcl.yapapouaiye.DesktopMicrosoftSession.cancelForAuthorizationUrl(getIntent().getStringExtra("url"));\n        if (webView != null) { webView.stopLoading(); webView.destroy(); }\n        super.onDestroy();');
});
patch('FCL/src/main/java/com/tungsten/fclcore/util/io/HttpRequest.java', text => replaceOnce(text,
  '            } catch (Throwable e) {\n                exception = e;',
  '            } catch (Throwable e) {\n                if (e instanceof ResponseCodeException) {\n                    int status = ((ResponseCodeException) e).getResponseCode();\n                    if (status == 401 || status == 403 || status == 429) throw (ResponseCodeException) e;\n                }\n                exception = e;'));
patch('FCL/src/main/java/com/tungsten/fcl/setting/Accounts.java', text => replaceOnce(text,
  '    public static String localizeErrorMessage(Context context, Exception exception) {',
  '    public static String localizeErrorMessage(Context context, Exception exception) {\n        String diagnostic = com.tungsten.fcl.yapapouaiye.AuthenticationErrors.message(exception);\n        if (diagnostic != null) return diagnostic;'));
patch('FCL/src/main/java/com/tungsten/fclauncher/keycodes/LwjglKeycodeMap.java', text => replaceOnce(text,'    static {',`    static {
        add(LwjglGlfwKeycode.KEY_SCROLL_LOCK, FCLKeycodes.KEY_SCROLLLOCK);
        add(LwjglGlfwKeycode.KEY_PRINT_SCREEN, FCLKeycodes.KEY_SYSRQ);
        add(LwjglGlfwKeycode.KEY_LEFT_SUPER, FCLKeycodes.KEY_LEFTMATA);
        add(LwjglGlfwKeycode.KEY_RIGHT_SUPER, FCLKeycodes.KEY_RIGHTMETA);`));
patch('FCL/src/main/java/com/tungsten/fcl/control/gamepad/Gamepad.kt', text => replaceOnce(text,'    }\n\n    fun saveMapper()', '        com.tungsten.fcl.yapapouaiye.YapapouaiyeGamepad.configure(this)\n    }\n\n    fun saveMapper()'));
for (const file of ['GamepadEmulatedButton.kt','GamepadButton.kt']) patch('FCL/src/main/java/com/tungsten/fcl/control/gamepad/'+file,text => text.replace(/Gamepad\.getFCLInput\(\)\?\.sendKeyEvent\(it, ([^)]+)\)/g,'com.tungsten.fcl.yapapouaiye.YapapouaiyeGamepad.sendOwned(Gamepad.getFCLInput(), this, it, $1)'));
patch('FCL/src/main/java/com/tungsten/fcl/activity/JVMActivity.java', text => {
  text = replaceOnce(text, 'menuType == MenuType.GAME ? new GameMenu() : new JarExecutorMenu()', 'menuType == MenuType.GAME ? new YapapouaiyeGameMenu() : new JarExecutorMenu()');
  text = replaceOnce(text, '    public boolean dispatchKeyEvent(KeyEvent event) {', `    public boolean dispatchKeyEvent(KeyEvent event) {
        if (menu instanceof YapapouaiyeGameMenu own) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN || event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP)
                return super.dispatchKeyEvent(event);
            if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && !event.isFromSource(android.view.InputDevice.SOURCE_MOUSE) && !own.getTouchCharInput().isEnabled()) {
                if (event.getAction() == KeyEvent.ACTION_UP) own.showYapapouaiyeMenu();
                return true;
            }
        }`);
  return replaceOnce(text, '        super.onWindowFocusChanged(hasFocus);', '        super.onWindowFocusChanged(hasFocus);\n        if (menu instanceof YapapouaiyeGameMenu own) {\n            if (hasFocus) own.onFocusGained(); else own.onFocusLost();\n        }');
});
patch('FCL/src/main/java/com/tungsten/fcl/control/GameMenu.java', text => {
  const hidden = 'activity.getSharedPreferences("yapapouaiye", android.content.Context.MODE_PRIVATE).getBoolean("hideCursor", false)';
  text = replaceOnce(text, '        initCursorView(activity);\n\n        gyroscope', `        initCursorView(activity);\n        if (${hidden}) getCursor().setVisibility(View.GONE);\n\n        gyroscope`);
  text = replaceOnce(text, '        viewManager.setup();', '        if (!(this instanceof com.tungsten.fcl.activity.YapapouaiyeGameMenu)) {\n            viewManager.setup();\n        } else {\n            MenuView placeholder = new MenuView(activity);\n            placeholder.setVisibility(View.GONE);\n            setMenuView(placeholder);\n        }');
  return replaceOnce(text, '                getCursor().setVisibility(View.VISIBLE);',
    `                getCursor().setVisibility(${hidden} ? View.GONE : View.VISIBLE);`);
});
patch('FCL/src/main/assets/controllers/00000000.json', text => {
  const controller = JSON.parse(text);
  controller.name = 'Yapapouaiye · Tactile';
  controller.description = 'Déplacement à gauche, caméra par glissement. Pause : menu Minecraft ; Clavier : saisie de texte.';
  const labels = { '×': 'Frapper', '■': 'Saut', '○': 'Utiliser', '▼': 'Accroupi', E: 'Invent.', Q: 'Jeter', Esc: 'Pause', F3: 'Infos', T: 'Chat', Input: 'Clavier', Enter: 'Entrée', BackSp: 'Effacer' };
  function translate(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string' && labels[node.text]) node.text = labels[node.text];
    for (const child of Object.values(node)) translate(child);
  }
  translate(controller);
  return JSON.stringify(controller, null, 2) + '\n';
});
patch('FCL/src/main/java/com/tungsten/fcl/fragment/RuntimeFragment.kt', text =>
  replaceOnce(text, '            refreshDrawables()\n            check()\n        }\n        return view',
    '            refreshDrawables()\n            check()\n            if (!isLatest) bind.install.performClick()\n        }\n        return view'));
patch('FCL/src/main/java/com/tungsten/fcl/game/LauncherHelper.java', text => {
  text = replaceOnce(text, '                            FCLBridge.initForceResolution(menuSetting);', '                            scaleFactor = new fr.yapapouaiye.moteur.android.ControlSettings(context).resolution() / 100d;\n                            cursorOffset = 0d;\n                            FCLBridge.initForceResolution(null);');
  text = replaceOnce(text, '                launchingStepsPane.dismiss();\n                showLaunchErrorMessage(e);', '                launchingStepsPane.dismiss();\n                notifyYapapouaiye(false, e);\n                showLaunchErrorMessage(e);');
  text = replaceOnce(text, '                    launchingStepsPane.dismiss();\n                    if (!success)', '                    launchingStepsPane.dismiss();\n                    notifyYapapouaiye(success, executor.getException());\n                    if (!success)');
  return replaceOnce(text, '    private void showLaunchErrorMessage(Exception ex) {', '    private void notifyYapapouaiye(boolean success, Throwable error) {\n        if (context instanceof MainActivity main) {\n            main.runOnUiThread(() -> {\n                if (main.getYapapouaiyeHome() != null) main.getYapapouaiyeHome().launchFinished(success, error == null ? null : error.getLocalizedMessage());\n            });\n        }\n    }\n\n    private void showLaunchErrorMessage(Exception ex) {');
});
// This derivative must never offer an official FCL APK as its own update.
patch('FCL/src/main/java/com/tungsten/fcl/upgrade/UpdateChecker.java', text =>
  replaceOnce(text, 'if (!checking.compareAndSet(false, true)) {',
    'if (com.tungsten.fcl.BuildConfig.APPLICATION_ID.startsWith("fr.yapapouaiye.")) {\n            if (showAlert) android.widget.Toast.makeText(context, "Mises à jour : installez le nouvel APK Yapapouaiye Android.", android.widget.Toast.LENGTH_LONG).show();\n            return Task.runAsync(() -> {});\n        }\n        if (!checking.compareAndSet(false, true)) {'));
patch('FCL/src/main/java/com/tungsten/fclauncher/utils/FCLPath.java', text => text.replaceAll('"/FCL/', '"/YapapouaiyeAndroid/'));
patch('FCL/src/main/AndroidManifest.xml', text =>
  text.replaceAll('android:icon="@mipmap/ic_launcher"', 'android:icon="@drawable/yapapouaiye_logo"')
    .replaceAll('android:roundIcon="@mipmap/ic_launcher"', 'android:roundIcon="@drawable/yapapouaiye_logo"')
    .replace(/(<activity\s+android:name="\.activity\.MainActivity"[\s\S]*?)android:screenOrientation="sensorLandscape"/, '$1android:screenOrientation="fullSensor" android:windowSoftInputMode="adjustResize"'));
for (const folder of fs.readdirSync(path.join(root, 'FCL/src/main/res'))) {
  const relative = `FCL/src/main/res/${folder}/strings.xml`;
  if (!folder.startsWith('values') || !fs.existsSync(path.join(root, relative))) continue;
  patch(relative, text => text.replace(/(<string name="app_name"[^>]*>)[\s\S]*?(<\/string>)/g, '$1Yapapouaiye Launcher$2'));
}
for (const [source, target] of [
  ['src/YapapouaiyeHome.kt', 'FCL/src/main/java/com/tungsten/fcl/activity/YapapouaiyeHome.kt'],
  ['src/YapapouaiyeGameMenu.java', 'FCL/src/main/java/com/tungsten/fcl/activity/YapapouaiyeGameMenu.java'],
  ['src/EmbeddedMods.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/EmbeddedMods.java'],
  ['src/AuthenticationErrors.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/AuthenticationErrors.java'],
  ['src/DesktopMicrosoftSession.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/DesktopMicrosoftSession.java'],
  ['tests/DesktopMicrosoftSessionTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/DesktopMicrosoftSessionTest.java'],
  ['tests/AuthenticationErrorsTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/AuthenticationErrorsTest.java'],
  ['tests/HttpRequestRetryTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/HttpRequestRetryTest.java'],
  ['src/LauncherApi.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/LauncherApi.java'],
  ['src/YapapouaiyeGamepad.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/YapapouaiyeGamepad.java'],
  ['src/MinecraftServers.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/MinecraftServers.java'],
  ['src/LauncherUpdates.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/LauncherUpdates.java'],
  ['src/GameOptions.java', 'FCL/src/main/java/com/tungsten/fcl/yapapouaiye/GameOptions.java'],
  ['tests/LauncherUpdatesTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/LauncherUpdatesTest.java'],
  ['tests/GameOptionsTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/GameOptionsTest.java'],
  ['tests/EmbeddedModsTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/EmbeddedModsTest.java'],
  ['tests/LauncherApiTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/LauncherApiTest.java'],
  ['tests/MinecraftServersTest.java', 'FCL/src/test/java/com/tungsten/fcl/yapapouaiye/MinecraftServersTest.java'],
]) {
  fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
  fs.copyFileSync(path.join(__dirname, source), path.join(root, target));
}
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to); else fs.copyFileSync(from, to);
  }
}
const engineTarget = path.join(root, 'YapapouaiyeEngine');
fs.mkdirSync(engineTarget, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'moteur/build.gradle.kts'), path.join(engineTarget, 'build.gradle.kts'));
copyTree(path.join(__dirname, 'moteur/src'), path.join(engineTarget, 'src'));
const instrumentation = path.join(__dirname, 'moteur/instrumentation/src');
if (fs.existsSync(instrumentation)) copyTree(instrumentation, path.join(root, 'FCL/src/androidTest/java'));
const oldSetup = path.join(root, 'FCL/src/main/java/com/tungsten/fcl/activity/AdoServSetup.kt');
if (fs.existsSync(oldSetup)) fs.unlinkSync(oldSetup);
fs.copyFileSync(path.join(__dirname, '../assets/logo.png'), path.join(root, 'FCL/src/main/res/drawable/yapapouaiye_logo.png'));
// Remove only the three assets generated by the former single-server build.
for (const file of ['AdoServSE.mrpack', 'pack-inventory.json', 'server.json']) {
  const oldAsset = path.join(root, 'FCL/src/main/assets/adoservse', file);
  if (fs.existsSync(oldAsset)) fs.unlinkSync(oldAsset);
}
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(__dirname, 'LICENSE-FCL'));
const homeAssets = path.join(root, 'FCL/src/main/assets/yapapouaiye');
fs.mkdirSync(homeAssets, { recursive: true });
for (const file of ['index.html', 'home.css', 'home.js']) fs.copyFileSync(path.join(__dirname, 'ui', file), path.join(homeAssets, file));
const engineSources = [];
function inventory(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) inventory(path.join(directory,entry.name),relative+'/');
    else engineSources.push([relative, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(directory,entry.name))).digest('hex')]);
  }
}
inventory(path.join(__dirname, 'moteur/src/main'));
engineSources.push(['YapapouaiyeGameMenu.java', require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'src/YapapouaiyeGameMenu.java'))).digest('hex')]);
engineSources.push(['YapapouaiyeGamepad.java', require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'src/YapapouaiyeGamepad.java'))).digest('hex')]);
fs.writeFileSync(path.join(homeAssets,'engine.json'), JSON.stringify({id:'yapapouaiye.android.moteur',version, sources:engineSources}, null, 2)+'\n');
for (const file of ['logo.png', 'background.png']) fs.copyFileSync(path.join(__dirname, '../assets', file), path.join(homeAssets, file));
for (const file of ['nexlux-1.1.0.jar', 'nexlux-26.2.jar']) fs.copyFileSync(path.join(__dirname, '../mods', file), path.join(homeAssets, file));
for (const file of controlsCompanions) fs.copyFileSync(path.join(controlsCompanionDirectory, file), path.join(homeAssets, file));
console.log(`FCL ${pin.commit} préparé pour le catalogue Yapapouaiye, version ${version}.`);
