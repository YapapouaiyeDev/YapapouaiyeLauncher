/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;

import android.content.Context;
import android.content.SharedPreferences;

public final class ControlSettings {
    private final SharedPreferences store;
    public ControlSettings(Context context) { store = context.getSharedPreferences("yapapouaiye-moteur", Context.MODE_PRIVATE); }
    public int sensitivity() { return bounded("sensitivity", 85, 25, 200); }
    public int size() { return bounded("size", 100, 75, 140); }
    public int opacity() { return bounded("opacity", 70, 25, 95); }
    public int resolution() { return bounded("resolution", 100, 50, 100); }
    public boolean leftHanded() { return store.getBoolean("leftHanded", false); }
    public String renderer() { String value=store.getString("renderer","auto");return "zink".equals(value)||"krypton".equals(value)?value:"auto"; }
    public void renderer(String value) { if(!"auto".equals(value)&&!"zink".equals(value)&&!"krypton".equals(value))throw new IllegalArgumentException("Moteur graphique inconnu");store.edit().putString("renderer",value).apply(); }
    private int bounded(String key, int fallback, int min, int max) { return Math.max(min, Math.min(max, store.getInt(key, fallback))); }
    public void save(int sensitivity, int size, int opacity, int resolution, boolean leftHanded) {
        store.edit().putInt("sensitivity", Math.max(25, Math.min(200, sensitivity)))
            .putInt("size", Math.max(75, Math.min(140, size))).putInt("opacity", Math.max(25, Math.min(95, opacity)))
            .putInt("resolution", Math.max(50, Math.min(100, resolution))).putBoolean("leftHanded", leftHanded).apply();
    }
    public float x(String name, float fallback) { return Math.max(.03f, Math.min(.97f, store.getFloat("x." + name, fallback))); }
    public float y(String name, float fallback) { return Math.max(.08f, Math.min(.92f, store.getFloat("y." + name, fallback))); }
    public void position(String name, float x, float y) { store.edit().putFloat("x." + name, x).putFloat("y." + name, y).apply(); }
    public void resetLayout() {
        SharedPreferences.Editor editor = store.edit();
        for (String key : store.getAll().keySet()) if (key.startsWith("x.") || key.startsWith("y.")) editor.remove(key);
        editor.apply();
    }
}
