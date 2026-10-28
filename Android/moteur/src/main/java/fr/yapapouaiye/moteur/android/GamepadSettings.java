/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;
import android.content.Context;
import android.content.SharedPreferences;
import fr.yapapouaiye.moteur.input.GamepadBindings;
import fr.yapapouaiye.moteur.input.GamepadLook;

public final class GamepadSettings {
    private final SharedPreferences store;
    public GamepadSettings(Context context) { store=context.getSharedPreferences("yapapouaiye-gamepad",Context.MODE_PRIVATE); }
    public String action(int button) { return GamepadBindings.validAction(store.getString(GamepadBindings.BUTTONS[button],GamepadBindings.defaultAction(button)),button); }
    public int lookSensitivity() { return GamepadLook.bounded(store.getInt("lookSensitivity",GamepadLook.DEFAULT)); }
    public void save(String[] actions,int lookSensitivity) {
        if(actions.length!=GamepadBindings.BUTTONS.length)throw new IllegalArgumentException("Profil incomplet");
        SharedPreferences.Editor editor=store.edit().putInt("lookSensitivity",GamepadLook.bounded(lookSensitivity));
        for(int i=0;i<actions.length;i++)editor.putString(GamepadBindings.BUTTONS[i],GamepadBindings.validAction(actions[i],i));
        editor.apply();
    }
}
