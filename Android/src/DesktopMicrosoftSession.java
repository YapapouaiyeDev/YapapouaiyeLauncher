/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.tungsten.fclcore.auth.AuthenticationException;
import com.tungsten.fclcore.auth.OAuth;
import java.net.URI;
import java.net.URLDecoder;
import java.io.UnsupportedEncodingException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Browser return used by the same public desktop client as the PC launcher. */
public final class DesktopMicrosoftSession implements OAuth.Session {
    public static final String REDIRECT = "https://login.live.com/oauth20_desktop.srf";
    private static DesktopMicrosoftSession active;
    private final String state = UUID.randomUUID().toString();
    private final CompletableFuture<String> result = new CompletableFuture<>();

    private DesktopMicrosoftSession() { }

    public static boolean compatible(String clientId) {
        return "00000000402b5328".equalsIgnoreCase(clientId);
    }

    public static synchronized DesktopMicrosoftSession start() {
        if (active != null) active.cancel();
        active = new DesktopMicrosoftSession();
        return active;
    }

    public static synchronized String authorizationUrl(String url) {
        if (active == null) throw new IllegalStateException("Connexion Microsoft interrompue.");
        URI uri = URI.create(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !"login.live.com".equalsIgnoreCase(uri.getHost())
                || !"/oauth20_authorize.srf".equals(uri.getRawPath()) || uri.getRawUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawFragment() != null
                || query(uri).containsKey("state")) {
            throw new IllegalArgumentException("Adresse de connexion Microsoft non valide.");
        }
        return url + (uri.getRawQuery() == null ? "?" : "&") + "state=" + active.state;
    }

    public static synchronized boolean completeCallback(String url) {
        if (active == null) return false;
        URI uri;
        try { uri = URI.create(url); } catch (IllegalArgumentException invalid) { return false; }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !"login.live.com".equalsIgnoreCase(uri.getHost())
                || !"/oauth20_desktop.srf".equals(uri.getRawPath()) || uri.getRawUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawFragment() != null) return false;
        try {
            Map<String, String> values = query(uri);
            if (!active.state.equals(values.get("state"))) {
                active.result.completeExceptionally(new AuthenticationException("Réponse Microsoft non valide. Recommence la connexion."));
            } else if (values.containsKey("error")) {
                active.result.completeExceptionally(new AuthenticationException("La connexion Microsoft a été refusée ou annulée."));
            } else if (values.getOrDefault("code", "").trim().isEmpty()) {
                active.result.completeExceptionally(new AuthenticationException("La réponse Microsoft ne contient pas de code de connexion."));
            } else {
                active.result.complete(values.get("code"));
            }
        } catch (IllegalArgumentException invalid) {
            active.result.completeExceptionally(new AuthenticationException("Réponse Microsoft ambiguë. Recommence la connexion."));
        }
        return true;
    }

    public static synchronized void cancelForAuthorizationUrl(String url) {
        if (active == null || url == null) return;
        try { if (active.state.equals(query(URI.create(url)).get("state"))) active.cancel(); }
        catch (IllegalArgumentException ignored) { }
    }

    private void cancel() { result.completeExceptionally(new InterruptedException("Connexion Microsoft annulée.")); }

    private static Map<String, String> query(URI uri) {
        Map<String, String> values = new HashMap<>();
        if (uri.getRawQuery() == null) return values;
        for (String pair : uri.getRawQuery().split("&")) {
            String[] parts = pair.split("=", 2);
            String key = decode(parts[0]);
            String value = parts.length == 2 ? decode(parts[1]) : "";
            if (values.putIfAbsent(key, value) != null) throw new IllegalArgumentException("Duplicate callback parameter");
        }
        return values;
    }

    private static String decode(String value) {
        try { return URLDecoder.decode(value, "UTF-8"); }
        catch (UnsupportedEncodingException impossible) { throw new IllegalStateException(impossible); }
    }

    @Override public String getRedirectURI() { return REDIRECT; }

    @Override public String waitFor() throws InterruptedException, ExecutionException {
        try { return result.get(15, TimeUnit.MINUTES); }
        catch (TimeoutException expired) { throw new ExecutionException(new InterruptedException("Connexion Microsoft expirée.")); }
        finally { synchronized (DesktopMicrosoftSession.class) { if (active == this) active = null; } }
    }
}
