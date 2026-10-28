/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.config;
import java.util.Locale;
public final class MicrosoftClientId {
    private MicrosoftClientId() { }
    public static String normalize(String value) {
        if(value==null)return "";
        String id=value.trim().toLowerCase(Locale.ROOT);
        return id.matches("(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16})")?id:"";
    }
}
