// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { patchFclInput } = require('../patch-compat.cjs');

const upstream = path.resolve(__dirname, '../../.build/upstream');
const revision = require('../../upstream.json').commit;
const sourcePath = 'FCL/src/main/java/com/tungsten/fcl/control/FCLInput.java';
const original = execFileSync('git', ['-c', `safe.directory=${upstream.replaceAll('\\', '/')}`,
  '-C', upstream, 'show', `${revision}:${sourcePath}`], { encoding: 'utf8', maxBuffer: 1e6 });
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, `Expected one upstream anchor: ${before}`);
  return text.replace(before, after);
}
const patched = patchFclInput(original, replaceOnce);

test('a held stick never releases forward between samples; camera moves once per display frame', () => {
  const begin=patched.indexOf('    private final fr.yapapouaiye.moteur.input.GamepadMovement');
  const end=patched.indexOf('    /** Stop Java-side input producers',begin);
  assert.ok(begin>=0&&end>begin);
  const methods=patched.slice(begin,end);
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'yapapouaiye-stick-'));
  fs.writeFileSync(path.join(folder,'StickHarness.java'),`import java.util.*;import fr.yapapouaiye.moteur.input.GamepadLook;
public class StickHarness {
float lastAxisZ,lastAxisRZ;long lastFrameTime;float cameraX,cameraY;int cameraEvents;
Menu menu=new Menu();Pad gamepad=new Pad();
static class Menu {Menu getMenuSetting(){return this;}float getGamepadDeadzone(){return .15f;}}
static class Button {boolean down;int presses,releases;void update(boolean value){if(down==value)return;down=value;if(value)presses++;else releases++;}}
static class Pad {Button DIRECTION_RIGHT=new Button(),DIRECTION_FORWARD=new Button(),DIRECTION_LEFT=new Button(),DIRECTION_BACKWARD=new Button();Pad getCurrentMap(){return this;}}
void handleMouse(Object event,float scale){cameraEvents++;cameraX+=GamepadLook.delta(lastAxisZ,scale,300);cameraY+=GamepadLook.delta(lastAxisRZ,scale,300);}
${methods}
static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
public static void main(String[] args){StickHarness h=new StickHarness();
for(int i=0;i<1000;i++)h.handleLeftJoyStick((i%5-2)*.02f,-1);
check(h.gamepad.DIRECTION_FORWARD.presses==1&&h.gamepad.DIRECTION_FORWARD.releases==0,"No release during held movement");
h.handleLeftJoyStick(1,-1);h.handleLeftJoyStick(0,-1);
check(h.gamepad.DIRECTION_FORWARD.presses==1&&h.gamepad.DIRECTION_FORWARD.releases==0,"Diagonal retains forward");
h.handleLeftJoyStick(0,0);check(h.gamepad.DIRECTION_FORWARD.releases==1,"Center releases once");
for(int i=0;i<1000;i++)h.handleRightJoyStick(i%2==0?1:.8f,1);
check(h.cameraEvents==0,"Motion events cannot emit camera deltas");
h.handleRightJoyStick(1,1);
for(int i=1;i<=120;i++)h.doTick(i*1000000000L/120);
check(h.cameraEvents==120&&Math.abs(h.cameraX-1800)<.02&&Math.abs(h.cameraY-1800)<.02,"Held camera advances steadily without new input events");
h.handleRightJoyStick(0,0);h.doTick(1016666666L);
check(h.cameraEvents==120,"Center stops camera immediately");
h.handleRightJoyStick(1,0);h.doTick(2016666666L);
check(Math.abs(h.cameraX-1980)<.02,"Delayed frame is bounded to avoid a camera jump");
}}
`);
  try {
    execFileSync('javac',['-encoding','UTF-8','-d',folder,...['GamepadMovement.java','GamepadLook.java'].map(name=>path.resolve(__dirname,'../src/main/java/fr/yapapouaiye/moteur/input',name)),path.join(folder,'StickHarness.java')],{encoding:'utf8',stdio:'pipe'});
    execFileSync('java',['-cp',folder,'StickHarness'],{encoding:'utf8',stdio:'pipe'});
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});

