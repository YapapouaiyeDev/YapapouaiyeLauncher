package fr.yapapouaiye.nexlux.client;

/** Persisted independently: changing one module never changes another module's geometry. */
public final class ExtraHudSettings {
    public boolean enabled;
    public int x = 180, y = 40;
    public float scale = 1;
    public boolean background = true, icons = true, names = true, levels = true, duration = true;
    public boolean number = true, bar = true;
    public int textColor = 0xFFFFFFFF, barColor = 0xFFFFAA00, backgroundColor = 0x80000000;
    private int referenceWidth, referenceHeight;

    public void sanitize() {
        scale = Float.isFinite(scale) ? Math.clamp(scale, 0.5f, 3f) : 1;
        // Text and bar colors are RGB. Only the optional panel has an alpha channel.
        textColor |= 0xFF000000;
        barColor |= 0xFF000000;
        if (!icons && !names && !levels && !duration) names = true;
        if (!number && !bar) number = true;
    }

    public float fittedScale(int contentWidth, int contentHeight, int screenWidth, int screenHeight) {
        sanitize();
        return Math.max(0.01f, Math.min(scale, Math.min(Math.max(1, screenWidth - 8) / (float)contentWidth,
            Math.max(1, screenHeight - 8) / (float)contentHeight)));
    }

    public void fit(int width, int height, int screenWidth, int screenHeight) {
        int oldWidth = referenceWidth > 0 ? referenceWidth : screenWidth;
        int oldHeight = referenceHeight > 0 ? referenceHeight : screenHeight;
        if (oldWidth != screenWidth) x = HudLayout.reflow(x, width, oldWidth, screenWidth, HudLayout.anchor(x, width, oldWidth));
        if (oldHeight != screenHeight) y = HudLayout.reflow(y, height, oldHeight, screenHeight, HudLayout.anchor(y, height, oldHeight));
        x = Math.clamp(x, 4, Math.max(4, screenWidth - width - 4));
        y = Math.clamp(y, 4, Math.max(4, screenHeight - height - 4));
        referenceWidth = screenWidth;
        referenceHeight = screenHeight;
    }
}
