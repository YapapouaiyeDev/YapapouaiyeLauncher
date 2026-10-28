/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.google.gson.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;

/** Only this project's published APKs, with a release asset SHA-256, can be offered. */
public final class LauncherUpdates {
    private static final String REPO = "https://github.com/YapapouaiyeDev/YapapouaiyeLauncher/releases/download/";
    private static final String MANIFEST = "https://yapapouaiye-launcher.pages.dev/android-updates.json";
    private static final String RELEASES = "https://api.github.com/repos/YapapouaiyeDev/YapapouaiyeLauncher/releases?per_page=100";
    private static final Pattern VERSION = Pattern.compile("^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(\\d+))?(?:-(alpha|beta|rc)\\.(\\d+))?(-A)?$");
    public static final class Release {
        public final String version, url, digest;
        public final long size;
        Release(String version, String url, String digest, long size) {
            this.version = version; this.url = url; this.digest = digest; this.size = size;
        }
    }
    /** Messages owned by the updater, safe to display without HTTP bodies or arbitrary exception details. */
    public static final class UpdateFailure extends IOException {
        public UpdateFailure(String message) { super(message); }
    }
    public static String failureMessage(Throwable failure, String fallback) {
        for (int depth = 0; failure != null && depth < 8; depth++, failure = failure.getCause()) {
            if (failure instanceof UpdateFailure) return failure.getMessage();
            if (failure instanceof SocketTimeoutException) return "Le serveur de mise à jour met trop de temps à répondre. Réessaie dans un moment.";
            if (failure instanceof UnknownHostException) return "Impossible de joindre GitHub. Vérifie la connexion Internet.";
        }
        return fallback;
    }
    public static void validateIdentity(String currentPackage, long currentCode, Set<String> installed,
            String incomingPackage, String incomingVersion, long incomingCode, Set<String> incoming, Release expected) throws IOException {
        if (expected == null) throw new UpdateFailure("Recherche une mise à jour avant de l’installer.");
        if (!Objects.equals(currentPackage, incomingPackage))
            throw new UpdateFailure("Cet APK utilise un autre identifiant Android et ne peut pas remplacer cette application. La version Firebase doit être installée une fois séparément depuis le site officiel. Conserve cette ancienne application pour garder ses données.");
        if (!Objects.equals(expected.version, incomingVersion) || incomingCode <= currentCode)
            throw new UpdateFailure("La version de cet APK ne correspond pas à la mise à jour annoncée. Relance la recherche de mise à jour.");
        if (installed == null || installed.isEmpty() || !installed.equals(incoming))
            throw new UpdateFailure("Cet APK porte une autre signature Android. Il ne peut pas mettre à jour cette installation.");
    }
    public static void verify(Release release, File file) throws IOException {
        if (!file.isFile() || file.length() != release.size) throw new UpdateFailure("Téléchargement incomplet : la taille de l’APK est incorrecte. Télécharge-le à nouveau.");
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[65536]; int read;
                while ((read = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
                    sha.update(buffer, 0, read);
                }
            }
            if (!hex(sha.digest()).equals(release.digest)) throw new UpdateFailure("APK corrompu : vérification SHA-256 en échec. Télécharge-le à nouveau.");
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IOException("SHA-256 indisponible.", impossible); }
    }
    private static String hex(byte[] digest) {
        StringBuilder text = new StringBuilder();
        for (byte b : digest) text.append(String.format(Locale.ROOT, "%02x", b & 255));
        return text.toString();
    }
    private static long[] version(String value) {
        Matcher m = VERSION.matcher(value);
        if (!m.matches()) throw new IllegalArgumentException("Version Android invalide.");
        return new long[]{Long.parseLong(m.group(1)), Long.parseLong(m.group(2)), Long.parseLong(m.group(3)),
            m.group(4) == null ? 0 : Long.parseLong(m.group(4)),
            m.group(5) == null ? 3 : Arrays.asList("alpha", "beta", "rc").indexOf(m.group(5)),
            m.group(6) == null ? 0 : Long.parseLong(m.group(6)),
            m.group(7) == null ? 0 : 1};
    }
    public static int compare(String a, String b) {
        long[] left = version(a), right = version(b);
        // The independent Android series supersedes the unpublished PC-numbered test builds.
        int series = Long.compare(left[6], right[6]);
        if (series != 0) return series;
        for (int i = 0; i < left.length; i++) { int c = Long.compare(left[i], right[i]); if (c != 0) return c; }
        return 0;
    }
    public static Release select(String json, String current, String arch) throws IOException {
        if (!Arrays.asList("arm64", "x86_64").contains(arch)) throw new IOException("Architecture non prise en charge.");
        boolean beta = version(current)[4] < 3;
        Release best = null;
        try {
            for (JsonElement item : JsonParser.parseString(json).getAsJsonArray()) {
                JsonObject r = item.getAsJsonObject();
                if (r.get("draft").getAsBoolean() || (!beta && r.get("prerelease").getAsBoolean())) continue;
                String tag = r.get("tag_name").getAsString();
                if (!tag.startsWith("v") || !VERSION.matcher(tag.substring(1)).matches()) continue;
                String candidate = tag.substring(1);
                if ((!beta && version(candidate)[4] < 3) || compare(candidate, current) <= 0 ||
                    (best != null && compare(candidate, best.version) <= 0)) continue;
                String filename = "Yapapouaiye-Android-" + candidate + "-" + arch + ".apk";
                for (JsonElement asset : r.getAsJsonArray("assets")) {
                    JsonObject a = asset.getAsJsonObject();
                    if (!filename.equals(a.get("name").getAsString())) continue;
                    String url = a.get("browser_download_url").getAsString();
                    String digest = a.has("digest") && !a.get("digest").isJsonNull() ? a.get("digest").getAsString() : "";
                    long size = a.get("size").getAsLong();
                    if (!url.equals(REPO + tag + "/" + filename) || !digest.matches("sha256:[a-fA-F0-9]{64}") || size < 1 || size > 600L * 1024 * 1024) continue;
                    best = new Release(candidate, url, digest.substring(7).toLowerCase(Locale.ROOT), size);
                }
            }
            return best;
        } catch (RuntimeException e) { throw new IOException("Réponse de mise à jour invalide.", e); }
    }
    private static HttpURLConnection connect(String url) throws IOException {
        for (int redirects = 0; redirects < 6; redirects++) {
            URL parsed = new URL(url);
            if (!parsed.getProtocol().equals("https") || parsed.getUserInfo() != null ||
                !Arrays.asList("yapapouaiye-launcher.pages.dev", "api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com").contains(parsed.getHost()))
                throw new IOException("Adresse de mise à jour non autorisée.");
            HttpURLConnection c = (HttpURLConnection) parsed.openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(false); c.setUseCaches(false);
            c.setRequestProperty("User-Agent", "Yapapouaiye-Android");
            int status = c.getResponseCode();
            if (status == 200) return c;
            String location = c.getHeaderField("Location");
            boolean limited = status == 429 || (status == 403 && "0".equals(c.getHeaderField("X-RateLimit-Remaining")));
            c.disconnect();
            if (limited) throw new UpdateFailure("GitHub limite temporairement les recherches de mise à jour (HTTP " + status + "). Attends avant de réessayer.");
            if (status < 300 || status >= 400 || location == null) throw new UpdateFailure("Mises à jour indisponibles (HTTP " + status + "). Réessaie dans un moment.");
            url = new URL(parsed, location).toString();
        }
        throw new IOException("Trop de redirections.");
    }
    public static Release check(String current, String arch) throws IOException {
        return check(current, arch, LauncherUpdates::metadata);
    }
    interface MetadataSource { String read(String url) throws IOException; }
    static Release check(String current, String arch, MetadataSource source) throws IOException {
        // The public site has no shared GitHub API quota. Beta builds retain the release feed.
        if (version(current)[4] < 3) return select(source.read(RELEASES), current, arch);
        try { return select(source.read(MANIFEST), current, arch); }
        catch (InterruptedIOException interrupted) { throw interrupted; }
        catch (IOException unavailable) {
            try { return select(source.read(RELEASES), current, arch); }
            catch (IOException fallback) { fallback.addSuppressed(unavailable); throw fallback; }
        }
    }
    private static String metadata(String url) throws IOException {
        HttpURLConnection c = connect(url);
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int read;
            while ((read = in.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
                if (out.size() + read > 8 * 1024 * 1024) throw new IOException("Réponse de mise à jour trop grande.");
                out.write(buffer, 0, read);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        } finally { c.disconnect(); }
    }
    public static void download(Release release, File target, java.util.function.IntConsumer progress) throws Exception {
        File partial = new File(target.getPath() + ".part");
        HttpURLConnection c = connect(release.url);
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256"); long total = 0; int last = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                byte[] buffer = new byte[65536]; int read;
                while ((read = in.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
                    total += read;
                    if (total > release.size) throw new UpdateFailure("La taille de l’APK téléchargé dépasse celle annoncée. Relance la recherche de mise à jour.");
                    out.write(buffer, 0, read); sha.update(buffer, 0, read);
                    int percent = (int) (total * 100 / release.size);
                    if (percent != last) { last = percent; progress.accept(percent); }
                }
            }
            if (total != release.size || !hex(sha.digest()).equals(release.digest)) throw new UpdateFailure("APK corrompu ou incomplet : vérification SHA-256 en échec. Télécharge-le à nouveau.");
            java.nio.file.Files.move(partial.toPath(), target.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } finally { c.disconnect(); partial.delete(); }
    }
}
