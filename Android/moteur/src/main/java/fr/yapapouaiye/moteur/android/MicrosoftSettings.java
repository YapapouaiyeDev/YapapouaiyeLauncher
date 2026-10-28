/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;
import android.content.Context;
import fr.yapapouaiye.moteur.config.MicrosoftClientId;

public final class MicrosoftSettings {
    public static final String UNAVAILABLE_MESSAGE = "La connexion Microsoft n’est pas encore activée dans cette version du launcher.";
    private MicrosoftSettings() { }
    public static String clientId(Context context) {
        int resource=context.getResources().getIdentifier("oauth_api_key","string",context.getPackageName());
        // The launcher publisher supplies this value at build time. Player
        // preferences must never override the application's OAuth identity.
        return MicrosoftClientId.normalize(resource==0?"":context.getString(resource));
    }
    public static boolean configured(Context context) {return !clientId(context).isEmpty();}
}
