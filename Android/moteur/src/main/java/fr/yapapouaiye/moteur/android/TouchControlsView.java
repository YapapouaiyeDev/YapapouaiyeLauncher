/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.*;
import android.hardware.input.InputManager;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import java.util.*;
import fr.yapapouaiye.moteur.input.*;

/** Own Android touch surface. Compatibility/native event delivery is supplied by Host. */
public final class TouchControlsView extends View {
    public interface Host {
        void key(int code, boolean down);
        void look(float dx, float dy);
        void pointer(float x, float y);
        void mouse(boolean down);
        void keyboard();
        void pauseGame();
        default void chat() { key(20,true); key(20,false); keyboard(); }
        default void confirm() { key(28,true); key(28,false); }
        default void space() { key(57,true); key(57,false); }
        default void keyboardKey(int code) { key(code,true); key(code,false); }
        default void deathChat() { chat(); }
        default void scroll(float amount) { }
        default void externalMotion(MotionEvent event) { }
    }
    private static final int MENU = -1, KEYBOARD = -2, PAUSE = -3, CHAT = -4, SCROLL_UP = -5, SCROLL_DOWN = -6, DEATH_CHAT = -7;
    private static final int BUTTON = 0, JOYSTICK = 1, LOOK = 2, POINTER = 3, ACTION = 4, DRAG = 5;
    private static final int WHITE = Color.rgb(237, 245, 247), GREEN = Color.rgb(66, 224, 113);
    private final Host host;
    private final ControlSettings settings;
    private final TouchInputEngine engine;
    private List<TouchButton> customButtons=Collections.emptyList();
    private final InputManager inputManager;
    private final DeviceInputMode inputMode = new DeviceInputMode();
    private final InputManager.InputDeviceListener inputDeviceListener = new InputManager.InputDeviceListener() {
        @Override public void onInputDeviceAdded(int deviceId) { refreshInputDevices(); }
        @Override public void onInputDeviceRemoved(int deviceId) { refreshInputDevices(); }
        @Override public void onInputDeviceChanged(int deviceId) { refreshInputDevices(); }
    };
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final List<Control> controls = new ArrayList<>();
    private final Map<Integer, Capture> fingers = new HashMap<>();
    private final RectF stick = new RectF();
    private float stickX, stickY, knobX, knobY, stickRadius;
    private int joystickPointer = -1, menuPointer = -1;
    private boolean inGame = true, editing, loading, suspended;
    private boolean automaticInGame = true, forcedMenus;
    private boolean touchControlsForced;
    private AlertDialog menuDialog;
    private int activePointerCount;
    private static final class Control {
        final String id, title; final int code; final RectF bounds; final boolean movable;
        Control(String id,String title,int code,RectF bounds,boolean movable) { this.id=id;this.title=title;this.code=code;this.bounds=bounds;this.movable=movable; }
    }
    private static final class Capture {
        final int role; final Control control;
        Capture(int role, Control control) { this.role=role;this.control=control; }
    }
    public TouchControlsView(Context context, Host host) {
        super(context); this.host = host; settings = new ControlSettings(context);
        inputManager = context.getSystemService(InputManager.class);
        engine = new TouchInputEngine(new EventSink() {
            public void key(int code,boolean down) { host.key(code,down); }
            public void look(float dx,float dy) { host.look(dx,dy); }
        }, new MovementKeys(17,31,30,32));
        setClickable(true); setFocusable(false); setContentDescription("Commandes tactiles Yapapouaiye");
        setElevation(dp(20)); reloadSettings();
    }
    public void reloadSettings() {
        customButtons=new CustomButtons(getContext()).load();
        releaseAll(); engine.setLookSensitivity(settings.sensitivity() / 100f);
        if (getWidth() > 0) layoutControls(); invalidate();
    }
    public void setInGame(boolean value) {
        if (automaticInGame != value) forcedMenus=false;
        automaticInGame=value;
        applyGameMode(value && !forcedMenus);
    }
    private void applyGameMode(boolean value) {
        if (inGame == value) return;
        // Minecraft can grab the cursor inside mouse DOWN (Respawn / Back to game).
        // Keep this one click until the same finger rises; release all game bindings.
        if (!inGame && value && menuPointer>=0) {
            engine.cancelAll();
            fingers.entrySet().removeIf(entry -> entry.getKey()!=menuPointer);
            joystickPointer=-1;knobX=stickX;knobY=stickY;activePointerCount=fingers.size();
        } else releaseAll();
        inGame=value;layoutControls();invalidate();
    }
    public boolean isInGame() { return inGame; }
    public void setLoading(boolean value) { if (loading != value) { releaseAll(); loading=value; invalidate(); } }
    public void setEditing(boolean value) { releaseAll(); editing=value; layoutControls(); invalidate(); }
    public boolean isEditing() { return editing; }
    /** The touch laboratory can stay usable while a physical controller is plugged in. */
    public void setTouchControlsForced(boolean value) {
        if (touchControlsForced != value) {
            releaseAll(); touchControlsForced=value; layoutControls(); invalidate();
        }
    }
    public boolean isControllerConnected() { return inputMode.hasController(); }
    private boolean touchControlsVisible() { return editing || touchControlsForced || !inputMode.hasController(); }
    private void refreshInputDevices() {
        boolean previous=inputMode.hasController();
        inputMode.clear();
        if (inputManager!=null) for (int deviceId : inputManager.getInputDeviceIds()) {
            InputDevice device=inputManager.getInputDevice(deviceId);
            if (device!=null) inputMode.update(deviceId,device.getSources(),device.isVirtual());
        }
        if (previous!=inputMode.hasController()) {
            // A finger held before connection must never leave a hidden key down.
            releaseAll(); layoutControls(); invalidate();
        }
    }
    public void suspendControls() { suspended=true; releaseAll(); }
    public void resumeControls() { suspended=false; refreshInputDevices(); reloadSettings(); }
    public int activePointers() { return activePointerCount; }
    public boolean isPressed(int code) { return engine.isPressed(code); }
    public RectF controlBounds(String id) {
        if ("joystick".equals(id)) return touchControlsVisible() && (inGame || editing) ? new RectF(stick) : null;
        for (Control control:controls) if(control.id.equals(id))return new RectF(control.bounds);
        return null;
    }
    public float joystickOffsetX() { return knobX - stickX; }
    public float joystickOffsetY() { return knobY - stickY; }
    public void releaseAll() {
        boolean releaseMouse=menuPointer>=0;
        fingers.clear(); menuPointer=-1; joystickPointer=-1; activePointerCount=0;
        engine.cancelAll();
        if (releaseMouse) host.mouse(false);
        knobX=stickX;knobY=stickY; invalidate();
    }
    private float dp(float value) { return value * getResources().getDisplayMetrics().density; }
    private void add(String id,String title,int code,float x,float y,float w,float h,boolean movable) {
        if (movable) { x=settings.x(id,x/getWidth())*getWidth(); y=settings.y(id,y/getHeight())*getHeight(); }
        x=Math.max(w/2+dp(4),Math.min(getWidth()-w/2-dp(4),x)); y=Math.max(h/2+dp(5),Math.min(getHeight()-h/2-dp(5),y));
        controls.add(new Control(id,title,code,new RectF(x-w/2,y-h/2,x+w/2,y+h/2),movable));
    }
    private float side(float x) { return settings.leftHanded() ? getWidth()-x : x; }
    private void layoutControls() {
        if (getWidth() == 0 || getHeight() == 0) return;
        controls.clear();
        float w=getWidth(),h=getHeight();
        float top=Math.max(dp(32),getRootWindowInsets() == null ? 0 : getRootWindowInsets().getSystemWindowInsetTop()+dp(24));
        add("menu",editing ? "Terminer" : "Y · Menu",MENU,dp(62),top,dp(106),dp(44),false);
        // Keep one entry point for pause, keyboard and settings. A connected
        // controller hides all game buttons without a drawer or manual setting.
        if (!touchControlsVisible()) {layoutCustomButtons();return;}
        if (!editing) {
            add("pause",inGame ? "Pause" : "Retour",PAUSE,w-dp(49),top,dp(78),dp(44),false);
            add("keyboard","Clavier",KEYBOARD,w-dp(142),top,dp(96),dp(44),false);
            if (!inGame) {
                add("scrollUp","↑",SCROLL_UP,dp(148),top,dp(44),dp(44),false);
                add("scrollDown","↓",SCROLL_DOWN,dp(200),top,dp(44),dp(44),false);
                if(w>dp(600))add("deathChat","Chat",DEATH_CHAT,dp(268),top,dp(78),dp(44),false);
            }
        }
        float size=Math.min(dp(60)*settings.size()/100f,h*.18f),gap=dp(9),r=size/2;
        stickRadius=Math.min(dp(72)*settings.size()/100f,h*.20f);
        stickX=settings.x("joystick",side(stickRadius+dp(32))/w)*w;
        stickY=settings.y("joystick",(h-stickRadius-dp(40))/h)*h;
        stickX=Math.max(stickRadius+dp(5),Math.min(w-stickRadius-dp(5),stickX));
        stickY=Math.max(stickRadius+dp(55),Math.min(h-stickRadius-dp(5),stickY));
        stick.set(stickX-stickRadius,stickY-stickRadius,stickX+stickRadius,stickY+stickRadius);
        knobX=stickX;knobY=stickY;
        if (inGame || editing) {
            float right=w-r-dp(22),bottom=h-r-dp(22);
            add("jump","Saut",57,side(right),bottom,size,size,true);
            add("use","Utiliser",1002,side(right-size-gap),bottom,size,size,true);
            add("attack","Casser",1000,side(right),bottom-size-gap,size,size,true);
            add("sneak","Accroupi",42,side(right-size-gap),bottom-size-gap,size,size,true);
            add("sprint","Courir",29,stickX+(settings.leftHanded()?-1:1)*(stickRadius+size*.65f),bottom,size,size,true);
            add("inventory","Sac",18,side(right-2*(size+gap)),bottom,size,size,true);
            add("chat","Chat",CHAT,side(right-2*(size+gap)),bottom-size-gap,size,size,true);
            float slot=Math.min(dp(31),w*.038f),hotbarWidth=slot*9;
            for (int i=0;i<9;i++) add("slot"+i,String.valueOf(i+1),i+2,w/2-hotbarWidth/2+slot*(i+.5f),h-dp(19),slot-dp(2),dp(30),false);
        }
        layoutCustomButtons();
    }
    private void layoutCustomButtons() {
        int index=0;float w=getWidth(),h=getHeight(),width=dp(94)*settings.size()/100f,height=dp(48)*settings.size()/100f;
        for(TouchButton button:customButtons) {
            int slot=index++;
            if(button.visible(touchControlsVisible(),editing))add(button.id,button.label,button.token(),w*.5f+(slot%3-1)*(width+dp(8)),dp(110)+(slot/3)*(height+dp(8)),width,height,true);
        }
    }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) { releaseAll();layoutControls(); }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (loading) {
            canvas.drawColor(Color.rgb(11,17,23));
            paint.setColor(GREEN);paint.setTextSize(dp(24));paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("YAPAPOUAIYE",getWidth()/2f,getHeight()/2f-dp(12),paint);
            paint.setColor(WHITE);paint.setTextSize(dp(15));canvas.drawText("Minecraft démarre…",getWidth()/2f,getHeight()/2f+dp(20),paint);
        }
        int alpha=(int)(settings.opacity()*2.55f);
        if (touchControlsVisible() && (inGame || editing) && !loading) {
            paint.setStyle(Paint.Style.FILL);paint.setColor(Color.argb(alpha/2,14,25,32));canvas.drawOval(stick,paint);
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(2));paint.setColor(Color.argb(alpha,160,200,190));canvas.drawOval(stick,paint);
            paint.setStyle(Paint.Style.FILL);paint.setColor(Color.argb(alpha,45,138,93));canvas.drawCircle(knobX,knobY,stickRadius*.39f,paint);
            text(canvas,editing ? "Déplacer" : "Bouger",stickX,stickY+stickRadius+dp(17),11,WHITE);
        }
        for (Control control : controls) {
            if (loading && control.code != MENU) continue;
            boolean held=false; for (Capture finger:fingers.values()) if (finger.control==control) held=true;
            paint.setStyle(Paint.Style.FILL);paint.setColor(held ? Color.argb(230,38,139,84) : Color.argb(alpha,17,30,39));
            canvas.drawRoundRect(control.bounds,dp(13),dp(13),paint);
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(1.2f));paint.setColor(held ? GREEN : Color.argb(alpha,151,178,176));
            canvas.drawRoundRect(control.bounds,dp(13),dp(13),paint);
            text(canvas,control.title,control.bounds.centerX(),control.bounds.centerY()+dp(4),control.code==MENU?13:12,WHITE);
        }
        if (editing) text(canvas,"Glisse les touches et le joystick. Puis appuie sur Terminer.",getWidth()/2f,dp(78),13,GREEN);
    }
    private void text(Canvas canvas,String value,float x,float y,int size,int color) {
        paint.setStyle(Paint.Style.FILL);paint.setColor(color);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(dp(size));
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF,Typeface.BOLD));canvas.drawText(value,x,y,paint);
    }
    private Control hit(float x,float y) {
        for (int i=controls.size()-1;i>=0;i--) if (controls.get(i).bounds.contains(x,y)) return controls.get(i);
        return null;
    }
    @Override public boolean onTouchEvent(MotionEvent event) {
        if (suspended || menuDialog != null) return true;
        if(event.isFromSource(android.view.InputDevice.SOURCE_MOUSE)) { host.externalMotion(event);return true; }
        int action=event.getActionMasked(),index=event.getActionIndex(),id=event.getPointerId(index);
        if (action==MotionEvent.ACTION_CANCEL) { releaseAll();return true; }
        if (action==MotionEvent.ACTION_DOWN || action==MotionEvent.ACTION_POINTER_DOWN) {
            if (action==MotionEvent.ACTION_DOWN) releaseAll();
            float x=event.getX(index),y=event.getY(index); Control control=hit(x,y);
            if (control!=null && (!loading || control.code==MENU)) {
                if (editing && control.movable) fingers.put(id,new Capture(DRAG,control));
                else if (control.code<0) fingers.put(id,new Capture(ACTION,control));
                else if (!editing) { fingers.put(id,new Capture(BUTTON,control));engine.press(id,control.id,control.code); }
            } else if (editing && stick.contains(x,y)) { fingers.put(id,new Capture(DRAG,null)); }
            else if (touchControlsVisible() && !editing && !loading && inGame && stick.contains(x,y) && joystickPointer<0) {
                joystickPointer=id;fingers.put(id,new Capture(JOYSTICK,null));moveStick(id,x,y);
            } else if (!editing && !loading && !inGame && menuPointer<0) {
                menuPointer=id;fingers.put(id,new Capture(POINTER,null));host.pointer(x,y);host.mouse(true);
            } else if (touchControlsVisible() && !editing && !loading && inGame && engine.beginLook(id,x,y)) fingers.put(id,new Capture(LOOK,null));
            activePointerCount=fingers.size();invalidate();return true;
        }
        if (action==MotionEvent.ACTION_MOVE) {
            for (int i=0;i<event.getPointerCount();i++) {
                int pointer=event.getPointerId(i); Capture capture=fingers.get(pointer);if(capture==null)continue;
                float x=event.getX(i),y=event.getY(i);
                if (capture.role==JOYSTICK) moveStick(pointer,x,y);
                else if (capture.role==LOOK) engine.moveLook(pointer,x,y);
                else if (capture.role==POINTER && !inGame) host.pointer(x,y);
                else if (capture.role==BUTTON && !capture.control.bounds.contains(x,y)) {
                    engine.releasePointer(pointer);fingers.remove(pointer);
                } else if (capture.role==DRAG) drag(capture.control,x,y);
            }
            activePointerCount=fingers.size();invalidate();return true;
        }
        if (action==MotionEvent.ACTION_UP || action==MotionEvent.ACTION_POINTER_UP) {
            Capture capture=fingers.remove(id);engine.releasePointer(id);
            if (id==joystickPointer) { joystickPointer=-1;knobX=stickX;knobY=stickY; }
            if (id==menuPointer) { menuPointer=-1;if(!inGame)host.pointer(event.getX(index),event.getY(index));host.mouse(false); }
            if (capture!=null && capture.role==DRAG) {
                String name=capture.control==null?"joystick":capture.control.id;
                settings.position(name,(capture.control==null?stickX:capture.control.bounds.centerX())/getWidth(),(capture.control==null?stickY:capture.control.bounds.centerY())/getHeight());
            }
            if (capture!=null && capture.role==ACTION && capture.control.bounds.contains(event.getX(index),event.getY(index))) perform(capture.control.code);
            if (action==MotionEvent.ACTION_UP) releaseAll();
            activePointerCount=fingers.size();invalidate();return true;
        }
        return true;
    }
    private void moveStick(int pointer,float x,float y) {
        float dx=(x-stickX)/stickRadius,dy=(y-stickY)/stickRadius;
        float length=(float)Math.sqrt(dx*dx+dy*dy),scale=length>1?1/length:1;
        knobX=stickX+dx*scale*stickRadius*.64f;knobY=stickY+dy*scale*stickRadius*.64f;
        engine.joystick(pointer,dx*scale,dy*scale);
    }
    private void drag(Control control,float x,float y) {
        if(control==null){stickX=Math.max(stickRadius,Math.min(getWidth()-stickRadius,x));stickY=Math.max(stickRadius+dp(52),Math.min(getHeight()-stickRadius,y));stick.set(stickX-stickRadius,stickY-stickRadius,stickX+stickRadius,stickY+stickRadius);knobX=stickX;knobY=stickY;}
        else {float halfW=control.bounds.width()/2,halfH=control.bounds.height()/2;x=Math.max(halfW,Math.min(getWidth()-halfW,x));y=Math.max(halfH+dp(52),Math.min(getHeight()-halfH,y));control.bounds.offsetTo(x-halfW,y-halfH);}
    }
    private void perform(int action) {
        releaseAll();
        if(action==MENU) { if(editing)setEditing(false);else openMenu(); }
        else if(action==PAUSE) host.pauseGame();
        else if(action==KEYBOARD) host.keyboard();
        else if(action==CHAT) host.chat();
        else if(action==SCROLL_UP) host.scroll(1);
        else if(action==SCROLL_DOWN) host.scroll(-1);
        else if(action==DEATH_CHAT) host.deathChat();
    }
    public void openMenu() {
        releaseAll();
        if (!(getContext() instanceof Activity) || menuDialog!=null) return;
        Activity activity=(Activity)getContext();
        final boolean chatFromGame=inGame;
        String[] items={"Reprendre", "Échap : pause / retour", "Clavier / commande", "Réglages des commandes", "Déplacer les touches", "Aide", forcedMenus ? "Mode tactile : jeu" : "Mode tactile : menus", "Valider (Entrée)", "Espace", "Chat en étant mort (/login)", "Touche clavier…", "Mes boutons à l’écran"};
        menuDialog=new AlertDialog.Builder(activity).setTitle("Yapapouaiye · En jeu").setItems(items,(dialog,which)-> {
            menuDialog=null;
            if(which==1)host.pauseGame();
            else if(which==2) post(chatFromGame ? host::chat : host::keyboard);
            else if(which==3)post(() -> ControlSettingsDialog.show(activity,this::reloadSettings));
            else if(which==4)setEditing(true);
            else if(which==5)post(() -> new AlertDialog.Builder(activity).setTitle("Commandes tactiles")
                .setMessage("Joystick à gauche : avancer. Glisse sur le reste de l’écran pour regarder.\n\nMaintiens Casser, Utiliser ou Saut. Relève le doigt pour arrêter.\n\nChat ouvre la saisie des messages et commandes. Sur l’écran de mort, Chat ou Y · Menu → Chat en étant mort permet de saisir /login, puis de réessayer Réapparaître. Cette aide est incluse pour NeoForge 26.2 et 1.21.1.\n\nDans un formulaire Minecraft, touche d’abord le champ, puis Clavier. Les flèches ↑ et ↓ font défiler les listes. Retour ferme un écran Minecraft.\n\nLes touches se masquent automatiquement avec une manette. Y · Menu donne toujours accès au clavier, à Entrée, Espace, la pause et aux réglages. Si les touches de jeu couvrent un menu, choisis Mode tactile : menus.\n\nDéplacer les touches change leur position. Réglages change taille, opacité et sensibilité.")
                .setPositiveButton("Compris",null).show());
            else if(which==6) { forcedMenus=!forcedMenus;applyGameMode(automaticInGame && !forcedMenus); }
            else if(which==7)post(host::confirm);
            else if(which==8)post(host::space);
            else if(which==9)post(host::deathChat);
            else if(which==10)post(()->KeyboardPickerDialog.show(activity,action->{fr.yapapouaiye.moteur.input.KeyboardKeys.Key key=fr.yapapouaiye.moteur.input.KeyboardKeys.fromAction(action);if(key!=null)host.keyboardKey(key.code);}));
            else if(which==11)post(()->CustomButtonsDialog.show(activity,this::reloadSettings));
        }).setNegativeButton("Fermer",null).create();
        menuDialog.setOnDismissListener(dialog -> { menuDialog=null;releaseAll(); });menuDialog.show();
    }
    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (inputManager!=null) inputManager.registerInputDeviceListener(inputDeviceListener,null);
        refreshInputDevices();
    }
    @Override protected void onDetachedFromWindow() {
        if (inputManager!=null) inputManager.unregisterInputDeviceListener(inputDeviceListener);
        releaseAll();if(menuDialog!=null)menuDialog.dismiss();super.onDetachedFromWindow();
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus);if(!focus)releaseAll(); }
}
