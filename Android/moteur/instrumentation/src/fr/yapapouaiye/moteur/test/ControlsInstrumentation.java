/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.test;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.RectF;
import android.hardware.input.InputManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.ContextThemeWrapper;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import fr.yapapouaiye.moteur.android.TouchControlsView;
import fr.yapapouaiye.moteur.android.TouchLabActivity;
import fr.yapapouaiye.moteur.android.CustomButtons;
import fr.yapapouaiye.moteur.input.TouchButton;

/**
 * Dependency-free, device-side regression tests for the actual Android View.
 * Uses a simulated Host and never launches Minecraft, a JVM or a game world.
 */
public final class ControlsInstrumentation extends Instrumentation {
    private static final int FORWARD = 17;
    private static final int ATTACK = 1000;
    private static final int JUMP = 57;
    private static final String TEST_PREFERENCES = "moteur-instrumentation-yapapouaiye-moteur";
    private static final String[] CONTROL_IDS = {
            "joystick", "menu", "pause", "keyboard", "jump", "use", "attack",
            "sneak", "sprint", "inventory", "chat", "slot0", "slot1", "slot2",
            "slot3", "slot4", "slot5", "slot6", "slot7", "slot8", "scrollUp", "scrollDown", "custom-nexlux"
    };

    private final FakeHost host = new FakeHost();
    private final ArrayList<String> failures = new ArrayList<>();
    private final StringBuilder transcript = new StringBuilder();
    private Activity activity;
    private volatile Activity resumedActivity;
    private TouchControlsView controls;
    private String screenshotPath;
    private int testCount;
    private int passed;
    private long eventTime;
    private long downTime;

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override public void callActivityOnResume(Activity resumed) {
        super.callActivityOnResume(resumed);
        resumedActivity = resumed;
    }

    @Override public void callActivityOnPause(Activity paused) {
        if (resumedActivity == paused) resumedActivity = null;
        super.callActivityOnPause(paused);
    }

