/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;
import android.content.*;
import org.json.*;
import java.util.*;
import fr.yapapouaiye.moteur.input.TouchButton;

public final class CustomButtons {
    private final SharedPreferences store;
    public CustomButtons(Context context) {store=context.getSharedPreferences("yapapouaiye-moteur",Context.MODE_PRIVATE);}
    public List<TouchButton> load() {
        String value=store.getString("customButtons",null);
        if(value==null)return new ArrayList<>(List.of(TouchButton.nexlux()));
        List<TouchButton> result=new ArrayList<>();Set<String> ids=new HashSet<>();
        try {
            JSONArray array=new JSONArray(value);
            for(int i=0;i<array.length() && result.size()<TouchButton.MAX_BUTTONS;i++)try {
                JSONObject entry=array.getJSONObject(i);TouchButton button=new TouchButton(entry.getString("id"),entry.getString("label"),entry.getInt("key"),entry.getBoolean("always"));
                if(ids.add(button.id))result.add(button);
            }catch(JSONException|IllegalArgumentException ignored) { }
        }catch(JSONException ignored) {return new ArrayList<>(List.of(TouchButton.nexlux()));}
        return result;
    }
    public void save(List<TouchButton> buttons) {
        if(buttons.size()>TouchButton.MAX_BUTTONS)throw new IllegalArgumentException("Trop de boutons");
        JSONArray array=new JSONArray();Set<String> ids=new HashSet<>();
        try {for(TouchButton button:buttons){if(!ids.add(button.id))throw new IllegalArgumentException("Bouton en double");array.put(new JSONObject().put("id",button.id).put("label",button.label).put("key",button.key).put("always",button.always));}}
        catch(JSONException error){throw new IllegalStateException(error);}
        SharedPreferences.Editor edit=store.edit().putString("customButtons",array.toString());
        for(TouchButton old:load())if(!ids.contains(old.id)){edit.remove("x."+old.id);edit.remove("y."+old.id);}
        edit.apply();
    }
}
