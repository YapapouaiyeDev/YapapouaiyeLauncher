/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.google.gson.Gson
 *  com.google.gson.GsonBuilder
 *  com.google.gson.JsonArray
 *  com.google.gson.JsonElement
 *  com.google.gson.JsonObject
 *  org.slf4j.Logger
 *  org.slf4j.LoggerFactory
 */
package fr.yapapouaiye.nexlux.api;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import fr.yapapouaiye.nexlux.NexLuxConfig;
import fr.yapapouaiye.nexlux.NexLuxCore;
import fr.yapapouaiye.nexlux.data.PlayerSnapshot;
import fr.yapapouaiye.nexlux.data.ServerStatus;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ApiServer {
    private static final Logger LOGGER = LoggerFactory.getLogger((String)"NexLux");
    private static final Gson GSON = new GsonBuilder().create();
    private static final String DASHBOARD = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>NexLux \u2014 Serveur</title>\n<style>\n  :root {\n    --bg: #070d14;\n    --panel: rgba(255,255,255,0.04);\n    --border: rgba(255,255,255,0.08);\n    --emerald: #10b981;\n    --text: #e7eef7;\n    --muted: #8aa0b5;\n  }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  body {\n    background: var(--bg);\n    color: var(--text);\n    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;\n    min-height: 100vh;\n  }\n  body::before, body::after {\n    content: '';\n    position: fixed;\n    width: 480px; height: 480px;\n    border-radius: 50%;\n    filter: blur(120px);\n    opacity: .18;\n    z-index: -1;\n  }\n  body::before { background: var(--emerald); top: -160px; left: -120px; }\n  body::after { background: #0ea5e9; bottom: -160px; right: -120px; }\n  .container { max-width: 980px; margin: 0 auto; padding: 36px 20px 48px; }\n  header { text-align: center; margin-bottom: 30px; }\n  h1 { font-size: 26px; font-weight: 800; letter-spacing: .5px; }\n  h1 em { color: var(--emerald); font-style: normal; }\n  .badge {\n    display: inline-flex; align-items: center; gap: 8px;\n    margin-top: 12px; padding: 6px 14px;\n    border-radius: 999px; border: 1px solid var(--border);\n    background: var(--panel); font-size: 13px; color: var(--muted);\n  }\n  .dot { width: 9px; height: 9px; border-radius: 50%; background: #f43f5e; }\n  .dot.online { background: var(--emerald); box-shadow: 0 0 10px var(--emerald); }\n  .motd { margin-top: 10px; font-size: 15px; color: var(--muted); }\n  .count { margin-top: 18px; font-size: 54px; font-weight: 800; line-height: 1; }\n  .count small { font-size: 16px; font-weight: 500; color: var(--muted); }\n  .count #online { color: var(--emerald); }\n  .stats {\n    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));\n    gap: 12px; margin: 26px 0 34px;\n  }\n  .stat {\n    background: var(--panel); border: 1px solid var(--border);\n    border-radius: 14px; padding: 14px 16px; text-align: left;\n  }\n  .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }\n  .stat .value { font-size: 20px; font-weight: 700; margin-top: 4px; }\n  .players { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 14px; }\n  .card {\n    background: var(--panel); border: 1px solid var(--border);\n    border-radius: 14px; padding: 14px 10px; text-align: center;\n  }\n  .card img, .card .letter {\n    width: 64px; height: 64px; border-radius: 12px; margin: 0 auto;\n  }\n  .card img { image-rendering: pixelated; background: #0b1622; display: block; }\n  .card .letter {\n    display: flex; align-items: center; justify-content: center;\n    background: linear-gradient(135deg, var(--emerald), #0ea5e9);\n    color: #fff; font-size: 28px; font-weight: 800;\n  }\n  .card .name { margin-top: 8px; font-size: 13px; font-weight: 600; word-break: break-word; }\n  .card .ping { font-size: 11px; color: var(--muted); margin-top: 2px; }\n  .empty { text-align: center; color: var(--muted); padding: 40px 0; }\n  footer { text-align: center; margin-top: 42px; font-size: 12px; color: var(--muted); }\n</style>\n</head>\n<body>\n<div class=\"container\">\n  <header>\n    <h1>Nex<em>Lux</em></h1>\n    <div class=\"badge\"><span class=\"dot\" id=\"status-dot\"></span><span id=\"status-text\">Connexion\u2026</span></div>\n    <div class=\"motd\" id=\"motd\"></div>\n    <div class=\"count\"><span id=\"online\">\u2014</span> <small>/ <span id=\"max\">\u2014</span> joueurs en ligne</small></div>\n    <div class=\"stats\">\n      <div class=\"stat\"><div class=\"label\">TPS</div><div class=\"value\" id=\"tps\">\u2014</div></div>\n      <div class=\"stat\"><div class=\"label\">MSPT</div><div class=\"value\" id=\"mspt\">\u2014</div></div>\n      <div class=\"stat\"><div class=\"label\">Version</div><div class=\"value\" id=\"version\">\u2014</div></div>\n      <div class=\"stat\"><div class=\"label\">Uptime</div><div class=\"value\" id=\"uptime\">\u2014</div></div>\n    </div>\n  </header>\n  <section>\n    <div class=\"players\" id=\"players\"></div>\n    <div class=\"empty\" id=\"empty\" hidden>Aucun joueur connect\u00e9.</div>\n  </section>\n  <footer>NexLux v__VERSION__ \u00b7 API serveur NeoForge \u00b7 actualisation auto 5 s</footer>\n</div>\n<script>\n(function () {\n  'use strict';\n  var params = new URLSearchParams(location.search);\n  var token = params.get('token') || '';\n  var qs = token ? ('?token=' + encodeURIComponent(token)) : '';\n  var els = {\n    dot: document.getElementById('status-dot'),\n    text: document.getElementById('status-text'),\n    online: document.getElementById('online'),\n    max: document.getElementById('max'),\n    tps: document.getElementById('tps'),\n    mspt: document.getElementById('mspt'),\n    version: document.getElementById('version'),\n    uptime: document.getElementById('uptime'),\n    motd: document.getElementById('motd'),\n    players: document.getElementById('players'),\n    empty: document.getElementById('empty')\n  };\n\n  function stripColors(s) { return String(s).replace(/\u00a7./g, ''); }\n  function fmtNum(v) { return (Math.round(v * 100) / 100).toFixed(2); }\n  function fmtUptime(sec) {\n    sec = Math.floor(sec || 0);\n    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;\n    if (h > 0) return h + 'h ' + m + 'min';\n    if (m > 0) return m + 'min ' + s + 's';\n    return s + 's';\n  }\n\n  function letter(name) {\n    var d = document.createElement('div');\n    d.className = 'letter';\n    d.textContent = (name || '?').charAt(0).toUpperCase();\n    return d;\n  }\n\n  function card(p) {\n    var el = document.createElement('div');\n    el.className = 'card';\n    var img = document.createElement('img');\n    img.alt = p.name;\n    img.loading = 'lazy';\n    if (p.headUrl) {\n      img.src = p.headUrl;\n      img.onerror = function () { el.replaceChild(letter(p.name), img); };\n      el.appendChild(img);\n    } else {\n      el.appendChild(letter(p.name));\n    }\n    var name = document.createElement('div');\n    name.className = 'name';\n    name.textContent = p.name;\n    el.appendChild(name);\n    var ping = document.createElement('div');\n    ping.className = 'ping';\n    ping.textContent = (p.ping !== undefined && p.ping !== null) ? p.ping + ' ms' : '';\n    el.appendChild(ping);\n    return el;\n  }\n\n  function setStatus(online) {\n    els.dot.className = 'dot' + (online ? ' online' : '');\n    els.text.textContent = online ? 'En ligne' : 'Hors ligne';\n  }\n\n  function load() {\n    fetch('/api/status' + qs)\n      .then(function (res) {\n        if (!res.ok) throw new Error('HTTP ' + res.status);\n        return res.json();\n      })\n      .then(function (data) {\n        setStatus(true);\n        var pl = data.players || {};\n        els.online.textContent = (pl.online !== undefined) ? pl.online : '\u2014';\n        els.max.textContent = (pl.max !== undefined) ? pl.max : '\u2014';\n        els.tps.textContent = data.tps ? fmtNum(data.tps.tps1m) : '\u2014';\n        els.mspt.textContent = data.tps ? fmtNum(data.tps.mspt) + ' ms' : '\u2014';\n        els.version.textContent = (data.server && data.server.version) ? data.server.version : '\u2014';\n        els.uptime.textContent = data.server ? fmtUptime(data.server.uptimeSeconds) : '\u2014';\n        els.motd.textContent = data.server ? stripColors(data.server.motd) : '';\n        els.players.innerHTML = '';\n        var list = pl.list || [];\n        for (var i = 0; i < list.length; i++) {\n          els.players.appendChild(card(list[i]));\n        }\n        els.empty.hidden = list.length > 0;\n        els.empty.textContent = 'Aucun joueur connect\u00e9.';\n      })\n      .catch(function () {\n        setStatus(false);\n        els.players.innerHTML = '';\n        els.empty.hidden = false;\n        els.empty.textContent = 'Serveur hors ligne ou API inaccessible.';\n      });\n  }\n\n  load();\n  setInterval(load, 5000);\n})();\n</script>\n</body>\n</html>\n".replace("__VERSION__", "26.2");
    private final NexLuxCore core;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private HttpServer httpServer;
    private ExecutorService executor;

    public ApiServer(NexLuxCore core) {
        this.core = core;
    }

    public synchronized void start() {
        if (this.running.get()) {
            return;
        }
        NexLuxConfig.ApiConfig cfg = NexLuxConfig.get().api;
        if (!cfg.enabled) {
            LOGGER.info("NexLux : API HTTP d\u00e9sactiv\u00e9e dans la configuration.");
            return;
        }
        try {
            this.httpServer = HttpServer.create(new InetSocketAddress(cfg.host, cfg.port), 0);
            this.httpServer.createContext("/", this::handle);
            this.executor = Executors.newFixedThreadPool(4, r -> {
                Thread t = new Thread(r, "NexLux-HTTP");
                t.setDaemon(true);
                return t;
            });
            this.httpServer.setExecutor(this.executor);
            this.httpServer.start();
            this.running.set(true);
            LOGGER.info("NexLux : API HTTP d\u00e9marr\u00e9e sur http://{}:{} (token requis: {})", new Object[]{cfg.host, cfg.port, cfg.token != null && !cfg.token.isEmpty()});
        }
        catch (IOException | NoClassDefFoundError e) {
            LOGGER.error("NexLux : impossible de d\u00e9marrer l'API HTTP sur {}:{} \u2014 {}", new Object[]{cfg.host, cfg.port, e.getMessage()});
        }
    }

    public synchronized void stop() {
        if (!this.running.get()) {
            return;
        }
        try {
            this.httpServer.stop(0);
        }
        catch (RuntimeException e) {
            LOGGER.debug("NexLux : arr\u00eat HTTP d\u00e9j\u00e0 en cours ({})", (Object)e.getMessage());
        }
        if (this.executor != null) {
            this.executor.shutdownNow();
            this.executor = null;
        }
        this.httpServer = null;
        this.running.set(false);
        LOGGER.info("NexLux : API HTTP arr\u00eat\u00e9e.");
    }

    public synchronized void restart() {
        this.stop();
        this.start();
    }

    public boolean isRunning() {
        return this.running.get();
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     * Enabled force condition propagation
     * Lifted jumps to return sites
     */
    private void handle(HttpExchange exchange) throws IOException {
        try {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                this.sendJson(exchange, 204, new JsonObject());
                return;
            }
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                this.sendJson(exchange, 405, ApiServer.error("M\u00e9thode non autoris\u00e9e (GET uniquement)."));
                return;
            }
            if (!this.authorized(exchange)) {
                this.sendJson(exchange, 401, ApiServer.error("Jeton d'authentification manquant ou invalide."));
                return;
            }
            String path = exchange.getRequestURI().getPath();
            if (path.endsWith("/") && path.length() > 1) {
                path = path.substring(0, path.length() - 1);
            }
            switch (path) {
                case "/": 
                case "/index.html": {
                    this.sendHtml(exchange, 200, DASHBOARD);
                    return;
                }
                case "/api": {
                    this.sendJson(exchange, 200, this.index());
                    return;
                }
                case "/api/health": {
                    this.sendJson(exchange, 200, this.health());
                    return;
                }
                case "/api/status": {
                    this.sendJson(exchange, 200, this.statusJson(true));
                    return;
                }
                case "/api/players": {
                    this.sendJson(exchange, 200, this.statusJson(false));
                    return;
                }
                case "/api/tps": {
                    this.sendJson(exchange, 200, this.tpsJson());
                    return;
                }
                default: {
                    if (path.startsWith("/api/player/")) {
                        String name = path.substring("/api/player/".length());
                        this.sendJson(exchange, 200, this.playerJson(name));
                        return;
                    } else {
                        this.sendJson(exchange, 404, ApiServer.error("Endpoint inconnu : " + path));
                    }
                    return;
                }
            }
        }
        catch (Exception e) {
            LOGGER.warn("NexLux : erreur lors du traitement d'une requ\u00eate API.", (Throwable)e);
            this.sendJson(exchange, 500, ApiServer.error("Erreur interne."));
            return;
        }
        finally {
            exchange.close();
        }
    }

    private JsonObject index() {
        JsonObject root = new JsonObject();
        root.addProperty("name", "NexLux");
        root.addProperty("version", "26.2");
        root.addProperty("dashboard", "/");
        JsonArray endpoints = new JsonArray();
        endpoints.add("/api");
        endpoints.add("/api/health");
        endpoints.add("/api/status");
        endpoints.add("/api/players");
        endpoints.add("/api/player/<pseudo>");
        endpoints.add("/api/tps");
        root.add("endpoints", (JsonElement)endpoints);
        return root;
    }

    private JsonObject health() {
        JsonObject root = new JsonObject();
        root.addProperty("status", "ok");
        root.addProperty("plugin", "NexLux");
        root.addProperty("version", "26.2");
        ServerStatus s = this.core.getStatus();
        root.addProperty("serverOnline", Boolean.valueOf(s != null));
        root.addProperty("uptimeSeconds", (Number)(s != null ? s.uptimeSeconds() : 0L));
        return root;
    }

    private JsonObject statusJson(boolean full) {
        ServerStatus s = this.core.getStatus();
        if (s == null) {
            return ApiServer.error("Serveur pas encore d\u00e9marr\u00e9.");
        }
        JsonObject root = new JsonObject();
        root.addProperty("online", Boolean.valueOf(true));
        JsonObject server = new JsonObject();
        server.addProperty("motd", s.motd());
        server.addProperty("version", s.version());
        server.addProperty("neoforge", s.neoforgeVersion());
        server.addProperty("protocol", (Number)s.protocol());
        server.addProperty("onlineMode", Boolean.valueOf(s.onlineMode()));
        server.addProperty("whitelist", Boolean.valueOf(s.whitelist()));
        server.addProperty("difficulty", s.difficulty());
        server.addProperty("tick", (Number)s.tick());
        server.addProperty("uptimeSeconds", (Number)s.uptimeSeconds());
        root.add("server", (JsonElement)server);
        JsonObject players = new JsonObject();
        players.addProperty("online", (Number)s.onlinePlayers());
        players.addProperty("max", (Number)s.maxPlayers());
        JsonArray list = new JsonArray();
        for (PlayerSnapshot p : s.players()) {
            list.add((JsonElement)this.playerToJson(p));
        }
        players.add("list", (JsonElement)list);
        root.add("players", (JsonElement)players);
        if (full) {
            root.add("tps", (JsonElement)this.tpsToJson(s));
        }
        root.add("plugin", (JsonElement)this.pluginJson());
        return root;
    }

    private JsonObject playerJson(String name) {
        ServerStatus s = this.core.getStatus();
        if (s == null) {
            return ApiServer.error("Serveur pas encore d\u00e9marr\u00e9.");
        }
        for (PlayerSnapshot p : s.players()) {
            if (!p.name().equalsIgnoreCase(name)) continue;
            JsonObject root = new JsonObject();
            root.addProperty("found", Boolean.valueOf(true));
            root.add("player", (JsonElement)this.playerToJson(p));
            return root;
        }
        JsonObject root = new JsonObject();
        root.addProperty("found", Boolean.valueOf(false));
        root.addProperty("error", "Aucun joueur connect\u00e9 avec le pseudo \u00ab " + name + " \u00bb.");
        return root;
    }

    private JsonObject tpsJson() {
        ServerStatus s = this.core.getStatus();
        if (s == null) {
            return ApiServer.error("Serveur pas encore d\u00e9marr\u00e9.");
        }
        JsonObject root = new JsonObject();
        root.add("tps", (JsonElement)this.tpsToJson(s));
        root.add("plugin", (JsonElement)this.pluginJson());
        return root;
    }

    private JsonObject tpsToJson(ServerStatus s) {
        JsonObject tps = new JsonObject();
        tps.addProperty("tps", (Number)ApiServer.round(s.tps1m()));
        tps.addProperty("tps1m", (Number)ApiServer.round(s.tps1m()));
        tps.addProperty("tps5m", (Number)ApiServer.round(s.tps5m()));
        tps.addProperty("tps15m", (Number)ApiServer.round(s.tps15m()));
        tps.addProperty("mspt", (Number)ApiServer.round(s.mspt()));
        return tps;
    }

    private JsonObject playerToJson(PlayerSnapshot p) {
        JsonObject o = new JsonObject();
        o.addProperty("name", p.name());
        o.addProperty("uuid", p.uuid());
        o.addProperty("ping", (Number)p.ping());
        o.addProperty("gamemode", p.gamemode());
        o.addProperty("world", p.world());
        o.addProperty("x", (Number)p.x());
        o.addProperty("y", (Number)p.y());
        o.addProperty("z", (Number)p.z());
        o.addProperty("health", (Number)Float.valueOf(p.health()));
        o.addProperty("level", (Number)p.level());
        if (p.itemInHand() != null) {
            o.addProperty("itemInHand", p.itemInHand());
        }
        if (p.ip() != null) {
            o.addProperty("ip", p.ip());
        }
        if (p.headUrl() != null) {
            o.addProperty("headUrl", p.headUrl());
        }
        return o;
    }

    private JsonObject pluginJson() {
        JsonObject plugin = new JsonObject();
        plugin.addProperty("name", "NexLux");
        plugin.addProperty("id", "nexlux");
        plugin.addProperty("version", "26.2");
        return plugin;
    }

    private static JsonObject error(String message) {
        JsonObject o = new JsonObject();
        o.addProperty("error", message);
        return o;
    }

    private static double round(double v) {
        return (double)Math.round(v * 100.0) / 100.0;
    }

    private boolean authorized(HttpExchange exchange) {
        String query;
        String token = NexLuxConfig.get().api.token;
        if (token == null || token.isEmpty()) {
            return true;
        }
        String provided = null;
        String header = exchange.getRequestHeaders().getFirst("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            provided = header.substring("Bearer ".length()).trim();
        }
        if (provided == null && (query = exchange.getRequestURI().getRawQuery()) != null) {
            for (String part : query.split("&")) {
                if (!part.startsWith("token=")) continue;
                provided = part.substring("token=".length());
                break;
            }
        }
        return provided != null && ApiServer.constantTimeEquals(token, provided);
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private void sendJson(HttpExchange exchange, int status, JsonObject body) throws IOException {
        byte[] bytes = GSON.toJson((JsonElement)body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        if (NexLuxConfig.get().api.cors) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Authorization, Content-Type");
        }
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, status == 204 ? -1L : (long)bytes.length);
        if (status != 204) {
            try (OutputStream os = exchange.getResponseBody();){
                os.write(bytes);
            }
        }
    }

    private void sendHtml(HttpExchange exchange, int status, String html) throws IOException {
        byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody();){
            os.write(bytes);
        }
    }
}

