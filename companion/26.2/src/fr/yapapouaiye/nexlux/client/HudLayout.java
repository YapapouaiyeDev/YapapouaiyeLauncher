package fr.yapapouaiye.nexlux.client;

public final class HudLayout {
    private HudLayout() {}

    /** Preserve the nearest edge or the screen center when the viewport changes. */
    public static int reflow(int position, int size, int oldExtent, int newExtent) {
        return reflow(position, size, oldExtent, newExtent, anchor(position, size, oldExtent));
    }

    public static int anchor(int position, int size, int extent) {
        int center = position + size / 2;
        if (Math.abs(center - extent / 2) <= 10) return 0;
        return center > extent / 2 ? 1 : -1;
    }

    public static int reflow(int position, int size, int oldExtent, int newExtent, int anchor) {
        int oldSize = Math.max(1, oldExtent);
        int result;
        if (anchor > 0) {
            int gap = oldSize - position - size;
            if (gap < 24) gap = 4;
            result = newExtent - size - gap;
        } else if (anchor < 0) {
            result = position;
        } else {
            result = newExtent / 2 + position - oldSize / 2;
        }
        return Math.max(4, Math.min(Math.max(4, newExtent - size - 4), result));
    }

    public static int snap(int position, int size, int[] otherStarts, int[] otherSizes, int extent) {
        int result = position;
        int distance = 7;
        int[] screen = {4, extent - size - 4, (extent - size) / 2};
        for (int target : screen) {
            if (Math.abs(position - target) < distance) { result = target; distance = Math.abs(position - target); }
        }
        for (int i = 0; i < otherStarts.length; i++) {
            int[] targets = {otherStarts[i], otherStarts[i] + otherSizes[i] - size};
            for (int target : targets) {
                if (Math.abs(position - target) < distance) { result = target; distance = Math.abs(position - target); }
            }
        }
        return Math.max(4, Math.min(Math.max(4, extent - size - 4), result));
    }

    /** Place a resized module in the nearest free rectangle without moving other modules. */
    public static int[] avoidOverlap(int x, int y, int width, int height, int screenWidth, int screenHeight, int[][] obstacles) {
        java.util.List<Integer> xs = new java.util.ArrayList<>(java.util.List.of(x, 4, screenWidth - width - 4));
        java.util.List<Integer> ys = new java.util.ArrayList<>(java.util.List.of(y, 4, screenHeight - height - 4));
        for (int[] r : obstacles) {
            xs.add(r[0] + r[2] + 4); xs.add(r[0] - width - 4);
            ys.add(r[1] + r[3] + 4); ys.add(r[1] - height - 4);
        }
        long distance = Long.MAX_VALUE;
        int bestX = x, bestY = y;
        for (int cx : xs) for (int cy : ys) {
            if (cx < 4 || cy < 4 || cx + width > screenWidth - 4 || cy + height > screenHeight - 4) continue;
            boolean free = true;
            for (int[] r : obstacles) if (cx < r[0] + r[2] + 4 && cx + width + 4 > r[0]
                    && cy < r[1] + r[3] + 4 && cy + height + 4 > r[1]) { free = false; break; }
            long dx = (long)cx - x, dy = (long)cy - y, candidate = dx * dx + dy * dy;
            if (free && candidate < distance) { distance = candidate; bestX = cx; bestY = cy; }
        }
        // A crowded tiny viewport can have no free rectangle. Keep the clamped position.
        return new int[]{bestX, bestY};
    }
}
