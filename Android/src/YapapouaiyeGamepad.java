/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.yapapouaiye;
import com.tungsten.fcl.control.FCLInput;
import com.tungsten.fcl.control.gamepad.*;
import com.tungsten.fcl.game.sdl.*;
import com.tungsten.fcl.setting.GameOption;
import com.tungsten.fclauncher.keycodes.MinecraftKeyBindingMapper;
import fr.yapapouaiye.moteur.android.GamepadSettings;
import fr.yapapouaiye.moteur.input.*;
import java.lang.ref.WeakReference;
import java.util.*;

/** Joysticks/remapping remain in the compatibility layer; action selection belongs to Yapapouaiye. */
public final class YapapouaiyeGamepad {
    private static final Map<FCLInput,Holds> sessions=new WeakHashMap<>();
    private static final class Holds {
        final IdentityHashMap<Object,String> owners=new IdentityHashMap<>();
        final InputState state;
        final GamepadSettings settings;
        int next;
        Holds(FCLInput input) {
            settings=new GamepadSettings(input.getMenu().getActivity());
            WeakReference<FCLInput> reference=new WeakReference<>(input);
            state=new InputState(new EventSink() {
                public void key(int code,boolean down) { FCLInput target=reference.get();if(target!=null)sendActual(target,code,down); }
                public void look(float x,float y) { }
            });
        }
        String owner(Object button) { return owners.computeIfAbsent(button,key -> "gamepad-"+(next++)); }
    }
    private YapapouaiyeGamepad() { }
    public static float cameraDelta(FCLInput input,float axis,float frameScale) {
        float base=(float)input.getMenu().getMenuSetting().getMouseSensitivity();
        // Keep the menu cursor at its original speed, regardless of camera boost.
        if(input.getMenu().getCursorMode()==com.tungsten.fclauncher.bridge.FCLBridge.CursorEnabled)return axis*frameScale*10f*base;
        Holds holds=sessions.computeIfAbsent(input,Holds::new);
        return GamepadLook.delta(axis,frameScale,holds.settings.lookSensitivity())*base;
    }
    public static void configure(Gamepad pad) {
        FCLInput input=pad.getFclInput();reset(input);
        SdlSettings.setGamepadInputMode(GamepadInputMode.MAPPED);SdlSettings.setGamepadInputModePrompted(true);
        GamepadMap map=GamepadMap.Companion.getDefaultGameMap();
        GamepadButton[] buttons={map.getBUTTON_A(),map.getBUTTON_B(),map.getBUTTON_X(),map.getBUTTON_Y(),map.getSHOULDER_LEFT(),map.getSHOULDER_RIGHT(),map.getTRIGGER_LEFT(),map.getTRIGGER_RIGHT(),map.getTHUMBSTICK_LEFT(),map.getTHUMBSTICK_RIGHT(),map.getBUTTON_START(),map.getBUTTON_SELECT(),map.getDPAD_UP(),map.getDPAD_DOWN(),map.getDPAD_LEFT(),map.getDPAD_RIGHT()};
        GamepadSettings settings=new GamepadSettings(pad.getContext());
        for(int i=0;i<buttons.length;i++) {
            String action=settings.action(i);int fallback=GamepadBindings.fallbackCode(action);
            int code=mapped(input,GamepadBindings.binding(action),fallback);
            buttons[i].setKeycodes(new ArrayList<>(code<0?Collections.emptyList():Collections.singletonList(code)));
            buttons[i].setToggleable(false);
        }
        GamepadEmulatedButton[] directions={map.getDIRECTION_FORWARD(),map.getDIRECTION_BACKWARD(),map.getDIRECTION_LEFT(),map.getDIRECTION_RIGHT()};
        String[] names={"forward","back","left","right"};int[] defaults={17,31,30,32};
        for(int i=0;i<directions.length;i++)directions[i].setKeycodes(new ArrayList<>(Collections.singletonList(mapped(input,"key_key."+names[i],defaults[i]))));
        pad.setCurrentMap(map);
    }
    private static int mapped(FCLInput input,String binding,int fallback) {
        if(fallback<0 || binding==null)return fallback;
        GameOption option=input.getMenu().getGameOption();String value=option==null?null:option.get(binding);
        Integer mouse=MouseBindings.code(value);
        int code=mouse!=null?mouse:MinecraftKeyBindingMapper.mapBindingToKeycode(value,fallback);
        return code==240?-1:code;
    }
    public static void sendOwned(FCLInput input,Object button,int code,boolean down) {
        if(input==null || code<0)return;
        if(code==1003 || code==1004) {if(down)input.sendKeyEvent(code,true);return;}
        Holds holds=sessions.computeIfAbsent(input,Holds::new);String owner=holds.owner(button);
        if(down)holds.state.press(owner,code);else holds.state.release(owner,code);
    }
    public static void sendOverlay(FCLInput input,int code,boolean down) {
        Holds holds=sessions.computeIfAbsent(input,Holds::new);
        if(down)holds.state.press("overlay",code);else holds.state.release("overlay",code);
    }
    public static void reset(FCLInput input) {
        Holds holds=sessions.get(input);if(holds==null)return;
        // Mapper refresh must not release a fixed overlay button held beside the controller.
        for(String owner:holds.owners.values())holds.state.releaseOwner(owner);
        holds.owners.clear();
        if(holds.state.pressedKeys().isEmpty())sessions.remove(input);
    }
    private static void sendActual(FCLInput input,int code,boolean down) {
        if(code>=2003 && code<=2007)org.lwjgl.glfw.CallbackBridge.sendMouseButton(code-2000,down);
        else input.sendKeyEvent(code,down);
    }
}
