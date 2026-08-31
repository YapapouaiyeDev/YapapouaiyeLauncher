package fr.yapapouaiye.nexlux.api;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import fr.yapapouaiye.nexlux.NexLux;
import fr.yapapouaiye.nexlux.NexLuxConfig;
import fr.yapapouaiye.nexlux.NexLuxCore;
import fr.yapapouaiye.nexlux.data.PlayerSnapshot;
import fr.yapapouaiye.nexlux.data.ServerStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Serveur HTTP intégré exposant les informations du serveur.
 * <p>
 * Endpoints :
 * <ul>
 *   <li>{@code GET /} — tableau de bord HTML (joueurs en ligne + têtes des joueurs)</li>
 *   <li>{@code GET /api} — index JSON des endpoints</li>
 *   <li>{@code GET /api/health} — simple test de disponibilité</li>
 *   <li>{@code GET /api/status} — statut complet (serveur, joueurs, têtes, TPS)</li>
 *   <li>{@code GET /api/players} — liste des joueurs connectés</li>
 *   <li>{@code GET /api/player/&lt;pseudo&gt;} — détail d'un joueur</li>
 *   <li>{@code GET /api/tps} — TPS (1/5/15 min) et MSPT</li>
 * </ul>
 * Si un {@code token} est configuré, chaque requête doit fournir
 * {@code Authorization: Bearer <token>} ou {@code ?token=<token>}.
 */
public final class ApiServer {

    private static final Logger LOGGER = LoggerFactory.getLogger("NexLux");
    private static final Gson GSON = new GsonBuilder().create();

