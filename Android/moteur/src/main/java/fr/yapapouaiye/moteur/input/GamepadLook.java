/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;

/** Relative camera movement at the original 60 Hz baseline, independent of touch settings. */
public final class GamepadLook {
    public static final int MIN = 25, MAX = 2000, DEFAULT = 300;
    private GamepadLook() { }
    public static int bounded(int percent) { return Math.max(MIN, Math.min(MAX, percent)); }
    public static float delta(float axis, float frameScale, int percent) {
        if (!Float.isFinite(axis) || !Float.isFinite(frameScale) || frameScale <= 0) return 0;
        // Limit a delayed frame to 100 ms so returning from a stall cannot spin the camera.
        return Math.max(-1f, Math.min(1f, axis)) * Math.min(6f, frameScale) * 10f * bounded(percent) / 100f;
    }
}
