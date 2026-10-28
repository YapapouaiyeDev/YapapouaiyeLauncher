/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.tungsten.fclcore.util.function.ExceptionalSupplier;
import com.tungsten.fclcore.util.io.HttpRequest;
import com.tungsten.fclcore.util.io.ResponseCodeException;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import org.junit.Test;
import static org.junit.Assert.*;

public class HttpRequestRetryTest {
    private String run(ExceptionalSupplier<String, IOException> supplier) throws Throwable {
        Method retry = HttpRequest.class.getDeclaredMethod("getStringWithRetry", ExceptionalSupplier.class, int.class);
        retry.setAccessible(true);
        try { return (String) retry.invoke(null, supplier, 5); }
        catch (InvocationTargetException failure) { throw failure.getCause(); }
    }
    @Test public void rateLimitStopsAfterFirstRequest() throws Throwable {
        int[] calls = {0};
        ResponseCodeException limited = new ResponseCodeException(new URL("https://api.minecraftservices.com/authentication/login_with_xbox"), 429);
        try { run(() -> { calls[0]++; throw limited; }); fail("Expected rate limit"); }
        catch (ResponseCodeException failure) { assertSame(limited, failure); }
        assertEquals(1, calls[0]);
    }
    @Test public void rateLimitStopsRetriesEvenAfterEarlierNetworkFailure() throws Throwable {
        int[] calls = {0};
        try { run(() -> { if (++calls[0] == 1) throw new IOException("temporary"); throw new ResponseCodeException(new URL("https://api.minecraftservices.com/"), 429); }); fail("Expected rate limit"); }
        catch (ResponseCodeException failure) { assertEquals(429, failure.getResponseCode()); }
        assertEquals(2, calls[0]);
    }
    @Test public void transientConnectionFailureCanStillRecover() throws Throwable {
        int[] calls = {0};
        assertEquals("ok", run(() -> { if (++calls[0] == 1) throw new IOException("temporary"); return "ok"; }));
        assertEquals(2, calls[0]);
    }
    @Test public void authenticationRefusalsAreNotRepeatedIntoARateLimit() throws Throwable {
        for (int status : new int[]{401, 403}) {
            int[] calls = {0};
            try { run(() -> { calls[0]++; throw new ResponseCodeException(new URL("https://api.minecraftservices.com/"), status); }); fail("Expected refusal"); }
            catch (ResponseCodeException failure) { assertEquals(status, failure.getResponseCode()); }
            assertEquals(1, calls[0]);
        }
    }
}
