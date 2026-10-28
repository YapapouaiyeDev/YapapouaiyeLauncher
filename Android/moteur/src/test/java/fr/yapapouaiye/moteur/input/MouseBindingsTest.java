/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;
import org.junit.Test;
import static org.junit.Assert.*;
public class MouseBindingsTest {
    @Test public void modernMouseButtonsNeverBecomeEscapeOrKeyboardZero() {
        assertEquals(Integer.valueOf(1000),MouseBindings.code("key.mouse.left"));
        assertEquals(Integer.valueOf(1002),MouseBindings.code("key.mouse.right"));
        assertEquals(Integer.valueOf(1001),MouseBindings.code("key.mouse.middle"));
        assertEquals(Integer.valueOf(2003),MouseBindings.code("key.mouse.4"));
        assertEquals(Integer.valueOf(2007),MouseBindings.code("key.mouse.8"));
    }
    @Test public void legacyAndModernMouseBindingsAgree() {
        assertEquals(MouseBindings.code("key.mouse.left"),MouseBindings.code("-100"));
        assertEquals(MouseBindings.code("key.mouse.right"),MouseBindings.code("-99"));
        assertEquals(MouseBindings.code("key.mouse.middle"),MouseBindings.code("-98"));
        assertEquals(MouseBindings.code("key.mouse.4"),MouseBindings.code("-97"));
        assertEquals(MouseBindings.code("key.mouse.8"),MouseBindings.code("-93"));
    }
    @Test public void keyboardAndInvalidBindingsRemainForKeyboardResolver() {
        assertNull(MouseBindings.code("key.keyboard.w"));assertNull(MouseBindings.code("17"));
        assertNull(MouseBindings.code("key.keyboard.unknown"));assertNull(MouseBindings.code(null));
        assertNull(MouseBindings.code("-101"));assertNull(MouseBindings.code("key.mouse.9"));
    }
}