    /** Tableau de bord HTML servi à la racine. */
    private static final String DASHBOARD = """
            <!DOCTYPE html>
            <html lang="fr">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NexLux — Serveur</title>
            <style>
              :root {
                --bg: #070d14;
                --panel: rgba(255,255,255,0.04);
                --border: rgba(255,255,255,0.08);
                --emerald: #10b981;
                --text: #e7eef7;
                --muted: #8aa0b5;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                background: var(--bg);
                color: var(--text);
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                min-height: 100vh;
              }
              body::before, body::after {
                content: '';
                position: fixed;
                width: 480px; height: 480px;
                border-radius: 50%;
                filter: blur(120px);
                opacity: .18;
                z-index: -1;
              }
              body::before { background: var(--emerald); top: -160px; left: -120px; }
              body::after { background: #0ea5e9; bottom: -160px; right: -120px; }
              .container { max-width: 980px; margin: 0 auto; padding: 36px 20px 48px; }
              header { text-align: center; margin-bottom: 30px; }
              h1 { font-size: 26px; font-weight: 800; letter-spacing: .5px; }
              h1 em { color: var(--emerald); font-style: normal; }
              .badge {
                display: inline-flex; align-items: center; gap: 8px;
                margin-top: 12px; padding: 6px 14px;
                border-radius: 999px; border: 1px solid var(--border);
                background: var(--panel); font-size: 13px; color: var(--muted);
              }
              .dot { width: 9px; height: 9px; border-radius: 50%; background: #f43f5e; }
              .dot.online { background: var(--emerald); box-shadow: 0 0 10px var(--emerald); }
              .motd { margin-top: 10px; font-size: 15px; color: var(--muted); }
              .count { margin-top: 18px; font-size: 54px; font-weight: 800; line-height: 1; }
              .count small { font-size: 16px; font-weight: 500; color: var(--muted); }
              .count #online { color: var(--emerald); }
              .stats {
                display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 12px; margin: 26px 0 34px;
              }
              .stat {
                background: var(--panel); border: 1px solid var(--border);
                border-radius: 14px; padding: 14px 16px; text-align: left;
              }
              .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
              .stat .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
              .players { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 14px; }
              .card {
                background: var(--panel); border: 1px solid var(--border);
                border-radius: 14px; padding: 14px 10px; text-align: center;
              }
              .card img, .card .letter {
                width: 64px; height: 64px; border-radius: 12px; margin: 0 auto;
              }
              .card img { image-rendering: pixelated; background: #0b1622; display: block; }
              .card .letter {
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, var(--emerald), #0ea5e9);
                color: #fff; font-size: 28px; font-weight: 800;
              }
              .card .name { margin-top: 8px; font-size: 13px; font-weight: 600; word-break: break-word; }
              .card .ping { font-size: 11px; color: var(--muted); margin-top: 2px; }
              .empty { text-align: center; color: var(--muted); padding: 40px 0; }
              footer { text-align: center; margin-top: 42px; font-size: 12px; color: var(--muted); }
            </style>
            </head>
            <body>
            <div class="container">
              <header>
                <h1>Nex<em>Lux</em></h1>
                <div class="badge"><span class="dot" id="status-dot"></span><span id="status-text">Connexion…</span></div>
                <div class="motd" id="motd"></div>
                <div class="count"><span id="online">—</span> <small>/ <span id="max">—</span> joueurs en ligne</small></div>
                <div class="stats">
                  <div class="stat"><div class="label">TPS</div><div class="value" id="tps">—</div></div>
                  <div class="stat"><div class="label">MSPT</div><div class="value" id="mspt">—</div></div>
                  <div class="stat"><div class="label">Version</div><div class="value" id="version">—</div></div>
                  <div class="stat"><div class="label">Uptime</div><div class="value" id="uptime">—</div></div>
                </div>
              </header>
              <section>
                <div class="players" id="players"></div>
                <div class="empty" id="empty" hidden>Aucun joueur connecté.</div>
              </section>
              <footer>NexLux v__VERSION__ · API serveur NeoForge · actualisation auto 5 s</footer>
            </div>
            <script>
            (function () {
              'use strict';
              var params = new URLSearchParams(location.search);
              var token = params.get('token') || '';
              var qs = token ? ('?token=' + encodeURIComponent(token)) : '';
              var els = {
                dot: document.getElementById('status-dot'),
                text: document.getElementById('status-text'),
                online: document.getElementById('online'),
                max: document.getElementById('max'),
                tps: document.getElementById('tps'),
                mspt: document.getElementById('mspt'),
                version: document.getElementById('version'),
                uptime: document.getElementById('uptime'),
                motd: document.getElementById('motd'),
                players: document.getElementById('players'),
                empty: document.getElementById('empty')
              };

              function stripColors(s) { return String(s).replace(/§./g, ''); }
              function fmtNum(v) { return (Math.round(v * 100) / 100).toFixed(2); }
              function fmtUptime(sec) {
                sec = Math.floor(sec || 0);
                var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
                if (h > 0) return h + 'h ' + m + 'min';
                if (m > 0) return m + 'min ' + s + 's';
                return s + 's';
              }

              function letter(name) {
                var d = document.createElement('div');
                d.className = 'letter';
                d.textContent = (name || '?').charAt(0).toUpperCase();
                return d;
              }

              function card(p) {
                var el = document.createElement('div');
                el.className = 'card';
                var img = document.createElement('img');
                img.alt = p.name;
                img.loading = 'lazy';
                if (p.headUrl) {
                  img.src = p.headUrl;
                  img.onerror = function () { el.replaceChild(letter(p.name), img); };
                  el.appendChild(img);
                } else {
                  el.appendChild(letter(p.name));
                }
                var name = document.createElement('div');
                name.className = 'name';
                name.textContent = p.name;
                el.appendChild(name);
                var ping = document.createElement('div');
                ping.className = 'ping';
                ping.textContent = (p.ping !== undefined && p.ping !== null) ? p.ping + ' ms' : '';
                el.appendChild(ping);
                return el;
              }

              function setStatus(online) {
                els.dot.className = 'dot' + (online ? ' online' : '');
                els.text.textContent = online ? 'En ligne' : 'Hors ligne';
              }

              function load() {
                fetch('/api/status' + qs)
                  .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                  })
                  .then(function (data) {
                    setStatus(true);
                    var pl = data.players || {};
                    els.online.textContent = (pl.online !== undefined) ? pl.online : '—';
                    els.max.textContent = (pl.max !== undefined) ? pl.max : '—';
                    els.tps.textContent = data.tps ? fmtNum(data.tps.tps1m) : '—';
                    els.mspt.textContent = data.tps ? fmtNum(data.tps.mspt) + ' ms' : '—';
                    els.version.textContent = (data.server && data.server.version) ? data.server.version : '—';
                    els.uptime.textContent = data.server ? fmtUptime(data.server.uptimeSeconds) : '—';
                    els.motd.textContent = data.server ? stripColors(data.server.motd) : '';
                    els.players.innerHTML = '';
                    var list = pl.list || [];
                    for (var i = 0; i < list.length; i++) {
                      els.players.appendChild(card(list[i]));
                    }
                    els.empty.hidden = list.length > 0;
                    els.empty.textContent = 'Aucun joueur connecté.';
                  })
                  .catch(function () {
                    setStatus(false);
                    els.players.innerHTML = '';
                    els.empty.hidden = false;
                    els.empty.textContent = 'Serveur hors ligne ou API inaccessible.';
                  });
              }

              load();
              setInterval(load, 5000);
            })();
            </script>
            </body>
            </html>
            """.replace("__VERSION__", NexLux.MOD_VERSION);