    @Override public void onStart() {
        try {
            Intent intent = new Intent();
            intent.setClassName(getTargetContext(), TouchLabActivity.class.getName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = startActivitySync(intent);
            runUi(() -> {
                // Deterministic defaults without clearing or changing the user's layout.
                activity.getSharedPreferences(TEST_PREFERENCES, Activity.MODE_PRIVATE)
                        .edit().clear().commit();
                ContextThemeWrapper testContext = new ContextThemeWrapper(activity,
                        android.R.style.Theme_Material_NoActionBar) {
                    @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                        return activity.getSharedPreferences("moteur-instrumentation-" + name, mode);
                    }
                };
                controls = new TouchControlsView(testContext, host);
                controls.setTouchControlsForced(true);
                activity.setContentView(controls, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            });
            waitForIdleSync();
            runUi(() -> check(controls.getWidth() > 0 && controls.getHeight() > 0,
                    "The laboratory View was not laid out"));

            runCase("multitouch_joystick_attack_camera_reordered_indices", this::multitouch);
            runCase("cancel_releases_all_and_ignores_late_moves", this::cancelAndLateMoves);
            runCase("focus_loss_releases_all_and_fresh_down_works", this::focusLoss);
            runCase("button_slip_outside_releases_without_repress", this::buttonSlip);
            runCase("same_button_two_fingers_keep_last_owner", this::sharedButton);
            runCase("menu_uses_absolute_pointer_and_balanced_mouse_up", this::menuPointer);
            runCase("menu_cancel_and_focus_loss_release_mouse", this::menuCancel);
            runCase("edit_mode_moves_controls_without_game_events", this::editMode);
            runCase("mode_changes_release_game_keys", this::modeChanges);
            runCase("physical_mouse_over_button_bypasses_touch_controls", this::physicalMouse);
            runCase("menu_click_survives_game_capture_until_up_and_cancel", this::menuClickModeTransition);
            runCase("chat_uses_host_action_and_cancel_does_not_open_chat", this::chatAction);
            runCase("gui_scroll_buttons_send_wheel_steps_without_clicking", this::guiScroll);
            runCase("physical_controller_mode_matches_real_android_inventory", this::controllerInventory);
            runCase("custom_buttons_visibility_storage_and_held_deletion", this::customButtons);
        } catch (Throwable failure) {
            recordFailure("instrumentation_setup", failure);
        } finally {
            if (activity != null) {
                try {
                    captureLabScreenshot();
                } catch (Throwable failure) {
                    // A screenshot is supplementary evidence, not a test prerequisite.
                    transcript.append("SCREENSHOT_SKIPPED ").append(failure).append('\n');
                }
                try {
                    runUi(() -> {
                        if (controls != null) controls.releaseAll();
                        activity.getSharedPreferences(TEST_PREFERENCES, Activity.MODE_PRIVATE)
                                .edit().clear().commit();
                        activity.finish();
                    });
                } catch (Throwable failure) {
                    recordFailure("instrumentation_cleanup", failure);
                }
            }
            Bundle result = new Bundle();
            result.putInt("tests", testCount);
            result.putInt("passed", passed);
            result.putInt("failed", failures.size());
            result.putString("summary", passed + "/" + testCount + " controls tests passed; "
                    + failures.size() + " failure(s). Minecraft was not started.");
            result.putStringArrayList("failures", failures);
            if (screenshotPath != null) result.putString("screenshot", screenshotPath);
            result.putString("screenshot_note", "Simulated controls laboratory only; "
                    + "this is not Minecraft and does not validate actual gameplay or performance.");
            result.putString("stream", "\n" + transcript);
            finish(failures.isEmpty() ? Activity.RESULT_OK : Activity.RESULT_CANCELED, result);
        }
    }

    private void captureLabScreenshot() throws Throwable {
        File directory = getTargetContext().getExternalFilesDir(null);
        if (directory == null) return;
        File output = new File(directory, "moteur-controles.png");
        // Do not accidentally report an image left by an earlier run.
        if (output.exists() && !output.delete()) return;
        final boolean[] eligible = new boolean[1];
        runUi(() -> {
            eligible[0] = visibleResumedLab();
            if (eligible[0]) {
                controls.setTouchControlsForced(true);
                controls.setEditing(false);
                controls.setInGame(true);
                controls.releaseAll();
                controls.setBackgroundColor(Color.rgb(12, 24, 29));
            }
        });
        if (!eligible[0]) return;
        waitForIdleSync();
        runUi(() -> eligible[0] = visibleResumedLab());
        if (!eligible[0]) return;
        Bitmap screenshot = getUiAutomation().takeScreenshot();
        if (screenshot == null) return;
        try {
            // Discard the capture if the laboratory lost focus while capture was in flight.
            runUi(() -> eligible[0] = visibleResumedLab());
            if (!eligible[0]) return;
            try (FileOutputStream stream = new FileOutputStream(output)) {
                if (!screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                    throw new IllegalStateException("Unable to encode laboratory screenshot");
                }
            }
            screenshotPath = output.getAbsolutePath();
            transcript.append("SCREENSHOT ").append(screenshotPath).append('\n')
                    .append("Screenshot shows the simulated controls laboratory, not Minecraft.\n");
        } finally {
            screenshot.recycle();
        }
    }

    private boolean visibleResumedLab() {
        return activity instanceof TouchLabActivity && resumedActivity == activity
                && !activity.isFinishing() && !activity.isDestroyed()
                && activity.hasWindowFocus() && controls != null
                && controls.isAttachedToWindow() && controls.isShown()
                && controls.hasWindowFocus() && controls.getWidth() > 0 && controls.getHeight() > 0;
    }

    private void runCase(String name, UiAction action) {
        testCount++;
        try {
            runUi(() -> {
                reset();
                action.run();
                controls.releaseAll();
                check(host.held.isEmpty(), "Host still holds keys after cleanup: " + host.held);
                check(!host.mouseDown, "Host still holds a mouse button after cleanup");
                check(controls.activePointers() == 0, "View still captures a pointer after cleanup");
            });
            passed++;
            transcript.append("PASS ").append(name).append('\n');
            Bundle status = new Bundle();
            status.putString("stream", "PASS " + name + "\n");
            sendStatus(0, status);
        } catch (Throwable failure) {
            recordFailure(name, failure);
        }
    }

    private void reset() {
        controls.releaseAll();
        controls.setTouchControlsForced(true);
        controls.setLoading(false);
        controls.setEditing(false);
        controls.setInGame(true);
        controls.resumeControls();
        controls.onWindowFocusChanged(true);
        host.clear();
        eventTime = SystemClock.uptimeMillis();
        downTime = eventTime;
    }

    private void multitouch() {
        Finger stick = stickForward(3);
        Finger attack = center(8, "attack");
        Finger look = freePoint(12);
        touch(MotionEvent.ACTION_DOWN, 0, stick);
        check(controls.isPressed(FORWARD), "Joystick DOWN did not press forward");
        touch(MotionEvent.ACTION_POINTER_DOWN, 1, stick, attack);
        check(controls.isPressed(ATTACK), "Attack finger did not press attack");
        touch(MotionEvent.ACTION_POINTER_DOWN, 2, stick, attack, look);
        check(controls.activePointers() == 3, "Three fingers were not independently captured");
        Finger look1 = look.offset(15f, -7f);
        touch(MotionEvent.ACTION_MOVE, 0, stick, attack, look1);
        check(host.looks.size() == 1, "Camera did not receive exactly one relative movement");
        check(host.looks.get(0)[0] > 0f && host.looks.get(0)[1] < 0f,
                "Camera movement had incorrect direction");
        check(controls.isPressed(FORWARD) && controls.isPressed(ATTACK),
                "Moving the camera interfered with held controls");

        // ID 3 leaves at index 0 while IDs 8 and 12 remain in the same event.
        touch(MotionEvent.ACTION_POINTER_UP, 0, stick, attack, look1);
        check(!controls.isPressed(FORWARD) && !host.held.contains(FORWARD),
                "Forward stayed held after the joystick finger was raised");
        check(controls.isPressed(ATTACK), "Raising the joystick released the attack finger");
        near(0f, controls.joystickOffsetX(), "Joystick knob X did not recenter");
        near(0f, controls.joystickOffsetY(), "Joystick knob Y did not recenter");
        check(controls.activePointers() == 2, "Remaining capture count should be two");

        // Deliberately reorder remaining indices: ID 12 is now index 0 and ID 8 index 1.
        Finger look2 = look.offset(30f, -12f);
        touch(MotionEvent.ACTION_MOVE, 0, look2, attack);
        check(host.looks.size() == 2, "Camera lost its finger after pointer indices changed");
        check(!controls.isPressed(FORWARD) && controls.isPressed(ATTACK),
                "Reordered pointer indices changed key ownership");
        touch(MotionEvent.ACTION_POINTER_UP, 1, look2, attack);
        check(!controls.isPressed(ATTACK), "Attack stayed held after its own pointer UP");
        check(controls.activePointers() == 1, "Camera should remain captured after attack UP");
        touch(MotionEvent.ACTION_UP, 0, look2);
        assertReleased();
    }

    private void cancelAndLateMoves() {
        Finger stick = stickForward(3);
        Finger attack = center(8, "attack");
        Finger look = freePoint(12);
        touch(MotionEvent.ACTION_DOWN, 0, stick);
        touch(MotionEvent.ACTION_POINTER_DOWN, 1, stick, attack);
        touch(MotionEvent.ACTION_POINTER_DOWN, 2, stick, attack, look);
        touch(MotionEvent.ACTION_MOVE, 0, stick, attack, look.offset(4f, 3f));
        int looksBefore = host.looks.size();
        touch(MotionEvent.ACTION_CANCEL, 0, stick, attack, look);
        assertReleased();
        int keysAfterCancel = host.keyEvents.size();
        touch(MotionEvent.ACTION_MOVE, 0, look.offset(25f, 20f), attack, stick);
        check(host.looks.size() == looksBefore, "Late MOVE after CANCEL moved the camera");
        check(host.keyEvents.size() == keysAfterCancel, "Late MOVE after CANCEL generated a key event");
        touch(MotionEvent.ACTION_POINTER_UP, 1, look, attack, stick);
        touch(MotionEvent.ACTION_UP, 0, stick);
        assertReleased();
    }

    private void focusLoss() {
        Finger stick = stickForward(8);
        Finger attack = center(3, "attack");
        Finger look = freePoint(12);
        touch(MotionEvent.ACTION_DOWN, 0, attack);
        touch(MotionEvent.ACTION_POINTER_DOWN, 1, attack, stick);
        touch(MotionEvent.ACTION_POINTER_DOWN, 2, attack, stick, look);
        controls.onWindowFocusChanged(false);
        assertReleased();
        int keysBefore = host.keyEvents.size();
        touch(MotionEvent.ACTION_MOVE, 0, look.offset(30f, 20f), stick, attack);
        check(host.keyEvents.size() == keysBefore && host.looks.isEmpty(),
                "Stale input was accepted after focus loss");
        controls.onWindowFocusChanged(true);
        Finger jump = center(3, "jump");
        touch(MotionEvent.ACTION_DOWN, 0, jump);
        check(controls.isPressed(JUMP), "Fresh input was blocked after focus returned");
        touch(MotionEvent.ACTION_UP, 0, jump);
        assertReleased();
    }

    private void buttonSlip() {
        Finger attack = center(3, "attack");
        Finger outside = freePoint(3);
        touch(MotionEvent.ACTION_DOWN, 0, attack);
        check(controls.isPressed(ATTACK), "Attack did not press before slip test");
        touch(MotionEvent.ACTION_MOVE, 0, outside);
        check(!controls.isPressed(ATTACK), "Sliding outside the attack button left it pressed");
        check(controls.activePointers() == 0, "Slipped button retained a capture");
        int keyEventsAfterSlip = host.keyEvents.size();
        touch(MotionEvent.ACTION_MOVE, 0, attack);
        check(!controls.isPressed(ATTACK) && host.keyEvents.size() == keyEventsAfterSlip,
                "Returning a released finger into the button unexpectedly pressed it again");
        touch(MotionEvent.ACTION_UP, 0, attack);
        assertReleased();
    }

    private void sharedButton() {
        Finger first = center(3, "attack");
        Finger second = center(8, "attack");
        touch(MotionEvent.ACTION_DOWN, 0, first);
        touch(MotionEvent.ACTION_POINTER_DOWN, 1, first, second);
        check(host.keyEvents.size() == 1, "Two owners duplicated the attack DOWN event");
        touch(MotionEvent.ACTION_POINTER_UP, 0, first, second);
        check(controls.isPressed(ATTACK) && host.held.contains(ATTACK),
                "First attack owner released the second owner's key");
        touch(MotionEvent.ACTION_UP, 0, second);
        assertReleased();
        check(host.keyEvents.equals(Arrays.asList(ATTACK + ":true", ATTACK + ":false")),
                "Shared button produced unbalanced events: " + host.keyEvents);
    }

    private void menuPointer() {
        controls.setInGame(false);
        Finger pointer = freePoint(8);
        Finger ignored = pointer.offset(-60f, 10f).withId(3);
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        check(host.mouseDown, "Minecraft menu touch did not press the mouse");
        near(pointer.x, host.pointerX, "Menu pointer X was not absolute");
        near(pointer.y, host.pointerY, "Menu pointer Y was not absolute");
        Finger moved = pointer.offset(29f, 17f);
        touch(MotionEvent.ACTION_MOVE, 0, moved);
        near(moved.x, host.pointerX, "Moving menu pointer X was not absolute");
        near(moved.y, host.pointerY, "Moving menu pointer Y was not absolute");
        touch(MotionEvent.ACTION_POINTER_DOWN, 1, moved, ignored);
        check(controls.activePointers() == 1, "Second menu finger stole the active pointer");
        Finger lifted = moved.offset(2f, 3f);
        touch(MotionEvent.ACTION_POINTER_UP, 0, lifted, ignored);
        check(!host.mouseDown, "Menu pointer UP left the mouse pressed");
        near(lifted.x, host.pointerX, "Menu mouse UP lost final absolute X");
        near(lifted.y, host.pointerY, "Menu mouse UP lost final absolute Y");
        int positionsAfterUp = host.pointerEvents;
        touch(MotionEvent.ACTION_MOVE, 0, ignored.offset(10f, 20f));
        check(host.pointerEvents == positionsAfterUp, "Uncaptured menu finger moved the pointer");
        touch(MotionEvent.ACTION_UP, 0, ignored);
        check(host.mouseEvents.equals(Arrays.asList(true, false)),
                "Menu mouse events were not balanced: " + host.mouseEvents);
        check(host.keyEvents.isEmpty() && host.looks.isEmpty(), "Menu touches generated game input");
        assertReleased();
    }

    private void menuCancel() {
        controls.setInGame(false);
        Finger pointer = freePoint(8);
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        touch(MotionEvent.ACTION_CANCEL, 0, pointer);
        check(!host.mouseDown, "CANCEL did not release the menu mouse");
        int positions = host.pointerEvents;
        touch(MotionEvent.ACTION_MOVE, 0, pointer.offset(20f, 20f));
        check(host.pointerEvents == positions, "Menu MOVE after CANCEL was accepted");
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        controls.onWindowFocusChanged(false);
        check(!host.mouseDown, "Focus loss did not release the menu mouse");
        check(host.mouseEvents.equals(Arrays.asList(true, false, true, false)),
                "Menu cancellation produced unbalanced mouse events: " + host.mouseEvents);
        assertReleased();
    }

    private void editMode() {
        controls.setEditing(true);
        Finger attack = center(8, "attack");
        RectF original = bounds("attack");
        touch(MotionEvent.ACTION_DOWN, 0, attack);
        touch(MotionEvent.ACTION_MOVE, 0, attack.offset(-12f, -10f));
        RectF moved = bounds("attack");
        check(original.centerX() != moved.centerX() || original.centerY() != moved.centerY(),
                "Editing did not move the button");
        // CANCEL intentionally avoids saving a modified layout in user preferences.
        touch(MotionEvent.ACTION_CANCEL, 0, attack);
        Finger stick = center(3, "joystick");
        touch(MotionEvent.ACTION_DOWN, 0, stick);
        touch(MotionEvent.ACTION_MOVE, 0, stick.offset(12f, -8f));
        touch(MotionEvent.ACTION_CANCEL, 0, stick);
        check(host.keyEvents.isEmpty(), "Editing emitted game keys: " + host.keyEvents);
        check(host.looks.isEmpty(), "Editing moved the game camera");
        check(host.pointerEvents == 0 && host.mouseEvents.isEmpty(), "Editing emitted menu input");
        check(host.keyboardRequests == 0 && host.pauseRequests == 0,
                "Dragging a control invoked an action");
        controls.setEditing(false);
        assertReleased();
    }

    private void modeChanges() {
        Finger attack = center(3, "attack");
        touch(MotionEvent.ACTION_DOWN, 0, attack);
        controls.setInGame(false);
        assertReleased();
        controls.setInGame(true);
        Finger jump = center(8, "jump");
        touch(MotionEvent.ACTION_DOWN, 0, jump);
        check(controls.isPressed(JUMP), "Jump was not held before edit mode transition");
        controls.setEditing(true);
        assertReleased();
        touch(MotionEvent.ACTION_MOVE, 0, jump);
        check(!controls.isPressed(JUMP), "Stale MOVE reactivated a key after edit mode transition");
        controls.setEditing(false);
    }

    private void physicalMouse() {
        Finger jump = center(3, "jump");
        touchFromSource(InputDevice.SOURCE_MOUSE, MotionEvent.ACTION_DOWN, 0, jump);
        check(!controls.isPressed(JUMP), "Physical mouse DOWN activated the touch jump button");
        check(controls.activePointers() == 0, "Physical mouse DOWN captured a touch pointer");
        touchFromSource(InputDevice.SOURCE_MOUSE, MotionEvent.ACTION_UP, 0, jump);
        check(host.externalActions.equals(Arrays.asList(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP)),
                "Mouse DOWN/UP were not forwarded to the external-input adapter: " + host.externalActions);
        check(host.keyEvents.isEmpty(), "Physical mouse over jump emitted a touch key: " + host.keyEvents);
        check(host.looks.isEmpty() && host.pointerEvents == 0 && host.mouseEvents.isEmpty(),
                "Physical mouse also entered the touch camera/menu path");
        assertReleased();
    }

    private void menuClickModeTransition() {
        controls.setInGame(false);
        Finger pointer = freePoint(8);
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        controls.setInGame(true);
        check(host.mouseDown && controls.activePointers() == 1,
                "Returning to game capture released the GUI click before its finger UP");
        check(host.mouseEvents.equals(Arrays.asList(true)),
                "Mode transition emitted an early mouse UP: " + host.mouseEvents);
        Finger moved = pointer.offset(18f, 9f);
        touch(MotionEvent.ACTION_MOVE, 0, moved);
        check(host.mouseDown && host.looks.isEmpty(),
                "The retained GUI finger became a game camera gesture");
        touch(MotionEvent.ACTION_UP, 0, moved);
        check(host.mouseEvents.equals(Arrays.asList(true, false)),
                "Retained GUI click did not receive exactly one final mouse UP: " + host.mouseEvents);
        assertReleased();

        Finger jump = center(3, "jump");
        touch(MotionEvent.ACTION_DOWN, 0, jump);
        check(controls.isPressed(JUMP), "A fresh game tap was blocked after the GUI click");
        touch(MotionEvent.ACTION_UP, 0, jump);
        assertReleased();

        // A respawn/menu click can synchronously change cursor capture while the
        // adapter is still handling mouse DOWN. Exercise that ordering too.
        controls.setInGame(false);
        host.mouseDownAction = () -> controls.setInGame(true);
        pointer = freePoint(8);
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        check(controls.isInGame() && host.mouseDown && controls.activePointers() == 1,
                "A cursor change inside mouse DOWN lost the active GUI click");
        touch(MotionEvent.ACTION_CANCEL, 0, pointer);
        assertReleased();
        int positionsAfterCancel = host.pointerEvents;
        touch(MotionEvent.ACTION_MOVE, 0, pointer.offset(30f, 20f));
        check(host.pointerEvents == positionsAfterCancel && host.looks.isEmpty(),
                "A cancelled retained GUI finger generated stale input");

        host.mouseDownAction = null;
        controls.setInGame(false);
        pointer = freePoint(8);
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        touch(MotionEvent.ACTION_UP, 0, pointer);
        check(host.mouseEvents.equals(Arrays.asList(true, false, true, false, true, false)),
                "New GUI tap after respawn/cancellation produced unbalanced mouse events: " + host.mouseEvents);
        check(host.looks.isEmpty(), "GUI clicks generated game camera movement");
        assertReleased();
    }

    private void chatAction() {
        Finger chat = center(8, "chat");
        touch(MotionEvent.ACTION_DOWN, 0, chat);
        check(host.chatRequests == 0, "Chat opened before the action finger was released");
        touch(MotionEvent.ACTION_UP, 0, chat);
        check(host.chatRequests == 1, "Chat button did not call the adapter's chat action exactly once");
        check(host.keyEvents.isEmpty() && host.keyboardRequests == 0,
                "Chat bypassed the adapter with direct key events or an unrelated keyboard request");
        touch(MotionEvent.ACTION_DOWN, 0, chat);
        touch(MotionEvent.ACTION_CANCEL, 0, chat);
        check(host.chatRequests == 1, "A cancelled Chat action still opened chat");
        touch(MotionEvent.ACTION_DOWN, 0, chat);
        touch(MotionEvent.ACTION_UP, 0, chat);
        check(host.chatRequests == 2, "Chat did not remain usable after cancellation");
        check(host.looks.isEmpty() && host.mouseEvents.isEmpty(), "Chat action leaked game/menu pointer input");
        assertReleased();
    }

    private void guiScroll() {
        check(controls.controlBounds("scrollUp") == null && controls.controlBounds("scrollDown") == null,
                "GUI wheel controls were visible while playing");
        controls.setInGame(false);
        Finger up = center(8, "scrollUp");
        Finger down = center(3, "scrollDown");
        touch(MotionEvent.ACTION_DOWN, 0, up);
        check(host.scrollEvents.isEmpty(), "Wheel action ran before its finger UP");
        touch(MotionEvent.ACTION_UP, 0, up);
        check(host.scrollEvents.size() == 1 && host.scrollEvents.get(0) > 0f,
                "Scroll up did not send a positive wheel step");
        touch(MotionEvent.ACTION_DOWN, 0, down);
        touch(MotionEvent.ACTION_UP, 0, down);
        check(host.scrollEvents.size() == 2 && host.scrollEvents.get(1) < 0f,
                "Scroll down did not send a negative wheel step");
        touch(MotionEvent.ACTION_DOWN, 0, up);
        touch(MotionEvent.ACTION_CANCEL, 0, up);
        check(host.scrollEvents.size() == 2, "A cancelled wheel action still scrolled");
        check(host.keyEvents.isEmpty() && host.mouseEvents.isEmpty() && host.looks.isEmpty(),
                "GUI wheel buttons also clicked or moved the game camera");
        controls.setInGame(true);
        check(controls.controlBounds("scrollUp") == null && controls.controlBounds("scrollDown") == null,
                "GUI wheel controls remained visible after returning to the game");
        assertReleased();
    }

    private void controllerInventory() {
        InputManager manager = activity.getSystemService(InputManager.class);
        check(manager != null, "Android InputManager is unavailable");
        int controllers = 0;
        for (int id : manager.getInputDeviceIds()) {
            InputDevice device = manager.getInputDevice(id);
            if (device != null && !device.isVirtual()
                    && (device.supportsSource(InputDevice.SOURCE_GAMEPAD)
                    || device.supportsSource(InputDevice.SOURCE_JOYSTICK))) controllers++;
        }
        boolean expected = controllers > 0;
        controls.setTouchControlsForced(false);
        controls.resumeControls();
        check(controls.isControllerConnected() == expected,
                "Touch surface controller detection differs from the real Android inventory");
        check(controls.controlBounds("menu") != null, "Controller mode hid the Yapapouaiye menu");
        check((controls.controlBounds("joystick") == null) == expected,
                "Joystick visibility did not follow connected controller inventory");
        for (String name : new String[] {"jump", "attack", "use", "inventory", "chat", "slot0", "slot8"})
            check((controls.controlBounds(name) == null) == expected,
                    "Game button visibility did not follow controller inventory: " + name);

        controls.setInGame(false);
        Finger pointer = freePoint(8);
        touch(MotionEvent.ACTION_DOWN, 0, pointer);
        touch(MotionEvent.ACTION_UP, 0, pointer);
        check(host.mouseEvents.equals(Arrays.asList(true, false)),
                "Automatic input mode prevented direct GUI touch");
        controls.setEditing(true);
        check(controls.controlBounds("joystick") != null && controls.controlBounds("jump") != null,
                "A connected controller made the touch layout editor inaccessible");
        controls.setEditing(false);
        controls.setTouchControlsForced(true);
        controls.setInGame(true);
        check(controls.controlBounds("joystick") != null && controls.controlBounds("jump") != null,
                "The explicit touch laboratory mode did not restore touch controls");
        transcript.append("CONTROLLER_INVENTORY ").append(controllers)
                .append(" physical controller(s); actual plug/unplug was not simulated.\n");
        assertReleased();
    }

    private void customButtons() {
        CustomButtons store=new CustomButtons(controls.getContext());List<TouchButton> before=store.load();
        TouchButton fixed=TouchButton.nexlux(),touchOnly=new TouchButton("custom-test","Test G",34,false);
        try {
            store.save(Arrays.asList(fixed,touchOnly));controls.reloadSettings();controls.setTouchControlsForced(false);
            check(controls.controlBounds(fixed.id)!=null,"Fixed NexLux button disappeared with controller");
            check((controls.controlBounds(touchOnly.id)!=null)==!controls.isControllerConnected(),"Touch-only button visibility ignored controller inventory");
            List<TouchButton> loaded=store.load();check(loaded.size()==2 && loaded.get(1).key==34 && !loaded.get(1).always,"Custom button profile did not round trip");
            Finger finger=center(9,fixed.id);touch(MotionEvent.ACTION_DOWN,0,finger);check(host.held.contains(fixed.token()),"Fixed button did not press its keyboard token");
            store.save(Arrays.asList(touchOnly));controls.reloadSettings();check(!host.held.contains(fixed.token()),"Deleting a held button left its key down");check(controls.controlBounds(fixed.id)==null,"Deleted button stayed in layout");
            controls.setTouchControlsForced(true);check(controls.controlBounds(touchOnly.id)!=null,"Touch preview failed to show touch-only custom button");
            finger=center(9,touchOnly.id);touch(MotionEvent.ACTION_DOWN,0,finger);touch(MotionEvent.ACTION_CANCEL,0,finger);check(host.held.isEmpty(),"Custom touch key stayed pressed after CANCEL");
            controls.setEditing(true);RectF old=bounds(touchOnly.id);finger=center(9,touchOnly.id);touch(MotionEvent.ACTION_DOWN,0,finger);Finger moved=new Finger(9,finger.x+100,finger.y+90);touch(MotionEvent.ACTION_MOVE,0,moved);touch(MotionEvent.ACTION_UP,0,moved);controls.reloadSettings();RectF next=bounds(touchOnly.id);check(next.centerX()>old.centerX()+50,"Custom button position was not saved");
            assertReleased();
        } finally {store.save(before);controls.setEditing(false);controls.setTouchControlsForced(true);controls.reloadSettings();}
    }
    private Finger center(int id, String controlId) {
        RectF rect = bounds(controlId);
        return new Finger(id, rect.centerX(), rect.centerY());
    }

    private Finger stickForward(int id) {
        RectF rect = bounds("joystick");
        return new Finger(id, rect.centerX(), rect.centerY() - rect.height() * .32f);
    }

    private RectF bounds(String controlId) {
        RectF rect = controls.controlBounds(controlId);
        check(rect != null && rect.width() > 0f && rect.height() > 0f,
                "Missing control bounds: " + controlId);
        return rect;
    }

    /** Selects a camera/menu point that avoids buttons and allows small test movements. */
    private Finger freePoint(int id) {
        float width = controls.getWidth(), height = controls.getHeight();
        for (float yf : new float[] {.40f, .50f, .30f, .60f}) {
            for (float xf : new float[] {.52f, .42f, .62f, .32f, .72f}) {
                float x = width * xf, y = height * yf;
                boolean clear = true;
                RectF path = new RectF(x - 65f, y - 25f, x + 40f, y + 40f);
                for (String name : CONTROL_IDS) {
                    RectF control = controls.controlBounds(name);
                    if (control != null && RectF.intersects(path, control)) {
                        clear = false;
                        break;
                    }
                }
                if (clear) return new Finger(id, x, y);
            }
        }
        throw new AssertionError("No free camera/menu test area in " + width + "x" + height);
    }

    private void touch(int action, int actionIndex, Finger... fingers) {
        touchFromSource(InputDevice.SOURCE_TOUCHSCREEN, action, actionIndex, fingers);
    }

    private void touchFromSource(int source, int action, int actionIndex, Finger... fingers) {
        check(fingers.length > 0 && actionIndex < fingers.length, "Invalid synthetic touch");
        eventTime++;
        if (action == MotionEvent.ACTION_DOWN) downTime = eventTime;
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[fingers.length];
        MotionEvent.PointerCoords[] coordinates = new MotionEvent.PointerCoords[fingers.length];
        for (int i = 0; i < fingers.length; i++) {
            properties[i] = new MotionEvent.PointerProperties();
            properties[i].id = fingers[i].id;
            properties[i].toolType = source == InputDevice.SOURCE_MOUSE
                    ? MotionEvent.TOOL_TYPE_MOUSE : MotionEvent.TOOL_TYPE_FINGER;
            coordinates[i] = new MotionEvent.PointerCoords();
            coordinates[i].x = fingers[i].x;
            coordinates[i].y = fingers[i].y;
            coordinates[i].pressure = 1f;
            coordinates[i].size = 1f;
        }
        int indexedAction = action;
        if (action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_POINTER_UP) {
            indexedAction |= actionIndex << MotionEvent.ACTION_POINTER_INDEX_SHIFT;
        }
        int buttons = source == InputDevice.SOURCE_MOUSE && action != MotionEvent.ACTION_UP
                && action != MotionEvent.ACTION_CANCEL ? MotionEvent.BUTTON_PRIMARY : 0;
        MotionEvent event = MotionEvent.obtain(downTime, eventTime, indexedAction,
                fingers.length, properties, coordinates, 0, buttons, 1f, 1f,
                0, 0, source, 0);
        try {
            check(controls.dispatchTouchEvent(event), "View rejected touch action " + indexedAction);
        } finally {
            event.recycle();
        }
    }

    private void assertReleased() {
        check(controls.activePointers() == 0, "Pointers stayed captured: " + controls.activePointers());
        check(host.held.isEmpty(), "Host keys stayed held: " + host.held);
        check(!controls.isPressed(FORWARD) && !controls.isPressed(ATTACK) && !controls.isPressed(JUMP),
                "Input engine still reports a pressed game key");
        check(!host.mouseDown, "Host mouse button stayed held");
        near(0f, controls.joystickOffsetX(), "Joystick X did not recenter");
        near(0f, controls.joystickOffsetY(), "Joystick Y did not recenter");
    }

    private void runUi(UiAction action) throws Throwable {
        final Throwable[] failure = new Throwable[1];
        runOnMainSync(() -> {
            try {
                action.run();
            } catch (Throwable caught) {
                failure[0] = caught;
            }
        });
        if (failure[0] != null) throw failure[0];
    }

    private void recordFailure(String name, Throwable failure) {
        String message = name + ": " + Log.getStackTraceString(failure);
        failures.add(message);
        transcript.append("FAIL ").append(message).append('\n');
        Bundle status = new Bundle();
        status.putString("stream", "FAIL " + message + "\n");
        sendStatus(0, status);
    }

    private static void near(float expected, float actual, String message) {
        check(Math.abs(expected - actual) <= .01f,
                message + ": expected=" + expected + ", actual=" + actual);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private interface UiAction { void run() throws Throwable; }

    private static final class Finger {
        final int id;
        final float x;
        final float y;
        Finger(int id, float x, float y) { this.id = id; this.x = x; this.y = y; }
        Finger offset(float dx, float dy) { return new Finger(id, x + dx, y + dy); }
        Finger withId(int value) { return new Finger(value, x, y); }
    }

    private static final class FakeHost implements TouchControlsView.Host {
        final Set<Integer> held = new HashSet<>();
        final List<String> keyEvents = new ArrayList<>();
        final List<float[]> looks = new ArrayList<>();
        final List<Boolean> mouseEvents = new ArrayList<>();
        final List<Integer> externalActions = new ArrayList<>();
        final List<Float> scrollEvents = new ArrayList<>();
        float pointerX, pointerY;
        int pointerEvents, keyboardRequests, pauseRequests, chatRequests;
        boolean mouseDown;
        Runnable mouseDownAction;

        @Override public void key(int code, boolean down) {
            boolean changed = down ? held.add(code) : held.remove(code);
            check(changed, "Host received duplicate key state " + code + ":" + down);
            keyEvents.add(code + ":" + down);
        }

        @Override public void look(float dx, float dy) { looks.add(new float[] {dx, dy}); }
        @Override public void pointer(float x, float y) {
            pointerX = x;
            pointerY = y;
            pointerEvents++;
        }
        @Override public void mouse(boolean down) {
            check(mouseDown != down, "Host received duplicate mouse state " + down);
            mouseDown = down;
            mouseEvents.add(down);
            if (down && mouseDownAction != null) mouseDownAction.run();
        }
        @Override public void keyboard() { keyboardRequests++; }
        @Override public void pauseGame() { pauseRequests++; }
        @Override public void chat() { chatRequests++; }
        @Override public void scroll(float amount) { scrollEvents.add(amount); }
        @Override public void externalMotion(MotionEvent event) {
            check(event.isFromSource(InputDevice.SOURCE_MOUSE),
                    "Touchscreen event was sent to the external mouse adapter");
            externalActions.add(event.getActionMasked());
        }

        void clear() {
            held.clear();
            keyEvents.clear();
            looks.clear();
            mouseEvents.clear();
            externalActions.clear();
            scrollEvents.clear();
            pointerX = pointerY = 0f;
            pointerEvents = keyboardRequests = pauseRequests = chatRequests = 0;
            mouseDown = false;
            mouseDownAction = null;
        }
    }
}
