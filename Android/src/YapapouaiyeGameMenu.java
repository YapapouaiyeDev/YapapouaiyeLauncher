/* SPDX-License-Identifier: GPL-3.0-or-later */
package com.tungsten.fcl.activity;

import android.app.AlertDialog;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.RelativeLayout;
import android.widget.Toast;
import com.tungsten.fcl.control.GameMenu;
import com.tungsten.fcl.R;
import com.tungsten.fcl.control.FCLInput;
import com.tungsten.fcl.game.sdl.SdlBridge;
import com.tungsten.fcl.setting.GameOption;
import com.tungsten.fcllibrary.component.FCLActivity;
import com.tungsten.fclauncher.bridge.FCLBridge;
import com.tungsten.fclauncher.keycodes.FCLKeycodes;
import com.tungsten.fclauncher.keycodes.MinecraftKeyBindingMapper;
import fr.yapapouaiye.moteur.android.*;
import fr.yapapouaiye.moteur.input.MouseBindings;
import org.libsdl.app.SDLActivity;
import java.util.*;

/** Thin compatibility adapter. The new module owns touch state, layout, menus and settings. */
public final class YapapouaiyeGameMenu extends GameMenu {
    private TouchControlsView controls;
    private final Map<Integer,Integer> pressedMapping = new HashMap<>();
    private final Map<Integer,Integer> actualHolds = new HashMap<>();
    private final Map<Integer,String> bindings = new HashMap<>();
    private static final int TEXT_IDLE=0, TEXT_OPEN=1, TEXT_WAIT_CHAT=2, TEXT_DIALOG=3, TEXT_SEND=4, TEXT_WAIT_WORLD=5, TEXT_DEATH_OPEN=6, TEXT_DEATH_WAIT=7;
    private final Handler textHandler = new Handler(Looper.getMainLooper());
    private final Runnable textStep = this::advanceTextInput;
    private final Runnable chatKeyRelease = this::releaseChatKey;
    private AlertDialog textDialog;
    private EditText textEntry;
    private String pendingText;
    private int textStage;
    private long textDeadline, textFocusReadyAt;
    private long deathChatReadyAt;
    private boolean activityPaused;
    private boolean forceChat;
    private final Runnable uiKeyStep = this::advanceUiKey;
    private final Runnable uiKeyRelease = this::releaseUiKey;
    private int pendingUiKey=-1, heldUiKey=-1;
    private long uiKeyDeadline;
    public YapapouaiyeGameMenu() {
        bindings.put(17,"key_key.forward");bindings.put(31,"key_key.back");bindings.put(30,"key_key.left");bindings.put(32,"key_key.right");
        bindings.put(57,"key_key.jump");bindings.put(42,"key_key.sneak");bindings.put(29,"key_key.sprint");
        bindings.put(18,"key_key.inventory");bindings.put(20,"key_key.chat");bindings.put(16,"key_key.drop");
        bindings.put(1000,"key_key.attack");bindings.put(1002,"key_key.use");
        for(int i=0;i<9;i++)bindings.put(i+2,"key_key.hotbar."+(i+1));
    }
    @Override public void setup(FCLActivity activity,FCLBridge bridge) {
        super.setup(activity,bridge);
        ControlSettings settings=new ControlSettings(activity);
        // Resolution is owned by the new settings; stale legacy forced dimensions must not override it.
        getMenuSetting().setForceResolution(false);
        getMenuSetting().setWindowScale(settings.resolution()/100d);
        FCLBridge.initForceResolution(getMenuSetting());
        if(bridge!=null)bridge.setScaleFactor(settings.resolution()/100d);
        getTouchPad().setVisibility(View.GONE);
        getLayout().findViewById(R.id.game_item_bar).setVisibility(View.GONE);
        updateCursor();
        getLayout().findViewById(R.id.log_window).setVisibility(View.GONE);
        getBaseLayout().setBackgroundColor(android.graphics.Color.rgb(11,17,23));
        controls=new TouchControlsView(activity,new TouchControlsView.Host() {
            public void key(int code,boolean down) { sendMapped(code,down); }
            public void look(float x,float y) { FCLBridge.pushEventLookDelta(x,y); }
            public void pointer(float x,float y) { getInput().setPointer(x,y); }
            public void mouse(boolean down) { getInput().sendKeyEvent(FCLInput.MOUSE_LEFT,down); }
            public void keyboard() { requestTextInput(false); }
            public void chat() { requestTextInput(true); }
            public void scroll(float amount) {
                if(getCursorMode()==FCLBridge.CursorEnabled && Float.isFinite(amount) && amount!=0)
                    org.lwjgl.glfw.CallbackBridge.sendScroll(0,amount);
            }
            public void pauseGame() { pulseWhenFocused(FCLKeycodes.KEY_ESC); }
            public void confirm() { pulseWhenFocused(FCLKeycodes.KEY_ENTER); }
            public void space() { pulseWhenFocused(FCLKeycodes.KEY_SPACE); }
            public void keyboardKey(int code) { pulseWhenFocused(code); }
            public void deathChat() { requestDeathChat(); }
            public void externalMotion(android.view.MotionEvent event) {
                if(getCursorMode()==FCLBridge.CursorEnabled)getInput().setPointer(event.getX(),event.getY());
                getInput().handleExternalTouchButtons(event);
            }
        });
        controls.setInGame(getCursorMode()==FCLBridge.CursorDisabled);controls.setLoading(true);
        getBaseLayout().addView(controls,new RelativeLayout.LayoutParams(-1,-1));
    }
    private void updateCursor() {
        boolean hidden=getActivity().getSharedPreferences("yapapouaiye",android.content.Context.MODE_PRIVATE).getBoolean("hideCursor",false);
        getCursor().setVisibility(getCursorMode()==FCLBridge.CursorEnabled && !hidden ? View.VISIBLE : View.GONE);
    }
    /** Native text is delivered only while Minecraft has released its mouse and regained focus. */
    private void requestTextInput(boolean openChat) {
        if(getBridge()==null || activityPaused)return;
        if(textDialog!=null) { if(textEntry!=null)textEntry.requestFocus();return; }
        cancelTextInput();cancelUiKey();releaseCommands();
        // In a GUI the user has already selected the target field. In a world, open chat first.
        forceChat=openChat;
        textStage=TEXT_OPEN;textDeadline=SystemClock.uptimeMillis()+4000;
        scheduleTextStep(0);
    }
    private void scheduleTextStep(long delay) {
        textHandler.removeCallbacks(textStep);textHandler.postDelayed(textStep,delay);
    }
    private void requestDeathChat() {
        if(!getActivity().getSharedPreferences("yapapouaiye",android.content.Context.MODE_PRIVATE).getBoolean("deathChatSupport",false)) {
            textNotice("Le chat depuis l’écran de mort nécessite le compagnon Android NeoForge. Relance ce serveur depuis le launcher.");return;
        }
        if(getBridge()==null || activityPaused)return;
        cancelTextInput();cancelUiKey();releaseCommands();
        textStage=TEXT_DEATH_OPEN;textDeadline=SystemClock.uptimeMillis()+4000;scheduleTextStep(0);
    }
    private void releaseChatKey() { sendMapped(20,false);if(textStage==TEXT_WAIT_CHAT)scheduleTextStep(0); }
    private boolean minecraftAcceptsText() {
        return getCursorMode()==FCLBridge.CursorEnabled && !org.lwjgl.glfw.CallbackBridge.isGrabbing();
    }
    private boolean minecraftHasMouse() {
        return getCursorMode()==FCLBridge.CursorDisabled && org.lwjgl.glfw.CallbackBridge.isGrabbing();
    }
    private void openMinecraftChat() {
        textStage=TEXT_WAIT_CHAT;sendMapped(20,true);
        // Preserve a complete key press even on legacy versions that poll keyboard state.
        textHandler.postDelayed(chatKeyRelease,60);scheduleTextStep(80);
    }
    private void advanceTextInput() {
        if(textStage==TEXT_IDLE || textStage==TEXT_DIALOG)return;
        if(activityPaused || getActivity().isFinishing() || getActivity().isDestroyed()) { cancelTextInput();return; }
        long now=SystemClock.uptimeMillis();
        if(now>=textDeadline) { cancelTextInput();textNotice("Minecraft n’a pas ouvert la saisie. Touche un champ ou ouvre le chat, puis réessaie.");return; }
        if(!getActivity().hasWindowFocus() || now<textFocusReadyAt) { scheduleTextStep(50);return; }
        if(textStage==TEXT_DEATH_OPEN) {
            if(!minecraftAcceptsText()) { cancelTextInput();textNotice("Ouvre le chat normal avec Chat pendant la partie.");return; }
            // The bundled client-only mod handles this key only on the death screen.
            pressUiKey(FCLKeycodes.KEY_F8);textStage=TEXT_DEATH_WAIT;deathChatReadyAt=now+250;scheduleTextStep(250);
        } else if(textStage==TEXT_DEATH_WAIT) {
            if(now>=deathChatReadyAt && heldUiKey<0 && minecraftAcceptsText())showTextDialog();
            else scheduleTextStep(50);
        } else if(textStage==TEXT_OPEN) {
            if(minecraftHasMouse())openMinecraftChat();
            else if(minecraftAcceptsText()) {
                if(!forceChat)showTextDialog();
                else {
                    // Opening our Android menu can make Minecraft pause on lost focus.
                    // Only an explicit Chat request may close that screen before opening chat.
                    textStage=TEXT_WAIT_WORLD;pressUiKey(FCLKeycodes.KEY_ESC);scheduleTextStep(80);
                }
            } else scheduleTextStep(50);
        } else if(textStage==TEXT_WAIT_WORLD) {
            if(minecraftHasMouse() && heldUiKey<0)openMinecraftChat();
            else scheduleTextStep(50);
        } else if(textStage==TEXT_WAIT_CHAT) {
            if(minecraftAcceptsText() && !pressedMapping.containsKey(20))showTextDialog();
            else scheduleTextStep(50);
        } else if(textStage==TEXT_SEND) {
            if(!minecraftAcceptsText()) { cancelTextInput();textNotice("Minecraft a fermé la saisie. Rouvre le champ ou le chat, puis réessaie.");return; }
            boolean sdlText=SdlBridge.getSdlEnabled() && SdlBridge.isSdlRenderActive();
            if(sdlText && !SdlBridge.isNativeTextInputActive()) { scheduleTextStep(50);return; }
            String value=pendingText;pendingText=null;textStage=TEXT_IDLE;
            if(value==null || value.isEmpty())return;
            // Do not log, save, or copy chat and server passwords to the clipboard.
            if(sdlText)SDLActivity.commitTextInput(value);
            else for(int i=0;i<value.length();i++)getInput().sendChar(value.charAt(i));
            pressUiKey(FCLKeycodes.KEY_ENTER);
        }
    }
    private void showTextDialog() {
        textStage=TEXT_DIALOG;
        EditText input=new EditText(getActivity());textEntry=input;
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_FILTER | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(256)});
        input.setSaveEnabled(false);input.setSaveFromParentEnabled(false);
        input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        input.setHint("Message, /login … ou texte du champ");
        int inset=(int)(20*getActivity().getResources().getDisplayMetrics().density);
        RelativeLayout box=new RelativeLayout(getActivity());box.setPadding(inset,0,inset,0);
        box.addView(input,new RelativeLayout.LayoutParams(-1,-2));
        AlertDialog dialog=new AlertDialog.Builder(getActivity())
            .setView(box).setPositiveButton("Envoyer",null).setNegativeButton("Annuler",null).create();
        textDialog=dialog;
        Runnable submit=() -> {
            if(textStage!=TEXT_DIALOG)return;
            pendingText=input.getText().toString();input.getText().clear();
            textStage=TEXT_SEND;textDeadline=SystemClock.uptimeMillis()+3000;
            dialog.dismiss();scheduleTextStep(120);
        };
        dialog.setOnDismissListener(ignored -> {
            if(textDialog!=dialog)return;
            input.getText().clear();textEntry=null;textDialog=null;
            if(textStage==TEXT_DIALOG)cancelTextInput();
        });
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> submit.run());
            input.setOnEditorActionListener((view,action,event) -> {
                if(action==EditorInfo.IME_ACTION_SEND) { submit.run();return true; }
                return false;
            });
            input.requestFocus();
        });
        if(dialog.getWindow()!=null)dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        dialog.show();
    }
    private void cancelTextInput() {
        textHandler.removeCallbacks(textStep);textHandler.removeCallbacks(chatKeyRelease);pendingText=null;textStage=TEXT_IDLE;forceChat=false;
        sendMapped(20,false);
        if(textEntry!=null)textEntry.getText().clear();
        AlertDialog dialog=textDialog;textDialog=null;textEntry=null;
        if(dialog!=null)dialog.dismiss();
    }
    private void textNotice(String message) { Toast.makeText(getActivity(),message,Toast.LENGTH_LONG).show(); }
    private void pulseWhenFocused(int code) {
        cancelTextInput();releaseCommands();
        pendingUiKey=code;uiKeyDeadline=SystemClock.uptimeMillis()+3000;
        textHandler.removeCallbacks(uiKeyStep);textHandler.post(uiKeyStep);
    }
    private void advanceUiKey() {
        if(pendingUiKey<0)return;
        if(activityPaused || getActivity().isFinishing() || getActivity().isDestroyed()) { cancelUiKey();return; }
        long now=SystemClock.uptimeMillis();
        if(now>=uiKeyDeadline) { cancelUiKey();textNotice("Minecraft n’a pas repris le focus. Réessaie quand le jeu est affiché.");return; }
        if(!getActivity().hasWindowFocus() || now<textFocusReadyAt) { textHandler.postDelayed(uiKeyStep,50);return; }
        int code=pendingUiKey;pendingUiKey=-1;pressUiKey(code);
    }
    private void pressUiKey(int code) {
        textHandler.removeCallbacks(uiKeyRelease);releaseUiKey();
        heldUiKey=code;getInput().sendKeyEvent(code,true);textHandler.postDelayed(uiKeyRelease,60);
    }
    private void releaseUiKey() { if(heldUiKey>=0){getInput().sendKeyEvent(heldUiKey,false);heldUiKey=-1;} }
    private void cancelUiKey() {
        pendingUiKey=-1;textHandler.removeCallbacks(uiKeyStep);textHandler.removeCallbacks(uiKeyRelease);releaseUiKey();
    }
    private void sendMapped(int code,boolean down) {
        int raw=fr.yapapouaiye.moteur.input.TouchButton.rawKey(code);
        int mapped=raw>=0?raw:code;
        if(down) {
            if(pressedMapping.containsKey(code))return;
            GameOption options=getGameOption();String name=bindings.get(code);
            if(raw<0 && options!=null && name!=null) {
                String value=options.get(name);Integer mouse=MouseBindings.code(value);
                mapped=mouse!=null?mouse:MinecraftKeyBindingMapper.mapBindingToKeycode(value,code);
            }
            if(mapped==com.tungsten.fclauncher.keycodes.FCLKeycodes.KEY_UNKNOWN)return;
            pressedMapping.put(code,mapped);
            int count=actualHolds.getOrDefault(mapped,0);actualHolds.put(mapped,count+1);if(count>0)return;
        } else {
            Integer held=pressedMapping.remove(code);if(held==null)return;mapped=held;
            int count=actualHolds.getOrDefault(mapped,1)-1;
            if(count>0){actualHolds.put(mapped,count);return;}actualHolds.remove(mapped);
        }
        sendActual(mapped,down);
    }
    private void sendActual(int code,boolean down) {
        com.tungsten.fcl.yapapouaiye.YapapouaiyeGamepad.sendOverlay(getInput(),code,down);
    }
    public void releaseCommands() {
        if(controls!=null)controls.releaseAll();
        for(Integer mapped:new ArrayList<>(actualHolds.keySet()))sendActual(mapped,false);
        pressedMapping.clear();actualHolds.clear();getInput().resetGamepadState();
    }
    public void showYapapouaiyeMenu() { releaseCommands();if(controls!=null)controls.openMenu(); }
    public void onFocusLost() { if(controls!=null)controls.suspendControls();releaseCommands(); }
    public void onFocusGained() {
        com.tungsten.fcl.game.sdl.SdlSettings.setGamepadInputMode(com.tungsten.fcl.game.sdl.GamepadInputMode.MAPPED);
        com.tungsten.fcl.game.sdl.SdlSettings.setGamepadInputModePrompted(true);
        setGamepadControl(true);
        if(controls!=null)controls.resumeControls();
        // JVMActivity restores GLFW_FOCUSED after this callback; let the game observe that first.
        textFocusReadyAt=SystemClock.uptimeMillis()+120;
        if(textStage!=TEXT_IDLE && textStage!=TEXT_DIALOG)scheduleTextStep(120);
        if(pendingUiKey>=0) { textHandler.removeCallbacks(uiKeyStep);textHandler.postDelayed(uiKeyStep,120); }
    }
    @Override public void onPause() { activityPaused=true;cancelTextInput();cancelUiKey();if(controls!=null)controls.suspendControls();releaseCommands();super.onPause(); }
    @Override public void onResume() { activityPaused=false;super.onResume();if(controls!=null)controls.resumeControls(); }
    @Override public void onGraphicOutput() { super.onGraphicOutput();getLayout().findViewById(R.id.log_window).setVisibility(View.GONE);if(controls!=null)controls.setLoading(false); }
    @Override public void onCursorModeChange(int mode) {
        super.onCursorModeChange(mode);
        getActivity().runOnUiThread(() -> {
            getLayout().findViewById(R.id.game_item_bar).setVisibility(View.GONE);updateCursor();
            if(controls!=null)controls.setInGame(mode==FCLBridge.CursorDisabled);
            if(textStage==TEXT_WAIT_CHAT || textStage==TEXT_WAIT_WORLD)scheduleTextStep(0);
        });
    }
}