    private final NexLuxCore core;
    private final AtomicBoolean running = new AtomicBoolean(false);

    private HttpServer httpServer;
    private ExecutorService executor;

    public ApiServer(NexLuxCore core) {
        this.core = core;
    }

    /** Démarre le serveur HTTP selon la configuration. Sans effet s'il est déjà actif ou désactivé. */
    public synchronized void start() {
        if (running.get()) {
            return;
        }
        NexLuxConfig.ApiConfig cfg = NexLuxConfig.get().api;
        if (!cfg.enabled) {
            LOGGER.info("NexLux : API HTTP désactivée dans la configuration.");
            return;
        }
        try {
            httpServer = HttpServer.create(new InetSocketAddress(cfg.host, cfg.port), 0);
            httpServer.createContext("/", this::handle);
            executor = Executors.newFixedThreadPool(4, r -> {
                Thread t = new Thread(r, "NexLux-HTTP");
                t.setDaemon(true);
                return t;
            });
            httpServer.setExecutor(executor);
            httpServer.start();
            running.set(true);
            LOGGER.info("NexLux : API HTTP démarrée sur http://{}:{} (token requis: {})",
                    cfg.host, cfg.port, cfg.token != null && !cfg.token.isEmpty());
        } catch (NoClassDefFoundError | IOException e) {
            LOGGER.error("NexLux : impossible de démarrer l'API HTTP sur {}:{} — {}",
                    cfg.host, cfg.port, e.getMessage());
        }
    }

    /** Arrête le serveur HTTP s'il est actif. */
    public synchronized void stop() {
        if (!running.get()) {
            return;
        }
        try {
            httpServer.stop(0);
        } catch (RuntimeException e) {
            LOGGER.debug("NexLux : arrêt HTTP déjà en cours ({})", e.getMessage());
        }
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
        httpServer = null;
        running.set(false);
        LOGGER.info("NexLux : API HTTP arrêtée.");
    }

    /** Redémarre le serveur HTTP (après un reload de configuration). */
    public synchronized void restart() {
        stop();
        start();
    }

    public boolean isRunning() {
        return running.get();
    }

    // ------------------------------------------------------------------
    // Requêtes
    // ------------------------------------------------------------------

