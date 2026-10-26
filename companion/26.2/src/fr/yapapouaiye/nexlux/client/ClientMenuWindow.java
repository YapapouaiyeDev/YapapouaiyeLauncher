package fr.yapapouaiye.nexlux.client;

/** Preferred geometry survives temporary small viewports and is serialized with client settings. */
public final class ClientMenuWindow {
    private int preferredWidth = 640;
    private int preferredHeight = 410;
    private double horizontal = 0.5;
    private double vertical = 0.5;

    public ClientMenuLayout layout(int screenWidth, int screenHeight) {
        return new ClientMenuLayout(screenWidth, screenHeight, preferredWidth, preferredHeight, horizontal, vertical);
    }

    public void moveTo(int screenWidth, int screenHeight, int x, int y) {
        ClientMenuLayout current = layout(screenWidth, screenHeight);
        int availableX = screenWidth - current.width - 20;
        int availableY = screenHeight - current.height - 20;
        if (availableX > 0) horizontal = Math.max(0, Math.min(1, (x - 10.0) / availableX));
        if (availableY > 0) vertical = Math.max(0, Math.min(1, (y - 10.0) / availableY));
    }

    public void resizeTo(int screenWidth, int screenHeight, int x, int y, int width, int height) {
        preferredWidth = ClientMenuLayout.fit(width, ClientMenuLayout.MIN_WIDTH, screenWidth - x - 10);
        preferredHeight = ClientMenuLayout.fit(height, ClientMenuLayout.MIN_HEIGHT, screenHeight - y - 10);
        moveTo(screenWidth, screenHeight, x, y);
    }

    public void reset() {
        preferredWidth = 640;
        preferredHeight = 410;
        horizontal = 0.5;
        vertical = 0.5;
    }
}
