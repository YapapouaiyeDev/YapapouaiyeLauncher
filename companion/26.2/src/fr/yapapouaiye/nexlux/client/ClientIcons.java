package fr.yapapouaiye.nexlux.client;

import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Pixel pictograms: no emoji font, resource pack or platform glyph dependency. */
public final class ClientIcons {
    private ClientIcons() {}

    private static String[] pixels(String id) {
        return switch (id) {
            case "potions" -> new String[]{"  ####  ","   ##   ","   ##   ","  #  #  "," #    # "," ###### "," ###### ","  ####  "};
            case "saturation" -> new String[]{"   ###  ","  ##### "," #######"," #######","  ##### ","   ###  ","  ##    "," ##     "};
            case "nightvision" -> new String[]{"  ###   "," #####  ","###     ","###     ","###     "," #### # ","  ####  ","   ##   "};
            case "nofog" -> new String[]{"  ###   "," #####  ","####### ","        "," #######","        ","######  ","        "};
            case "zoom", "search" -> new String[]{" ####   ","##  ##  ","#    #  ","#    #  ","##  ##  "," ###### ","     ###","      ##"};
            case "fpsboost" -> new String[]{"    ##  ","   ##   ","  ##    "," ###### ","    ##  ","   ##   ","  ##    "," ##     "};
            case "coords", "move" -> new String[]{"   ##   ","  ####  ","   ##   ","########","########","   ##   ","  ####  ","   ##   "};
            case "cps" -> new String[]{"  ####  "," ##  ## ","## ## ##","## ## ##","########","##    ##"," ##  ## ","  ####  "};
            case "armor" -> new String[]{"########","##    ##","##    ##","##    ##"," ##  ## "," ##  ## ","  ####  ","   ##   "};
            case "speed" -> new String[]{"##  ##  "," ##  ## ","  ##  ##","   ##  #","  ##  ##"," ##  ## ","##  ##  ","        "};
            case "fps" -> new String[]{"########","#      #","# #  # #","#  ##  #","#      #","########","   ##   "," ###### "};
            case "ping" -> new String[]{"      ##","      ##","    ####","    ####","  ######","  ######","########","########"};
            case "close" -> new String[]{"##    ##"," ##  ## ","  ####  ","   ##   ","  ####  "," ##  ## ","##    ##","        "};
            default -> new String[]{"   ##   ","   ##   ","  ####  ","########","########","  ####  ","   ##   ","   ##   "};
        };
    }

    public static void draw(GuiGraphicsExtractor gui, String id, int x, int y, int scale, int color) {
        String[] rows = pixels(id);
        for (int row = 0; row < rows.length; row++) {
            for (int column = 0; column < rows[row].length(); column++) {
                if (rows[row].charAt(column) == '#') {
                    gui.fill(x + column * scale, y + row * scale,
                        x + (column + 1) * scale, y + (row + 1) * scale, color);
                }
            }
        }
    }
}
