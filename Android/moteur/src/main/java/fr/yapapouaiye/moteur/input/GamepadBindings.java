/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;

/** Logical game actions, independent of the controller brand and Minecraft's saved key bindings. */
public final class GamepadBindings {
    private GamepadBindings() { }
    public static final String[] BUTTONS={"BUTTON_A","BUTTON_B","BUTTON_X","BUTTON_Y","SHOULDER_LEFT","SHOULDER_RIGHT","TRIGGER_LEFT","TRIGGER_RIGHT","THUMBSTICK_LEFT","THUMBSTICK_RIGHT","BUTTON_START","BUTTON_SELECT","DPAD_UP","DPAD_DOWN","DPAD_LEFT","DPAD_RIGHT"};
    public static final String[] LABELS={"A / Croix","B / Rond","X / Carré","Y / Triangle","LB / L1","RB / R1","LT / L2","RT / R2","Clic stick gauche (L3)","Clic stick droit (R3)","Start / Options","Select / Partage","Croix : haut","Croix : bas","Croix : gauche","Croix : droite"};
    public static final String[] ACTIONS={"none","jump","sneak","sprint","attack","use","inventory","swap","drop","chat","pause","players","previous","next","perspective","fullscreen_hud","slot1","slot2","slot3","slot4","slot5","slot6","slot7","slot8","slot9"};
    public static final String[] TITLES={"Aucune action","Sauter","S'accroupir (maintenir)","Courir (maintenir)","Casser / attaquer","Utiliser / poser","Inventaire","Échanger les mains","Jeter un objet","Ouvrir le chat","Pause / Échap","Liste des joueurs","Case précédente","Case suivante","Changer de vue (F5)","Afficher / masquer l'interface (F1)","Case 1","Case 2","Case 3","Case 4","Case 5","Case 6","Case 7","Case 8","Case 9"};
    private static final String[] DEFAULTS={"jump","sneak","inventory","swap","previous","next","use","attack","sprint","sneak","pause","players","chat","drop","previous","next"};
    private static final int[] ANDROID_KEYS={96,97,99,100,102,103,104,105,106,107,108,109,19,20,21,22};
    public static int actionIndex(String action) { for(int i=0;i<ACTIONS.length;i++)if(ACTIONS[i].equals(action))return i;return -1; }
    public static int buttonIndex(int androidKey) { for(int i=0;i<ANDROID_KEYS.length;i++)if(ANDROID_KEYS[i]==androidKey)return i;return -1; }
    public static String defaultAction(int button) { return DEFAULTS[button]; }
    public static String validAction(String action,int button) { return actionIndex(action)<0 && KeyboardKeys.fromAction(action)==null?defaultAction(button):action; }
    public static String title(String action) { KeyboardKeys.Key key=KeyboardKeys.fromAction(action);if(key!=null)return "Clavier : "+key.title;int index=actionIndex(action);return index<0?TITLES[0]:TITLES[index]; }
    public static int fallbackCode(String action) {
        KeyboardKeys.Key key=KeyboardKeys.fromAction(action);if(key!=null)return key.code;
        if(action==null)return -1;
        if(action.startsWith("slot") && action.length()==5 && action.charAt(4)>='1' && action.charAt(4)<='9')return action.charAt(4)-'1'+2;
        switch(action) {
            case "jump":return 57;case "sneak":return 42;case "sprint":return 29;case "attack":return 1000;case "use":return 1002;
            case "inventory":return 18;case "swap":return 33;case "drop":return 16;case "chat":return 20;case "pause":return 1;
            case "players":return 15;case "previous":return 1003;case "next":return 1004;case "perspective":return 63;case "fullscreen_hud":return 59;
            default:return -1;
        }
    }
    public static String binding(String action) {
        if(action==null || KeyboardKeys.fromAction(action)!=null)return null;
        if(action.startsWith("slot"))return "key_key.hotbar."+action.substring(4);
        switch(action) {
            case "jump":case "sneak":case "sprint":case "attack":case "use":case "inventory":case "drop":case "chat":return "key_key."+action;
            case "swap":return "key_key.swapOffhand";case "players":return "key_key.playerlist";case "perspective":return "key_key.togglePerspective";
            default:return null;
        }
    }
}
