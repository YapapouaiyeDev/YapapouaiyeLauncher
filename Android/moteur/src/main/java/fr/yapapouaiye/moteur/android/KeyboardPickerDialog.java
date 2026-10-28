/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;
import android.app.*;
import android.text.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.function.Consumer;
import fr.yapapouaiye.moteur.input.KeyboardKeys;

public final class KeyboardPickerDialog {
    private KeyboardPickerDialog() { }
    public static void show(Activity activity,Consumer<String> selected) {
        LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(24,12,24,12);
        TextView help=new TextView(activity);help.setText("Saisis un nom (G, F6, Espace, Ctrl droit…), puis choisis la touche. Tu peux aussi capturer une touche sur un clavier physique.");content.addView(help);
        EditText search=new EditText(activity);search.setSingleLine(true);search.setHint("Nom de la touche…");search.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);search.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE|android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI);content.addView(search);
        List<KeyboardKeys.Key> visible=new ArrayList<>(KeyboardKeys.ALL);
        ArrayAdapter<String> adapter=new ArrayAdapter<>(activity,android.R.layout.simple_list_item_1,new ArrayList<>());
        ListView list=new ListView(activity);list.setAdapter(adapter);content.addView(list,new LinearLayout.LayoutParams(-1,(int)(activity.getResources().getDisplayMetrics().heightPixels*.32f)));
        Runnable filter=()->{visible.clear();adapter.clear();for(KeyboardKeys.Key key:KeyboardKeys.ALL)if(key.matches(search.getText().toString())){visible.add(key);adapter.add(key.title);}adapter.notifyDataSetChanged();};filter.run();
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){filter.run();}public void afterTextChanged(Editable value){}});
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Touche clavier personnalisée").setView(content)
            .setPositiveButton("Utiliser",null).setNeutralButton("Capturer une touche",null).setNegativeButton("Annuler",null).create();
        Runnable accept=()->{KeyboardKeys.Key key=KeyboardKeys.parse(search.getText().toString());if(key==null && visible.size()==1)key=visible.get(0);if(key==null){Toast.makeText(activity,"Choisis une touche dans la liste ou précise son nom",Toast.LENGTH_SHORT).show();return;}selected.accept(key.action());dialog.dismiss();};
        list.setOnItemClickListener((parent,view,position,id)->{selected.accept(visible.get(position).action());dialog.dismiss();});
        dialog.show();
        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->accept.run());
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view->capture(activity,key->{selected.accept(key);dialog.dismiss();}));
        search.setOnEditorActionListener((view,action,event)->{if(action==android.view.inputmethod.EditorInfo.IME_ACTION_DONE){accept.run();return true;}return false;});
    }
    private static void capture(Activity activity,Consumer<String> selected) {
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Appuie sur une touche du clavier").setMessage("Utilise un clavier physique. Pour les touches spéciales, tu peux aussi revenir à la liste.")
            .setNegativeButton("Annuler",null).create();
        int[] pending={-1};
        dialog.setOnKeyListener((d,code,event)->{
            int source=event.getDevice()==null?event.getSource():event.getDevice().getSources();
            if((source&InputDevice.SOURCE_GAMEPAD)==InputDevice.SOURCE_GAMEPAD || (source&InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK)return true;
            KeyboardKeys.Key key=KeyboardKeys.fromAndroid(code);
            if(key==null)return false;
            if(event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0 && pending[0]<0)pending[0]=code;
            if(event.getAction()==KeyEvent.ACTION_UP && pending[0]==code){selected.accept(key.action());dialog.dismiss();}
            return true;
        });dialog.show();
    }
}
