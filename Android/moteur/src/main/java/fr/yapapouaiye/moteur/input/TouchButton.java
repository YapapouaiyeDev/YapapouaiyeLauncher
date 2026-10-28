/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.input;

/** A custom overlay button; encoded keys stay distinct from remappable game actions. */
public final class TouchButton {
    public static final int MAX_BUTTONS=12;
    private static final int KEY_OFFSET=10000;
    public final String id,label;
    public final int key;
    public final boolean always;
    public TouchButton(String id,String label,int key,boolean always) {
        if(id==null || !id.matches("custom-[A-Za-z0-9-]{1,48}"))throw new IllegalArgumentException("Identifiant de bouton invalide");
        if(label==null || label.trim().isEmpty() || label.trim().length()>20 || label.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Nom de bouton invalide");
        if(KeyboardKeys.fromAction("key:"+key)==null)throw new IllegalArgumentException("Touche inconnue");
        this.id=id;this.label=label.trim();this.key=key;this.always=always;
    }
    public static TouchButton nexlux() { return new TouchButton("custom-nexlux","NexLux",54,true); }
    public boolean visible(boolean touch,boolean editing) { return always || touch || editing; }
    public int token() { return KEY_OFFSET+key; }
    public static int rawKey(int token) { int code=token-KEY_OFFSET;return KeyboardKeys.fromAction("key:"+code)==null?-1:code; }
}