test('fixed overlay and gamepad share holds; resetting a mapper preserves a held overlay key', () => {
  const bridge=fs.readFileSync(path.resolve(__dirname,'../../src/YapapouaiyeGamepad.java'),'utf8');
  const methods=bridge.slice(bridge.indexOf('    public static void sendOwned('),bridge.indexOf('    private static void sendActual('));
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'yapapouaiye-overlay-'));
  fs.writeFileSync(path.join(folder,'OverlayHarness.java'),`import java.util.*;import fr.yapapouaiye.moteur.input.*;
public class OverlayHarness {
static List<String> events=new ArrayList<>();static Map<FCLInput,Holds> sessions=new WeakHashMap<>();
static class FCLInput {void sendKeyEvent(int code,boolean down){sendActual(this,code,down);}}
static class Holds {IdentityHashMap<Object,String> owners=new IdentityHashMap<>();InputState state;int next;Holds(FCLInput input){state=new InputState(new EventSink(){public void key(int c,boolean d){sendActual(input,c,d);}public void look(float x,float y){}});}String owner(Object b){return owners.computeIfAbsent(b,k->"pad-"+(next++));}}
static void sendActual(FCLInput input,int code,boolean down){events.add(code+":"+down);}
${methods}
static void check(String expected){if(!events.toString().equals(expected))throw new AssertionError(events.toString());}
public static void main(String[] args){FCLInput input=new FCLInput();Object pad=new Object();
sendOverlay(input,54,true);sendOwned(input,pad,54,true);sendOwned(input,pad,54,false);check("[54:true]");sendOverlay(input,54,false);check("[54:true, 54:false]");
events.clear();sendOwned(input,pad,54,true);sendOverlay(input,54,true);reset(input);check("[54:true]");sendOverlay(input,54,false);check("[54:true, 54:false]");
events.clear();sendOwned(input,pad,54,true);reset(input);check("[54:true, 54:false]");
}}
`);
  try {execFileSync('javac',['-encoding','UTF-8','-d',folder,...['EventSink.java','InputState.java'].map(name=>path.resolve(__dirname,'../src/main/java/fr/yapapouaiye/moteur/input',name)),path.join(folder,'OverlayHarness.java')],{encoding:'utf8',stdio:'pipe'});execFileSync('java',['-cp',folder,'OverlayHarness'],{encoding:'utf8',stdio:'pipe'});}finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('custom screen keys bypass action remapping and release the exact pressed code', () => {
  const source=fs.readFileSync(path.resolve(__dirname,'../../src/YapapouaiyeGameMenu.java'),'utf8');
  const method=source.slice(source.indexOf('    private void sendMapped('),source.indexOf('    private void sendActual('));
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'yapapouaiye-screen-key-'));
  fs.writeFileSync(path.join(folder,'ScreenKeyHarness.java'),`import java.util.*;import fr.yapapouaiye.moteur.input.*;
public class ScreenKeyHarness {Map<Integer,Integer> pressedMapping=new HashMap<>(),actualHolds=new HashMap<>();Map<Integer,String> bindings=new HashMap<>();List<String> events=new ArrayList<>();
static class GameOption {String get(String n){return "key.keyboard.r";}}static class MinecraftKeyBindingMapper {static int mapBindingToKeycode(String v,int fallback){return 19;}}
GameOption getGameOption(){return new GameOption();}void sendActual(int c,boolean d){events.add(c+":"+d);}
${method}
void check(String expected){if(!events.toString().equals(expected))throw new AssertionError(events.toString());}
public static void main(String[] args){ScreenKeyHarness h=new ScreenKeyHarness();h.bindings.put(57,"jump");
h.sendMapped(57,true);h.sendMapped(10057,true);h.check("[19:true, 57:true]");h.sendMapped(10057,false);h.sendMapped(57,false);h.check("[19:true, 57:true, 57:false, 19:false]");
h.events.clear();h.sendMapped(57,true);h.sendMapped(10019,true);h.sendMapped(57,false);h.check("[19:true]");h.sendMapped(10019,false);h.check("[19:true, 19:false]");
}}
`);
  try {execFileSync('javac',['-encoding','UTF-8','-d',folder,...['KeyboardKeys.java','TouchButton.java','MouseBindings.java'].map(name=>path.resolve(__dirname,'../src/main/java/fr/yapapouaiye/moteur/input',name)),path.join(upstream,'FCL/src/main/java/com/tungsten/fclauncher/keycodes/FCLKeycodes.java'),path.join(folder,'ScreenKeyHarness.java')],{encoding:'utf8',stdio:'pipe'});execFileSync('java',['-cp',folder,'ScreenKeyHarness'],{encoding:'utf8',stdio:'pipe'});}finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('every selectable keyboard key reaches GLFW and has a matching SDL keyboard code', () => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'yapapouaiye-keyboard-'));
  const androidJar=path.resolve(__dirname,'../../.build/sdk/platforms/android-35/android.jar');
  const sources=path.join(upstream,'FCL/src/main/java/com/tungsten/fclauncher/keycodes');
  const bridgeFolder=path.join(folder,'org/lwjgl/glfw');fs.mkdirSync(bridgeFolder,{recursive:true});
  const androidFolder=path.join(folder,'android/view');fs.mkdirSync(androidFolder,{recursive:true});
  fs.writeFileSync(path.join(bridgeFolder,'CallbackBridge.java'),`package org.lwjgl.glfw;
public class CallbackBridge {public static boolean holdingAlt,holdingCapslock,holdingCtrl,holdingNumlock,holdingShift;
public static int getCurrentMods(){return 0;} public static void sendKeyPress(int code){} public static void sendKeyPress(int code,char c,int scan,int mods,boolean down){} }`);
  fs.writeFileSync(path.join(androidFolder,'KeyCharacterMap.java'),`package android.view;
public class KeyCharacterMap {public static final int VIRTUAL_KEYBOARD=-1;public static KeyCharacterMap load(int id){return null;}public KeyEvent[] getEvents(char[] chars){return null;} }`);
  fs.writeFileSync(path.join(folder,'KeyboardHarness.java'),`import fr.yapapouaiye.moteur.input.KeyboardKeys;import com.tungsten.fclauncher.keycodes.*;
public class KeyboardHarness {public static void main(String[] args){for(KeyboardKeys.Key key:KeyboardKeys.ALL){int glfw=LwjglKeycodeMap.convertKeycode(key.code);if(glfw<0)throw new AssertionError("Unmapped GLFW key: "+key.title);int android=EfficientAndroidLWJGLKeycode.getSdlAndroidKeycode(glfw);if(android!=key.android)throw new AssertionError(key.title+": expected Android "+key.android+", got "+android);}System.out.println(KeyboardKeys.ALL.size()+" keyboard keys verified");}}`);
  try {
    execFileSync('javac',['-encoding','UTF-8','-cp',androidJar,'-d',folder,path.join(bridgeFolder,'CallbackBridge.java'),path.join(androidFolder,'KeyCharacterMap.java'),...['FCLKeycodes.java','LwjglGlfwKeycode.java','LwjglKeycodeMap.java','EfficientAndroidLWJGLKeycode.java'].map(name=>path.join(sources,name)),path.resolve(__dirname,'../src/main/java/fr/yapapouaiye/moteur/input/KeyboardKeys.java'),path.join(folder,'KeyboardHarness.java')],{encoding:'utf8',stdio:'pipe'});
    execFileSync('java',['-cp',folder+path.delimiter+androidJar,'KeyboardHarness'],{encoding:'utf8',stdio:'pipe'});
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});

