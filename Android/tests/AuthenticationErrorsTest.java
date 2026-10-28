/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.tungsten.fclcore.auth.ServerDisconnectException;
import com.tungsten.fclcore.util.io.ResponseCodeException;
import java.io.IOException;
import java.net.URL;
import org.junit.Test;
import static org.junit.Assert.*;

public class AuthenticationErrorsTest {
    @Test public void nestedRateLimitIdentifiesServiceWithoutExposingResponseData() throws Exception {
        ResponseCodeException response = new ResponseCodeException(new URL("https://api.minecraftservices.com/authentication/login_with_xbox"), 429, "private server response");
        String message = AuthenticationErrors.message(new ServerDisconnectException(new IOException(response)));
        assertTrue(message.contains("Minecraft"));
        assertTrue(message.contains("429"));
        assertFalse(message.contains("private server response"));
        assertFalse(message.contains("ServerDisconnectException"));
        assertTrue(AuthenticationErrors.message(new ResponseCodeException(new URL("https://user.auth.xboxlive.com/user/authenticate"), 429)).contains("Xbox"));
    }
    @Test public void minecraftRefusalIsDistinguishedFromNetworkFailure() throws Exception {
        String message = AuthenticationErrors.message(new ServerDisconnectException(new ResponseCodeException(new URL("https://api.minecraftservices.com/authentication/login_with_xbox"), 403)));
        assertTrue(message.contains("403"));
        assertTrue(message.contains("autorisation"));
        assertNull(AuthenticationErrors.message(new ResponseCodeException(new URL("https://other.example/"), 403)));
    }
    @Test public void ordinaryNetworkAndOtherErrorsKeepExistingHandling() throws Exception {
        assertNull(AuthenticationErrors.message(new IOException("network unavailable")));
        assertNull(AuthenticationErrors.message(new ResponseCodeException(new URL("https://api.minecraftservices.com/"), 500)));
        assertNull(AuthenticationErrors.message(null));
    }
}
