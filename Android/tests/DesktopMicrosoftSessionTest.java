/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;

import com.tungsten.fclcore.auth.AuthenticationException;
import java.net.URI;
import java.util.concurrent.ExecutionException;
import org.junit.Test;
import static org.junit.Assert.*;

public class DesktopMicrosoftSessionTest {
    private static final String AUTHORIZE = "https://login.live.com/oauth20_authorize.srf?client_id=00000000402b5328";
    private String state() { return DesktopMicrosoftSession.authorizationUrl(AUTHORIZE).split("state=")[1]; }
    private void expectFailure(DesktopMicrosoftSession session, Class<?> causeType) throws Exception {
        try { session.waitFor(); fail("Expected rejected session"); }
        catch (ExecutionException failure) { assertTrue(causeType.isInstance(failure.getCause())); }
    }
    @Test public void desktopModeOnlyMatchesThePcClient() {
        assertTrue(DesktopMicrosoftSession.compatible("00000000402B5328"));
        assertFalse(DesktopMicrosoftSession.compatible("76f1a2a4-80ee-4ba3-b7e2-524e9f2b7849"));
        assertFalse(DesktopMicrosoftSession.compatible(null));
    }
    @Test public void matchingStateReturnsDecodedCodeAndClearsTheSession() throws Exception {
        DesktopMicrosoftSession session = DesktopMicrosoftSession.start();
        assertEquals(DesktopMicrosoftSession.REDIRECT, session.getRedirectURI());
        assertTrue(DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?state=" + state() + "&code=test%2Bcode%2Fvalue"));
        assertEquals("test+code/value", session.waitFor());
        assertFalse(DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?code=late"));
    }
    @Test public void lookalikeHostsAndNonHttpsCallbacksCannotCompleteLogin() throws Exception {
        DesktopMicrosoftSession session = DesktopMicrosoftSession.start(); String state = state();
        for (String url : new String[]{"https://login.live.com.evil.example/oauth20_desktop.srf", "http://login.live.com/oauth20_desktop.srf", "https://login.live.com:444/oauth20_desktop.srf", "https://login.live.com/other"}) {
            assertFalse(DesktopMicrosoftSession.completeCallback(url + "?state=" + state + "&code=wrong"));
        }
        assertTrue(DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?state=" + state + "&code=right"));
        assertEquals("right", session.waitFor());
    }
    @Test public void mismatchedStateIsRejected() throws Exception {
        DesktopMicrosoftSession session = DesktopMicrosoftSession.start();
        assertTrue(DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?state=wrong&code=wrong"));
        expectFailure(session, AuthenticationException.class);
    }
    @Test public void duplicateParametersAndProviderErrorsAreRejected() throws Exception {
        DesktopMicrosoftSession session = DesktopMicrosoftSession.start(); String state = state();
        DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?state=" + state + "&code=one&code=two");
        expectFailure(session, AuthenticationException.class);
        session = DesktopMicrosoftSession.start(); state = state();
        DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?state=" + state + "&error=access_denied");
        expectFailure(session, AuthenticationException.class);
    }
    @Test public void closingAnOldBrowserCannotCancelItsReplacement() throws Exception {
        DesktopMicrosoftSession old = DesktopMicrosoftSession.start(); String oldUrl = DesktopMicrosoftSession.authorizationUrl(AUTHORIZE);
        DesktopMicrosoftSession current = DesktopMicrosoftSession.start(); String state = state();
        DesktopMicrosoftSession.cancelForAuthorizationUrl(oldUrl);
        DesktopMicrosoftSession.completeCallback(DesktopMicrosoftSession.REDIRECT + "?state=" + state + "&code=current");
        expectFailure(old, InterruptedException.class);
        assertEquals("current", current.waitFor());
    }
    @Test public void closingTheCurrentBrowserCancelsItsWait() throws Exception {
        DesktopMicrosoftSession session = DesktopMicrosoftSession.start();
        DesktopMicrosoftSession.cancelForAuthorizationUrl(DesktopMicrosoftSession.authorizationUrl(AUTHORIZE));
        expectFailure(session, InterruptedException.class);
    }
}
