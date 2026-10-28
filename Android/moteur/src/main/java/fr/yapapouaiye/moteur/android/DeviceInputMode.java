/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;

import java.util.HashSet;
import java.util.Set;

/** Connected-controller inventory. Kept independent of Android for regression tests. */
public final class DeviceInputMode {
    // Full Android source masks, including their source class bits. Testing only
    // SOURCE_CLASS_BUTTON would also mistake a regular keyboard for a gamepad.
    private static final int SOURCE_GAMEPAD = 0x00000401;
    private static final int SOURCE_JOYSTICK = 0x01000010;
    private final Set<Integer> controllers = new HashSet<>();

    public static boolean isController(int sources, boolean virtual) {
        return !virtual && ((sources & SOURCE_GAMEPAD) == SOURCE_GAMEPAD
                || (sources & SOURCE_JOYSTICK) == SOURCE_JOYSTICK);
    }

    public void update(int deviceId, int sources, boolean virtual) {
        if (isController(sources, virtual)) controllers.add(deviceId);
        else controllers.remove(deviceId);
    }

    public void remove(int deviceId) { controllers.remove(deviceId); }
    public void clear() { controllers.clear(); }
    public boolean hasController() { return !controllers.isEmpty(); }
}
