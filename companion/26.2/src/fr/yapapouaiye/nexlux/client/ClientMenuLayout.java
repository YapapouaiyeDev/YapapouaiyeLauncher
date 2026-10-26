package fr.yapapouaiye.nexlux.client;

/** Geometry shared by drawing, scrolling and pointer hit testing, in GUI pixels. */
public final class ClientMenuLayout {
    public static final int CARD_HEIGHT = 80;
    public static final int GAP = 8;
    public static final int MIN_WIDTH = 240;
    public static final int MIN_HEIGHT = 196;
    public final int x, y, width, height, toolbarY, searchX, searchY, searchWidth;
    public final int gridX, gridY, gridWidth, gridHeight, columns, cardWidth;

    public ClientMenuLayout(int screenWidth, int screenHeight) {
        this(screenWidth, screenHeight, 640, 410, 0.5, 0.5);
    }

    public ClientMenuLayout(int screenWidth, int screenHeight, int desiredWidth, int desiredHeight, double horizontal, double vertical) {
        width = fit(desiredWidth, MIN_WIDTH, screenWidth - 20);
        height = fit(desiredHeight, MIN_HEIGHT, screenHeight - 20);
        int availableX = Math.max(0, screenWidth - width - 20);
        int availableY = Math.max(0, screenHeight - height - 20);
        x = Math.min(10, Math.max(0, (screenWidth - width) / 2)) + (int)Math.round(availableX * fraction(horizontal));
        y = Math.min(10, Math.max(0, (screenHeight - height) / 2)) + (int)Math.round(availableY * fraction(vertical));
        toolbarY = y + 32;
        boolean compact = width < 420;
        searchWidth = compact ? Math.max(1, width - 20) : Math.max(90, Math.min(180, width - 210));
        searchX = compact ? x + 10 : x + width - searchWidth - 10;
        searchY = compact ? toolbarY + 27 : toolbarY;
        gridX = x + 10;
        gridY = toolbarY + (compact ? 56 : 30);
        gridWidth = Math.max(1, width - 20);
        gridHeight = Math.max(1, y + height - gridY - 20);
        columns = Math.max(1, Math.min(4, (gridWidth + GAP) / 112));
        cardWidth = Math.max(1, (gridWidth - GAP * (columns - 1)) / columns);
    }

    public static int fit(int desired, int minimum, int maximum) {
        int limit = Math.max(1, maximum);
        return Math.max(Math.min(minimum, limit), Math.min(desired, limit));
    }
    private static double fraction(double value) {
        return Double.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
    }
    public boolean onHeader(double mx, double my) { return contains(mx, my, x, y, Math.max(1, width - 26), 26); }
    public boolean onResizeHandle(double mx, double my) { return contains(mx, my, x + width - 16, y + height - 16, 16, 16); }

    public int cardX(int index) { return gridX + index % columns * (cardWidth + GAP); }
    public int cardY(int index, int scroll) { return gridY + index / columns * (CARD_HEIGHT + GAP) - scroll; }
    public int maxScroll(int count) {
        int rows = (count + columns - 1) / columns;
        return Math.max(0, rows * (CARD_HEIGHT + GAP) - GAP - gridHeight);
    }
    public boolean inGrid(double mx, double my) {
        return contains(mx, my, gridX, gridY, gridWidth, gridHeight);
    }
    public int hitCard(double mx, double my, int count, int scroll) {
        if (!inGrid(mx, my)) return -1;
        for (int i = 0; i < count; i++) {
            if (contains(mx, my, cardX(i), cardY(i, scroll), cardWidth, CARD_HEIGHT)) return i;
        }
        return -1;
    }
    public static boolean contains(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && mx < x + w && my >= y && my < y + h;
    }
}
