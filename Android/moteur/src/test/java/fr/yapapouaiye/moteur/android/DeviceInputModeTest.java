/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class DeviceInputModeTest {
    @Test public void fullSourceMasksIdentifyControllersAndIgnoreMouseKeyboardAndTouch() {
        assertTrue(DeviceInputMode.isController(0x00000401, false));
        assertTrue(DeviceInputMode.isController(0x01000010, false));
        assertTrue(DeviceInputMode.isController(0x01000511, false));
        assertFalse(DeviceInputMode.isController(0x00000101, false)); // Keyboard
        assertFalse(DeviceInputMode.isController(0x00002002, false)); // Mouse
        assertFalse(DeviceInputMode.isController(0x00001002, false)); // Touchscreen
        assertFalse(DeviceInputMode.isController(0x00000201, false)); // D-pad only
        assertFalse(DeviceInputMode.isController(0, false));
        assertFalse(DeviceInputMode.isController(0x00000401, true)); // Virtual input
    }

    @Test public void lastControllerDisconnectRestoresTouchMode() {
        DeviceInputMode mode=new DeviceInputMode();
        assertFalse(mode.hasController());
        mode.update(8,0x00000401,false);
        mode.update(9,0x00000101,false);
        mode.update(10,0x01000010,false);
        assertTrue(mode.hasController());
        mode.remove(8);
        assertTrue(mode.hasController());
        mode.remove(10);
        assertFalse(mode.hasController());
        mode.remove(10);
        assertFalse(mode.hasController());
    }

    @Test public void changedSourcesAndFreshEnumerationDropStaleControllers() {
        DeviceInputMode mode=new DeviceInputMode();
        mode.update(7,0x00000401,false);
        mode.update(7,0x00000101,false);
        assertFalse(mode.hasController());
        mode.update(7,0x01000010,false);
        mode.update(7,0x01000010,true);
        assertFalse(mode.hasController());
        mode.update(7,0x00000401,false);
        mode.clear();
        mode.update(8,0x00002002,false);
        assertFalse(mode.hasController());
    }
}
