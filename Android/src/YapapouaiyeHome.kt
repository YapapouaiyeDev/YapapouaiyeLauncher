/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.activity

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import com.google.gson.Gson
import com.tungsten.fcl.BuildConfig
import com.tungsten.fcl.game.ModpackHelper
import com.tungsten.fcl.setting.Accounts
import com.tungsten.fcl.setting.Profile
import com.tungsten.fcl.setting.Profiles
import com.tungsten.fcl.ui.version.Versions
import com.tungsten.fcl.yapapouaiye.EmbeddedMods
import com.tungsten.fcl.yapapouaiye.LauncherApi
import com.tungsten.fcl.yapapouaiye.MinecraftServers
import com.tungsten.fcl.yapapouaiye.LauncherUpdates
import com.tungsten.fcl.yapapouaiye.GameOptions
import com.tungsten.fcl.ui.account.CreateAccountDialog
import com.tungsten.fclcore.auth.microsoft.MicrosoftAccount
import com.tungsten.fclcore.auth.offline.OfflineAccount
import com.tungsten.fclcore.auth.offline.OfflineAccountFactory
import com.tungsten.fclcore.download.LibraryAnalyzer
import com.tungsten.fclcore.task.Task
import com.tungsten.fclcore.task.TaskExecutor
import com.tungsten.fclcore.task.TaskListener
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.nio.charset.StandardCharsets
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Local Yapapouaiye home; installation, JVM, rendering and launch remain owned by FCL. */
@SuppressLint("SetJavaScriptEnabled")
class YapapouaiyeHome(private val activity: MainActivity) {
    companion object { private val installationMutex = Mutex() }
    private val preferences = activity.getSharedPreferences("yapapouaiye", Context.MODE_PRIVATE)
    private val api = LauncherApi()
    private var servers = emptyList<LauncherApi.Server>()
    private var selected: LauncherApi.Server? = null
    private var versionId = ""
    private val address get() = selected?.address() ?: ""
    private val codes = mutableMapOf<String, List<String>>()
    private val maxRam: Int = run {
        val info = ActivityManager.MemoryInfo()
        (activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        ((info.totalMem / (1024L * 1024 * 1024)) - 2).toInt().coerceIn(2, 12)
    }
    private val profile: Profile get() {
        val server = selected ?: throw IOException("Choisis un serveur.")
        // Keep the existing AdoServSE installation usable when updating the first APK.
        val folder = if (server.id == "adoserv-skillsenergy-mv6uc6bh") "adoservse" else "servers/${server.id}"
        val directory = File(activity.getExternalFilesDir(null) ?: activity.filesDir, folder)
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException("Impossible de créer le dossier du jeu.")
        val selected = Profiles.profiles.firstOrNull { it.gameDir.canonicalFile == directory.canonicalFile }
            ?: Profile(server.name, directory).also { Profiles.addProfile(it) }
        Profiles.setSelectedProfile(selected)
        return selected
    }
    private val web = WebView(activity)
    private var phase = "initializing"
    private var message = "Initialisation du launcher…"
    private var error: String? = null
    private var gameInstalled = false
    private var ready = false
    private var busy = false
    private var queued = false
    private var started = false
    private var destroyed = false
    private var advanced = false
    private var currentPage = "accueil"
    private var leftForGame = false
    private var job: Job? = null
    private var taskExecutor: TaskExecutor? = null
    private var updateJob: Job? = null
    private var updateRelease: LauncherUpdates.Release? = null
    private var updateMessage = "Recherche automatique au démarrage."
    private var updateReady = false
    private var authenticating = false
    private val updateFile get() = File(activity.cacheDir, "yapapouaiye-update.apk")
    private val microsoftAccount get() = (Accounts.getSelectedAccount() as? MicrosoftAccount)
        ?: Accounts.getAccounts().filterIsInstance<MicrosoftAccount>().firstOrNull()
    private val authMode get() = preferences.getString("authMode", "offline") ?: "offline"

    init {
        web.setBackgroundColor(Color.rgb(11, 13, 19))
        web.settings.apply {
            javaScriptEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            domStorageEnabled = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            builtInZoomControls = false
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(activity)).build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == "appassets.androidplatform.net" &&
                    uri.path?.startsWith("/assets/yapapouaiye/") == true) return loader.shouldInterceptRequest(uri)
                return WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(byteArrayOf()))
            }
        }
        web.addJavascriptInterface(Bridge(), "YapaNative")
        activity.setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/yapapouaiye/index.html")
    }

    private fun publish() {
        if (destroyed) return
        val state = JSONObject().put("phase", phase).put("message", message).put("error", error ?: JSONObject.NULL)
            .put("ready", ready).put("busy", busy).put("queued", queued).put("gameInstalled", gameInstalled)
            .put("username", preferences.getString("username", "")).put("ram", preferences.getInt("ram", 0))
            .put("maxRam", maxRam).put("address", address).put("minecraft", selected?.gameVersion ?: "")
            .put("servers", org.json.JSONArray(Gson().toJson(servers))).put("selectedId", selected?.id ?: "")
            .put("serverName", selected?.name ?: "Choisis ton serveur").put("loader", selected?.defaultLoader ?: "")
            .put("codesRequired", selected?.codesRequired ?: false).put("codesCount", selected?.codesCount ?: 0)
            .put("version", BuildConfig.VERSION_NAME)
            .put("authMode", authMode).put("microsoftName", microsoftAccount?.character ?: "")
            .put("authenticating", authenticating)
            .put("microsoftConfigured", fr.yapapouaiye.moteur.android.MicrosoftSettings.configured(activity))
            .put("preset", preferences.getString("preset", "custom"))
            .put("hideCursor", preferences.getBoolean("hideCursor", false))
            .put("autoUpdates", preferences.getBoolean("autoUpdates", true))
            .put("updateMessage", updateMessage).put("updateBusy", updateJob != null)
            .put("updateAvailable", updateRelease != null).put("updateReady", updateReady)
        web.evaluateJavascript("window.launcherState && window.launcherState($state);", null)
    }
    private fun status(value: String, text: String) { phase = value; message = text; publish() }

    private inner class Bridge {
        @JavascriptInterface fun ready() = activity.runOnUiThread {
            publish()
            if (!started) { started = true; refreshCatalog(); checkUpdates() }
        }
        @JavascriptInterface fun auth(mode: String) = activity.runOnUiThread {
            if (busy || queued || authenticating || mode !in listOf("offline", "microsoft")) return@runOnUiThread
            preferences.edit().putString("authMode", mode).apply(); publish()
        }
        @JavascriptInterface fun microsoft() = activity.runOnUiThread {
            if (busy || queued || authenticating) return@runOnUiThread
            if (!fr.yapapouaiye.moteur.android.MicrosoftSettings.configured(activity)) {
                error = fr.yapapouaiye.moteur.android.MicrosoftSettings.UNAVAILABLE_MESSAGE; publish()
                return@runOnUiThread
            }
            authenticating = true; publish()
            val dialog = CreateAccountDialog(activity, Accounts.FACTORY_MICROSOFT)
            dialog.setOnDismissListener {
                authenticating = false
                if (microsoftAccount != null) preferences.edit().putString("authMode", "microsoft").apply()
                publish()
            }
            dialog.show()
        }
        @JavascriptInterface fun chooseMicrosoft() = activity.runOnUiThread {
            if (busy || queued || authenticating) return@runOnUiThread
            val accounts = Accounts.getAccounts().filterIsInstance<MicrosoftAccount>()
            if (accounts.isEmpty()) return@runOnUiThread
            AlertDialog.Builder(activity).setTitle("Compte Minecraft")
                .setItems(accounts.map { it.character }.toTypedArray()) { _, index ->
                    Accounts.setSelectedAccount(accounts[index]); publish()
                }.setNegativeButton("Fermer", null).show()
        }
        @JavascriptInterface fun preferences(preset: String, hideCursor: Boolean, autoUpdates: Boolean) = activity.runOnUiThread {
            if (busy || queued || preset !in listOf("custom", "balanced", "performance")) return@runOnUiThread
            preferences.edit().putString("preset", preset).putBoolean("hideCursor", hideCursor)
                .putBoolean("autoUpdates", autoUpdates).apply(); publish()
        }
        @JavascriptInterface fun checkUpdate() = activity.runOnUiThread { checkUpdates() }
        @JavascriptInterface fun update() = activity.runOnUiThread {
            if (busy || queued || authenticating || updateJob != null) return@runOnUiThread
            if (updateReady) installUpdate() else downloadUpdate()
        }
        @JavascriptInterface fun refresh() = activity.runOnUiThread { if (!busy) refreshCatalog() }
        @JavascriptInterface fun selectServer(id: String) = activity.runOnUiThread {
            if (busy || queued) return@runOnUiThread
            val next = servers.firstOrNull { it.id == id } ?: return@runOnUiThread
            selected = next; ready = false; gameInstalled = false; versionId = ""
            preferences.edit().putString("serverId", id).apply()
            showSelection()
        }
        @JavascriptInterface fun access(values: String) = activity.runOnUiThread {
            if (busy) return@runOnUiThread
            val server = selected ?: return@runOnUiThread
            try {
                val array = org.json.JSONArray(values)
                require(array.length() == server.codesCount && array.length() <= 20)
                val provided = (0 until array.length()).map { array.getString(it).trim().also { value -> require(value.length in 1..128) } }
                codes[server.id] = provided
                prepareGame()
            } catch (_: Exception) { error = "Remplis tous les codes d’accès."; publish() }
        }
        @JavascriptInterface fun prepare() = activity.runOnUiThread { if (!busy) prepareGame() }
        @JavascriptInterface fun cancel() = activity.runOnUiThread {
            if (busy && job != null) {
                queued = false
                status("cancelling", "Arrêt de l’installation en cours…")
                job?.cancel()
            }
        }
        @JavascriptInterface fun settings(ram: Int) = activity.runOnUiThread {
            if (busy || queued) return@runOnUiThread
            if (ram == 0 || ram in 2..maxRam) preferences.edit().putInt("ram", ram).apply()
        }
        @JavascriptInterface fun play(username: String, ram: Int) = activity.runOnUiThread {
            if (authenticating || phase == "launching" || phase == "running" || phase == "cancelling" || queued) return@runOnUiThread
            if ((authMode == "offline" && !username.matches(Regex("[A-Za-z0-9_]{3,16}"))) || (ram != 0 && ram !in 2..maxRam)) {
                error = "Vérifie ton pseudo et le réglage de mémoire."; publish(); return@runOnUiThread
            }
            if (authMode == "microsoft" && !fr.yapapouaiye.moteur.android.MicrosoftSettings.configured(activity)) {
                error = fr.yapapouaiye.moteur.android.MicrosoftSettings.UNAVAILABLE_MESSAGE; publish()
                return@runOnUiThread
            }
            if (authMode == "microsoft" && microsoftAccount == null) {
                error = "Connecte d’abord ton compte Microsoft."; publish(); return@runOnUiThread
            }
            preferences.edit().putString("username", username).putInt("ram", ram).apply()
            queued = true
            if (busy) publish() else prepareGame()
        }
        @JavascriptInterface fun advanced() = activity.runOnUiThread { if (!busy) showAdvanced() }
        @JavascriptInterface fun pageChanged(page: String) = activity.runOnUiThread {
            if (page == "accueil" || page == "parametres") currentPage = page
        }
        @JavascriptInterface fun licenses() = activity.runOnUiThread {
            AlertDialog.Builder(activity).setTitle("Sources et licences")
                .setMessage("Moteur tactile et interface : Yapapouaiye, sources dans Android/moteur, sous GNU GPL v3 ou ultérieure.\n\nCompatibilité Java et graphique : Fold Craft Launcher, OpenJDK et LWJGL.\nhttps://github.com/FCL-Team/FoldCraftLauncher\n\nCatalogue et mods : ${LauncherApi.BASE}\n\nLes sources et les notices accompagnent l’APK dans l’archive Yapapouaiye-Android-sources.zip. Les composants et les mods conservent leurs licences respectives.")
                .setPositiveButton("Fermer", null).show()
        }
    }

    private fun checkUpdates() {
        if (updateJob != null || destroyed) return
        updateMessage = "Recherche d’un APK compatible…"
        updateJob = activity.lifecycleScope.launch {
            var autoDownload = false
            try {
                val arch = if (android.os.Build.SUPPORTED_ABIS.first().startsWith("x86")) "x86_64" else "arm64"
                val release = runInterruptible(Dispatchers.IO) { LauncherUpdates.check(BuildConfig.VERSION_NAME, arch) }
                if (release?.version != updateRelease?.version) updateReady = false
                updateRelease = release
                updateMessage = if (release == null) "Aucun APK compatible plus récent publié." else if (updateReady) "Mise à jour prête à installer." else "Version ${release.version} disponible (${release.size / 1024 / 1024} Mo)."
                val network = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
                autoDownload = release != null && !updateReady && preferences.getBoolean("autoUpdates", true) && !network.isActiveNetworkMetered
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { updateMessage = "Vérification impossible. Réessaie avec une connexion Internet." }
            finally { updateJob = null; publish() }
            if (autoDownload && !destroyed) downloadUpdate()
        }
        publish()
    }
    private fun downloadUpdate() {
        val release = updateRelease ?: return
        if (updateJob != null || destroyed) return
        updateReady = false
        updateMessage = "Téléchargement de la mise à jour…"
        updateJob = activity.lifecycleScope.launch {
            try {
                runInterruptible(Dispatchers.IO) {
                    LauncherUpdates.download(release, updateFile) { percent ->
                        activity.runOnUiThread { if (!destroyed) { updateMessage = "Mise à jour : $percent %"; publish() } }
                    }
                    validateUpdate()
                }
                updateReady = true
                updateMessage = "Version ${release.version} prête. Appuie sur Installer ; Android demandera ta confirmation."
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) {
                updateFile.delete()
                updateMessage = "Téléchargement ou vérification impossible. Réessaie."
            } finally { updateJob = null; publish() }
        }
        publish()
    }
    @Suppress("DEPRECATION")
    private fun validateUpdate() {
        val pm = activity.packageManager
        val apk = pm.getPackageArchiveInfo(updateFile.path, android.content.pm.PackageManager.GET_SIGNATURES)
            ?: throw IOException("APK invalide.")
        val current = pm.getPackageInfo(activity.packageName, android.content.pm.PackageManager.GET_SIGNATURES)
        val expected = updateRelease ?: throw IOException("Mise à jour absente.")
        check(apk.packageName == activity.packageName && apk.versionName == expected.version && apk.versionCode >= current.versionCode) { "Identité ou version Android incorrecte." }
        val installed = current.signatures?.map { it.toCharsString() }?.toSet() ?: emptySet()
        val incoming = apk.signatures?.map { it.toCharsString() }?.toSet() ?: emptySet()
        check(installed.isNotEmpty() && installed == incoming) { "Signature Android différente." }
    }
    private fun installUpdate() {
        if (updateJob != null || destroyed) return
        updateMessage = "Vérification de l’APK avant installation…"
        updateJob = activity.lifecycleScope.launch {
          try {
            runInterruptible(Dispatchers.IO) { validateUpdate() }
            if (busy || queued || authenticating) {
                updateMessage = "Termine la préparation ou quitte le jeu, puis appuie sur Installer."
                return@launch
            }
            if (!activity.packageManager.canRequestPackageInstalls()) {
                updateMessage = "Autorise les installations pour ce launcher, puis reviens appuyer sur Installer."
                activity.startActivity(android.content.Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    android.net.Uri.parse("package:${activity.packageName}")))
            } else {
                val uri = androidx.core.content.FileProvider.getUriForFile(activity, "${activity.packageName}.provider", updateFile)
                activity.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION))
            }
          } catch (cancelled: CancellationException) { throw cancelled }
          catch (_: Exception) { updateMessage = "Installation impossible. Vérifie les autorisations ou télécharge à nouveau l’APK." }
          finally { updateJob = null; publish() }
        }
        publish()
    }

    private fun refreshCatalog() {
        if (busy || destroyed) return
        busy = true; queued = false; ready = false; error = null
        status("loading", "Connexion à l’API Yapapouaiye…")
        job = activity.lifecycleScope.launch {
            var loaded = false
            try {
                servers = runInterruptible(Dispatchers.IO) { api.catalog() }
                selected = servers.firstOrNull { it.id == (selected?.id ?: preferences.getString("serverId", "")) } ?: servers.firstOrNull()
                gameInstalled = false; versionId = ""
                if (selected == null) throw IOException("Aucun serveur actif dans le catalogue.")
                preferences.edit().putString("serverId", selected!!.id).apply()
                loaded = true
            } catch (_: CancellationException) { status("cancelled", "Actualisation interrompue.") }
            catch (failure: Exception) { error = failure.localizedMessage; status("error", "Impossible de charger les serveurs.") }
            finally { busy = false; job = null; publish() }
            if (loaded) showSelection()
        }
    }

    private fun showSelection() {
        ready = false; error = null
        val server = selected ?: return
        if (server.codesRequired && codes[server.id]?.size != server.codesCount)
            status("access", "Saisis les codes d’accès de ${server.name}.")
        else status("idle", "${server.name} sélectionné. Connecte ton compte puis appuie sur Jouer pour préparer et rejoindre le serveur.")
    }

    private suspend fun awaitTask(task: Task<*>) {
        val stopped = CompletableDeferred<Unit>()
        try {
            suspendCancellableCoroutine<Unit> { continuation ->
                if (!continuation.isActive) { stopped.complete(Unit); return@suspendCancellableCoroutine }
                val executor = task.executor(object : TaskListener() {
                    override fun onStop(success: Boolean, executor: TaskExecutor) {
                        stopped.complete(Unit)
                        if (!continuation.isActive) return
                        if (success) continuation.resume(Unit)
                        else continuation.resumeWithException(executor.exception ?: CancellationException("Installation interrompue."))
                    }
                })
                taskExecutor = executor
                try {
                    executor.start()
                    continuation.invokeOnCancellation { executor.cancel() }
                }
                catch (failure: Exception) {
                    stopped.complete(Unit)
                    if (continuation.isActive) continuation.resumeWithException(failure)
                }
            }
        } finally {
            // Keep the installation lock until the engine has finished its cancellation cleanup.
            withContext(NonCancellable) { stopped.await() }
            taskExecutor = null
        }
    }

    private fun prepareGame() {
        if (busy || destroyed) return
        val requested = selected ?: run { refreshCatalog(); return }
        if (requested.codesRequired && codes[requested.id]?.size != requested.codesCount) {
            queued = false; ready = false; error = null
            status("access", "Saisis les codes d’accès de ${requested.name}.")
            return
        }
        busy = true; ready = false; error = null
        status("preparing", "Préparation automatique des fichiers du serveur…")
        job = activity.lifecycleScope.launch {
            var completed = false
            try {
                installationMutex.withLock {
                val server = runInterruptible(Dispatchers.IO) { api.current(requested.id) }
                selected = server; publish()
                val provided = codes[server.id] ?: emptyList()
                runInterruptible(Dispatchers.IO) { api.verify(server, provided) }
                val pack = runInterruptible(Dispatchers.IO) {
                    val companionName = if (server.defaultLoader == "neoforge") when (server.gameVersion) {
                        "26.2" -> "nexlux-26.2.jar"
                        "1.21.1" -> "nexlux-1.1.0.jar"
                        else -> null
                    } else null
                    val companionNames = companionName?.let { listOf(it, "yapapouaiye-controls-${server.gameVersion}.jar") } ?: emptyList()
                    val companions = companionNames.map { name ->
                        File(activity.cacheDir, name).also { target ->
                            activity.assets.open("yapapouaiye/$name").use { input -> target.outputStream().use { input.copyTo(it) } }
                        }
                    }
                    api.prepare(server, provided, File(activity.cacheDir, "packs"), companions) { progress ->
                        activity.runOnUiThread { if (!destroyed && phase != "cancelling") status("downloading", progress) }
                    }
                }
                versionId = pack.versionId(server)
                val repository = profile.repository
                awaitTask(repository.refreshVersionsAsync())
                if (!repository.hasVersion(versionId)) {
                    gameInstalled = false
                    status("installing", "Installation de Minecraft ${server.gameVersion} et ${server.defaultLoader}…")
                    val manifest = withContext(Dispatchers.IO) {
                        ModpackHelper.readModpackManifest(pack.file.toPath(), StandardCharsets.UTF_8)
                    }
                    awaitTask(ModpackHelper.getInstallTask(profile, pack.file, versionId, manifest))
                }
                val matches = withContext(Dispatchers.IO) {
                    val version = repository.getVersion(versionId).resolve(repository)
                    val minecraft = repository.getGameVersion(version).orElse("")
                    val type = when (server.defaultLoader) {
                        "neoforge" -> LibraryAnalyzer.LibraryType.NEO_FORGE
                        "forge" -> LibraryAnalyzer.LibraryType.FORGE
                        "fabric" -> LibraryAnalyzer.LibraryType.FABRIC
                        else -> null
                    }
                    minecraft == server.gameVersion && (type == null ||
                        LibraryAnalyzer.analyze(version, null).getVersion(type).orElse("") == pack.loaderVersion)
                }
                if (!matches) throw IOException("Les versions installées ne correspondent pas au serveur. L’installation existante a été conservée.")
                gameInstalled = true
                status("checking", "Vérification des mods de ${server.name}…")
                val fresh = runInterruptible(Dispatchers.IO) {
                    EmbeddedMods.synchronize(repository.getRunDirectory(versionId).toPath(), pack.file.toPath(), pack.mods)
                    // Fail closed if maintenance, access or catalog settings changed during the download.
                    val catalogue = api.catalog()
                    val fresh = catalogue.find { it.id == server.id }
                        ?: throw IOException("Ce serveur a été désactivé ou supprimé. Actualise la liste.")
                    if (!server.sameGame(fresh)) throw IOException("Le serveur a changé de version. Réessaie.")
                    api.verify(fresh, provided)
                    MinecraftServers.synchronize(repository.getRunDirectory(versionId).toPath(), catalogue)
                    fresh
                }
                selected = fresh
                preferences.edit().putBoolean("deathChatSupport", fresh.defaultLoader == "neoforge" && fresh.gameVersion in listOf("26.2", "1.21.1")).apply()
                runInterruptible(Dispatchers.IO) {
                    GameOptions.apply(repository.getRunDirectory(versionId).toPath(), preferences.getString("preset", "custom") ?: "custom")
                }
                applyGameSettings()
                ready = true; completed = true
                status("ready", "Tout est prêt pour ${server.name}.")
                }
            } catch (cancelled: CancellationException) {
                queued = false
                status("cancelled", "Installation interrompue. Appuie sur Jouer pour reprendre.")
            } catch (failure: Exception) {
                queued = false
                error = failure.localizedMessage?.take(2000) ?: "Impossible de préparer le jeu. Vérifie ta connexion et l’espace disponible."
                status("error", "La préparation n’a pas pu se terminer.")
            } finally {
                taskExecutor = null; busy = false; job = null; publish()
            }
            if (completed && queued && !destroyed) launchGame()
        }
    }

    private fun applyGameSettings() {
        val setting = profile.repository.specializeVersionSetting(versionId)
            ?: throw IOException("Configuration du jeu introuvable.")
        setting.isIsolateGameDir = true
        setting.serverIp = address
        setting.java = "Auto"
        val graphics = fr.yapapouaiye.moteur.android.ControlSettings(activity).renderer()
        val useZink = graphics == "zink" || (graphics == "auto" && selected?.gameVersion == "26.2")
        setting.renderer = if (useZink) com.mio.data.Renderer.ID_ZINK else com.mio.data.Renderer.ID_NGGL4ES
        if (useZink) setting.isVKDriverSystem = true
        val ram = preferences.getInt("ram", 0)
        setting.isAutoMemory = ram == 0
        if (ram in 2..maxRam) setting.maxMemory = ram * 1024
        profile.selectedVersion = versionId
    }
    private fun launchGame() {
        queued = false; busy = true; error = null; leftForGame = false
        status("launching", "Lancement du jeu et connexion à ${selected?.name}…")
        try {
            val username = preferences.getString("username", "") ?: ""
            val account = if (authMode == "microsoft") {
                microsoftAccount ?: throw IOException("Connecte ton compte Microsoft avant de jouer.")
            } else {
                check(username.matches(Regex("[A-Za-z0-9_]{3,16}"))) { "Pseudo Minecraft invalide." }
                Accounts.getAccounts().firstOrNull { it is OfflineAccount && it.username == username }
                ?: Accounts.FACTORY_OFFLINE.create(username, OfflineAccountFactory.getUUIDFromUserName(username))
                    .also { Accounts.addAccount(it) }
            }
            Accounts.setSelectedAccount(account)
            applyGameSettings()
            Versions.launch(activity, profile, versionId)
        } catch (failure: Exception) { launchFinished(false, failure.localizedMessage) }
    }
    /** Called by the engine when its launch pipeline succeeds, fails or is cancelled. */
    fun launchFinished(success: Boolean, detail: String?) = activity.runOnUiThread {
        if (destroyed) return@runOnUiThread
        if (success) status("running", "Le jeu démarre. Connexion automatique au serveur…")
        else {
            busy = false; error = detail ?: "Lancement interrompu. Tu peux réessayer."
            status("error", "Le jeu n’a pas pu démarrer.")
        }
    }
    fun onPause() { web.onPause(); if (phase == "launching" || phase == "running") leftForGame = true }
    fun onResume() {
        web.onResume()
        if (leftForGame && phase == "running") {
            leftForGame = false; busy = false
            status("ready", "Prêt à rejoindre ${selected?.name}.")
        }
        publish()
    }
    private fun showAdvanced() {
        fr.yapapouaiye.moteur.android.ControlSettingsDialog.show(activity, null)
    }
    private fun showHome() {
        advanced = false
        activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        (web.parent as? ViewGroup)?.removeView(web)
        activity.setContentView(web)
        web.evaluateJavascript("window.goHome && window.goHome();", null)
        publish()
    }
    fun onBack(): Boolean {
        if (advanced) { showHome(); return true }
        if (busy || queued || authenticating) {
            AlertDialog.Builder(activity).setTitle("Une opération est en cours")
                .setMessage("Reste dans l’application pendant la préparation. Utilise Annuler pour interrompre les téléchargements, ou quitte le jeu depuis son menu.")
                .setPositiveButton("Continuer", null).show()
            return true
        }
        if (currentPage == "parametres") { web.evaluateJavascript("window.goHome && window.goHome();", null); return true }
        return false
    }
    fun destroy() {
        destroyed = true; queued = false
        job?.cancel(); updateJob?.cancel(); taskExecutor?.cancel()
        web.removeJavascriptInterface("YapaNative")
        (web.parent as? ViewGroup)?.removeView(web)
        web.destroy()
    }
}