test('camera boost reaches both stick axes, updates live and leaves menu cursor speed unchanged', () => {
  for (const [delta,axis] of [['deltaX','lastAxisZ'],['deltaY','lastAxisRZ']])
    assert.ok(patched.includes(`${delta} = com.tungsten.fcl.yapapouaiye.YapapouaiyeGamepad.cameraDelta(this, ${axis}, deltaTimeScale);`));
  // Execute the actual adapter method, not a second implementation of its routing.
  const bridge = fs.readFileSync(path.resolve(__dirname, '../../src/YapapouaiyeGamepad.java'), 'utf8');
  const method = bridge.slice(bridge.indexOf('    public static float cameraDelta('), bridge.indexOf('    public static void configure('));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yapapouaiye-camera-'));
  const stub = path.join(folder, 'com/tungsten/fclauncher/bridge');fs.mkdirSync(stub,{recursive:true});
  fs.writeFileSync(path.join(stub,'FCLBridge.java'),'package com.tungsten.fclauncher.bridge; public class FCLBridge { public static final int CursorEnabled=1; }');
  fs.writeFileSync(path.join(folder,'CameraHarness.java'), `
import java.util.*;
import fr.yapapouaiye.moteur.input.GamepadLook;
public class CameraHarness {
    static final Map<FCLInput,Holds> sessions=new WeakHashMap<>();
    static class Settings { int percent=300; int lookSensitivity(){return percent;} }
    static class Holds { Settings settings; Holds(FCLInput input){settings=input.settings;} }
    static class Menu { int cursor=0; Menu getMenuSetting(){return this;} double getMouseSensitivity(){return 1;} int getCursorMode(){return cursor;} }
    static class FCLInput { Settings settings=new Settings();Menu menu=new Menu(); Menu getMenu(){return menu;} }
${method}
    static void check(float expected,float actual){if(Math.abs(expected-actual)>.001f)throw new AssertionError(expected+" != "+actual);}
    public static void main(String[] args){
        FCLInput input=new FCLInput();check(30,cameraDelta(input,1,1));
        input.settings.percent=800;check(80,cameraDelta(input,1,1));check(-40,cameraDelta(input,-.5f,1));
        input.menu.cursor=1;check(10,cameraDelta(input,1,1));
        input.settings.percent=2000;check(10,cameraDelta(input,1,1));
        input.menu.cursor=0;check(200,cameraDelta(input,1,1));check(0,cameraDelta(input,0,1));
    }
}
`);
  try {
    execFileSync('javac',['-encoding','UTF-8','-d',folder,path.join(stub,'FCLBridge.java'),path.resolve(__dirname,'../src/main/java/fr/yapapouaiye/moteur/input/GamepadLook.java'),path.join(folder,'CameraHarness.java')],{encoding:'utf8',stdio:'pipe'});
    execFileSync('java',['-cp',folder,'CameraHarness'],{encoding:'utf8',stdio:'pipe'});
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});

test('rebuilds from the pinned original are deterministic; changed or already patched inputs fail', () => {
  assert.equal(patchFclInput(original, replaceOnce), patched);
  assert.throws(() => patchFclInput(patched, replaceOnce), /Expected one upstream anchor/);
  assert.throws(() => patchFclInput(original.replace('    private Choreographer choreographer;', ''), replaceOnce),
    /Expected one upstream anchor/);
});

test('existing pause/focus reset hooks stop Java producers and resume only permits fresh input', () => {
  assert.match(patched, /public void stopCaptureWatchdog\(\) \{\n        gamepadInputPaused = true;\n        resetGamepadState\(\);/);
  assert.match(patched, /public void startCaptureWatchdog\(\) \{\n        gamepadInputPaused = false;/);
  assert.match(patched, /public void resetExternalMouseState\(\) \{\n        resetGamepadState\(\);/);
  assert.match(patched, /startGamepadTick\(event.getDeviceId\(\)\)[\s\S]*return gamepad.handleMotionEventInput\(event\);/);
  assert.match(patched, /startGamepadTick\(event.getDeviceId\(\)\)[\s\S]*return gamepad.handleKeyEvent\(event\);/);
});

test('generated Java lifecycle releases axes/buttons and rejects stale frames, pause, focus loss and disconnect', () => {
  // Compile the actual generated helper methods against small API doubles. This
  // exercises callback ownership and reset behavior without an Android device.
  const begin = patched.indexOf('    /** Stop Java-side input producers');
  const end = patched.indexOf('    public void resetMapper() {', begin);
  assert.ok(begin >= 0 && end > begin);
  const helpers = patched.slice(begin, end);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yapapouaiye-gamepad-'));
  const buttonFolder = path.join(folder, 'com/tungsten/fcl/control/gamepad');
  fs.mkdirSync(buttonFolder, { recursive: true });
  fs.writeFileSync(path.join(buttonFolder, 'GamepadEmulatedButton.java'), `
package com.tungsten.fcl.control.gamepad;
public class GamepadEmulatedButton {
    public int resets;
    public void resetButtonState() { resets++; }
}
`);
  const ownFolder=path.join(folder,'com/tungsten/fcl/yapapouaiye');fs.mkdirSync(ownFolder,{recursive:true});
  fs.writeFileSync(path.join(ownFolder,'YapapouaiyeGamepad.java'),'package com.tungsten.fcl.yapapouaiye; public final class YapapouaiyeGamepad { public static void reset(Object input) {} }');
  fs.writeFileSync(path.join(folder, 'LifecycleHarness.java'), `
import java.util.HashSet;
import java.util.Set;
import com.tungsten.fcl.control.gamepad.GamepadEmulatedButton;
public class LifecycleHarness {
    private Choreographer choreographer;
    private Choreographer.FrameCallback gamepadFrameCallback;
    private boolean gamepadTickRunning;
    private boolean gamepadInputPaused;
    private int gamepadDeviceId = -1;
    private float lastAxisZ, lastAxisRZ;
    private int currentDirection = -1;
    private long lastFrameTime;
    private View focusableView = new View();
    private Menu menu = new Menu();
    private Gamepad gamepad;
    private int ticks;
    private void checkGamepad() { if (gamepad == null) gamepad = new Gamepad(); }
    private final fr.yapapouaiye.moteur.input.GamepadMovement gamepadMovement = new fr.yapapouaiye.moteur.input.GamepadMovement();
    private void doTick(long time) { ticks++; }
${helpers}
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        LifecycleHarness input = new LifecycleHarness();
        InputDevice.devices.add(7);
        InputDevice.devices.add(8);
        check(input.startGamepadTick(7), "Initial gamepad input accepted");
        Choreographer.FrameCallback oldFrame = input.gamepadFrameCallback;
        Gamepad oldPad = input.gamepad;
        input.lastAxisZ = 1; input.lastAxisRZ = 1; input.currentDirection = 2;
        input.resetGamepadState();
        check(input.choreographer.removals == 1, "Pending callback removed");
        check(!input.gamepadTickRunning && input.gamepadFrameCallback == null, "Loop stopped");
        check(input.lastAxisZ == 0 && input.lastAxisRZ == 0 && input.currentDirection == -1
                && input.lastFrameTime == 0, "Axis and timing caches reset");
        for (GamepadEmulatedButton button : oldPad.getCurrentMap().getButtons())
            check(button.resets == 1, "Every mapped button/direction released");
        check(input.gamepad == null, "Private mapper axis caches discarded");
        int posts = input.choreographer.posts;
        oldFrame.doFrame(0);
        check(input.ticks == 0 && posts == input.choreographer.posts, "Cancelled frame stays inert");

        check(input.startGamepadTick(7), "New input restarts cleanly");
        Choreographer.FrameCallback newFrame = input.gamepadFrameCallback;
        oldFrame.doFrame(0);
        check(input.ticks == 0, "Old frame cannot tick a newer session");
        newFrame.doFrame(0);
        check(input.ticks == 1, "Current callback ticks once");
        InputDevice.devices.remove(7);
        newFrame.doFrame(0);
        check(!input.gamepadTickRunning && input.gamepad == null && input.ticks == 1,
                "Disconnect stops camera before another tick");

        check(input.startGamepadTick(8), "Another connected device starts");
        input.focusableView.focused = false;
        input.gamepadFrameCallback.doFrame(0);
        check(!input.gamepadTickRunning && input.gamepad == null, "Focus loss stops camera");
        check(!input.startGamepadTick(8), "No restart while unfocused");
        input.focusableView.focused = true;
        input.gamepadInputPaused = true;
        check(!input.startGamepadTick(8), "Queued input cannot restart a paused activity");
        input.gamepadInputPaused = false;
        check(input.startGamepadTick(8), "Fresh input resumes");
        check(input.lastFrameTime > 0, "Resume establishes a fresh clock baseline");

        InputDevice.devices.add(7);
        Gamepad replaced = input.gamepad;
        check(input.startGamepadTick(7), "Device switch accepted");
        check(input.gamepad != replaced, "Device switch uses a fresh mapper");
        for (GamepadEmulatedButton button : replaced.getCurrentMap().getButtons())
            check(button.resets == 1, "Switch releases previous device inputs");
        input.menu.enabled = false;
        input.gamepadFrameCallback.doFrame(0);
        check(!input.gamepadTickRunning, "Disabling mapped controls stops callback");
        input.menu.enabled = true;
        SdlSettings.mode = GamepadInputMode.SDL_DIRECT;
        check(!input.startGamepadTick(7), "SDL direct mode cannot start mapping callback");
    }
    static class View {
        boolean focused = true;
        boolean isAttachedToWindow() { return true; }
        boolean hasWindowFocus() { return focused; }
    }
    static class Activity {
        boolean isDestroyed() { return false; }
        boolean isFinishing() { return false; }
    }
    static class Menu {
        boolean enabled = true;
        Activity getActivity() { return new Activity(); }
        boolean isGamepadControl() { return enabled; }
    }
    static class InputDevice {
        static final Set<Integer> devices = new HashSet<>();
        static InputDevice getDevice(int id) { return devices.contains(id) ? new InputDevice() : null; }
    }
    enum GamepadInputMode { MAPPED, SDL_DIRECT }
    static class SdlSettings {
        static GamepadInputMode mode = GamepadInputMode.MAPPED;
        static SdlSettings getGamepadInputMode() { return new SdlSettings(); }
        GamepadInputMode getValue() { return mode; }
    }
    static class Gamepad {
        private final Map map = new Map();
        Map getCurrentMap() { return map; }
    }
    static class Map {
        final GamepadEmulatedButton[] buttons = {new GamepadEmulatedButton(), new GamepadEmulatedButton()};
        GamepadEmulatedButton[] getButtons() { return buttons; }
    }
    static class Choreographer {
        int posts, removals;
        interface FrameCallback { void doFrame(long time); }
        static Choreographer getInstance() { return new Choreographer(); }
        void postFrameCallback(FrameCallback callback) { posts++; }
        void removeFrameCallback(FrameCallback callback) { removals++; }
    }
}
`);
  try {
    execFileSync('javac', ['-encoding', 'UTF-8', '-d', folder,
      path.resolve(__dirname,'../src/main/java/fr/yapapouaiye/moteur/input/GamepadMovement.java'), path.join(buttonFolder, 'GamepadEmulatedButton.java'), path.join(ownFolder,'YapapouaiyeGamepad.java'), path.join(folder, 'LifecycleHarness.java')],
    { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('java', ['-cp', folder, 'LifecycleHarness'], { encoding: 'utf8', stdio: 'pipe' });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
