/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.tungsten.fclcore.util.io.ResponseCodeException;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

/** User-facing diagnostics for HTTP failures hidden by the authentication wrapper. */
public final class AuthenticationErrors {
    private AuthenticationErrors() { }

    public static String message(Throwable failure) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable cause = failure; cause != null && seen.add(cause); cause = cause.getCause()) {
            if (!(cause instanceof ResponseCodeException)) continue;
            ResponseCodeException response = (ResponseCodeException) cause;
            String host = response.getUrl().getHost();
            String service = "api.minecraftservices.com".equalsIgnoreCase(host) ? "Minecraft"
                    : "user.auth.xboxlive.com".equalsIgnoreCase(host) || "xsts.auth.xboxlive.com".equalsIgnoreCase(host) ? "Xbox"
                    : "login.microsoftonline.com".equalsIgnoreCase(host) ? "Microsoft" : "d’authentification";
            if (response.getResponseCode() == 429) {
                return "Le service " + service + " limite temporairement les demandes de connexion (HTTP 429). "
                        + "Attends avant de réessayer. Relancer plusieurs fois peut prolonger cette limitation.";
            }
            if (response.getResponseCode() == 403 && "api.minecraftservices.com".equalsIgnoreCase(host)) {
                return "Le service Minecraft a refusé la connexion du launcher (HTTP 403). "
                        + "L’éditeur doit vérifier l’autorisation de son application auprès de Minecraft. "
                        + "Ce refus ne signifie pas que ta connexion Internet est coupée.";
            }
        }
        return null;
    }
}