    private void handle(HttpExchange exchange) throws IOException {
        try {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 204, new JsonObject());
                return;
            }
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, error("Méthode non autorisée (GET uniquement)."));
                return;
            }
            if (!authorized(exchange)) {
                sendJson(exchange, 401, error("Jeton d'authentification manquant ou invalide."));
                return;
            }

            String path = exchange.getRequestURI().getPath();
            if (path.endsWith("/") && path.length() > 1) {
                path = path.substring(0, path.length() - 1);
            }

            switch (path) {
                case "/", "/index.html" -> sendHtml(exchange, 200, DASHBOARD);
                case "/api" -> sendJson(exchange, 200, index());
                case "/api/health" -> sendJson(exchange, 200, health());
                case "/api/status" -> sendJson(exchange, 200, statusJson(true));
                case "/api/players" -> sendJson(exchange, 200, statusJson(false));
                case "/api/tps" -> sendJson(exchange, 200, tpsJson());
                default -> {
                    if (path.startsWith("/api/player/")) {
                        String name = path.substring("/api/player/".length());
                        sendJson(exchange, 200, playerJson(name));
                    } else {
                        sendJson(exchange, 404, error("Endpoint inconnu : " + path));
                    }
                }
            }
        } catch (Exception e) {
            LOGGER.warn("NexLux : erreur lors du traitement d'une requête API.", e);
            sendJson(exchange, 500, error("Erreur interne."));
        } finally {
            exchange.close();
        }
    }

    // ------------------------------------------------------------------
    // Construction des réponses JSON
    // ------------------------------------------------------------------

    private JsonObject index() {
        JsonObject root = new JsonObject();
        root.addProperty("name", NexLux.MOD_NAME);
        root.addProperty("version", NexLux.MOD_VERSION);
        root.addProperty("dashboard", "/");
        JsonArray endpoints = new JsonArray();
        endpoints.add("/api");
        endpoints.add("/api/health");
        endpoints.add("/api/status");
        endpoints.add("/api/players");
        endpoints.add("/api/player/<pseudo>");
        endpoints.add("/api/tps");
        root.add("endpoints", endpoints);
        return root;
    }

    private JsonObject health() {
        JsonObject root = new JsonObject();
        root.addProperty("status", "ok");
        root.addProperty("plugin", NexLux.MOD_NAME);
        root.addProperty("version", NexLux.MOD_VERSION);
        ServerStatus s = core.getStatus();
        root.addProperty("serverOnline", s != null);
        root.addProperty("uptimeSeconds", s != null ? s.uptimeSeconds() : 0);
        return root;
    }

    private JsonObject statusJson(boolean full) {
        ServerStatus s = core.getStatus();
        if (s == null) {
            return error("Serveur pas encore démarré.");
        }
        JsonObject root = new JsonObject();
        root.addProperty("online", true);

        JsonObject server = new JsonObject();
        server.addProperty("motd", s.motd());
        server.addProperty("version", s.version());
        server.addProperty("neoforge", s.neoforgeVersion());
        server.addProperty("protocol", s.protocol());
        server.addProperty("onlineMode", s.onlineMode());
        server.addProperty("whitelist", s.whitelist());
        server.addProperty("difficulty", s.difficulty());
        server.addProperty("tick", s.tick());
        server.addProperty("uptimeSeconds", s.uptimeSeconds());
        root.add("server", server);

        JsonObject players = new JsonObject();
        players.addProperty("online", s.onlinePlayers());
        players.addProperty("max", s.maxPlayers());
        JsonArray list = new JsonArray();
        for (PlayerSnapshot p : s.players()) {
            list.add(playerToJson(p));
        }
        players.add("list", list);
        root.add("players", players);

        if (full) {
            root.add("tps", tpsToJson(s));
        }
        root.add("plugin", pluginJson());
        return root;
    }

    private JsonObject playerJson(String name) {
        ServerStatus s = core.getStatus();
        if (s == null) {
            return error("Serveur pas encore démarré.");
        }
        for (PlayerSnapshot p : s.players()) {
            if (p.name().equalsIgnoreCase(name)) {
                JsonObject root = new JsonObject();
                root.addProperty("found", true);
                root.add("player", playerToJson(p));
                return root;
            }
        }
        JsonObject root = new JsonObject();
        root.addProperty("found", false);
        root.addProperty("error", "Aucun joueur connecté avec le pseudo « " + name + " ».");
        return root;
    }

    private JsonObject tpsJson() {
        ServerStatus s = core.getStatus();
        if (s == null) {
            return error("Serveur pas encore démarré.");
        }
        JsonObject root = new JsonObject();
        root.add("tps", tpsToJson(s));
        root.add("plugin", pluginJson());
        return root;
    }

    private JsonObject tpsToJson(ServerStatus s) {
        JsonObject tps = new JsonObject();
        tps.addProperty("tps", round(s.tps1m()));
        tps.addProperty("tps1m", round(s.tps1m()));
        tps.addProperty("tps5m", round(s.tps5m()));
        tps.addProperty("tps15m", round(s.tps15m()));
        tps.addProperty("mspt", round(s.mspt()));
        return tps;
    }

    private JsonObject playerToJson(PlayerSnapshot p) {
        JsonObject o = new JsonObject();
        o.addProperty("name", p.name());
        o.addProperty("uuid", p.uuid());
        o.addProperty("ping", p.ping());
        o.addProperty("gamemode", p.gamemode());
        o.addProperty("world", p.world());
        o.addProperty("x", p.x());
        o.addProperty("y", p.y());
        o.addProperty("z", p.z());
        o.addProperty("health", p.health());
        o.addProperty("level", p.level());
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
        plugin.addProperty("name", NexLux.MOD_NAME);
        plugin.addProperty("id", NexLux.MOD_ID);
        plugin.addProperty("version", NexLux.MOD_VERSION);
        return plugin;
    }

    private static JsonObject error(String message) {
        JsonObject o = new JsonObject();
        o.addProperty("error", message);
        return o;
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    // ------------------------------------------------------------------
    // En-têtes, auth, envoi
    // ------------------------------------------------------------------

    private boolean authorized(HttpExchange exchange) {
        String token = NexLuxConfig.get().api.token;
        if (token == null || token.isEmpty()) {
            return true;
        }
        String provided = null;
        String header = exchange.getRequestHeaders().getFirst("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            provided = header.substring("Bearer ".length()).trim();
        }
        if (provided == null) {
            String query = exchange.getRequestURI().getRawQuery();
            if (query != null) {
                for (String part : query.split("&")) {
                    if (part.startsWith("token=")) {
                        provided = part.substring("token=".length());
                        break;
                    }
                }
            }
        }
        return provided != null && constantTimeEquals(token, provided);
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private void sendJson(HttpExchange exchange, int status, JsonObject body) throws IOException {
        byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        if (NexLuxConfig.get().api.cors) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Authorization, Content-Type");
        }
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, status == 204 ? -1 : bytes.length);
        if (status != 204) {
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    private void sendHtml(HttpExchange exchange, int status, String html) throws IOException {
        byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
