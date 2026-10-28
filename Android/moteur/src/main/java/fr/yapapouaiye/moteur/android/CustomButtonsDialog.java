/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;
import android.app.*;
import android.text.InputFilter;
import android.widget.*;
import java.util.*;
import fr.yapapouaiye.moteur.input.*;

public final class CustomButtonsDialog {
    private CustomButtonsDialog() { }
    public static void show(Activity activity,Runnable applied) {
        CustomButtons settings=new CustomButtons(activity);List<TouchButton> buttons=settings.load();
        LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(24,12,24,12);
        TextView help=new TextView(activity);help.setText("Crée un bouton, choisis sa touche et son affichage. Toujours affiché : reste accessible avec une manette. Tactile uniquement : se masque quand une manette est connectée.\n\nPour placer les boutons, ouvre Déplacer les touches depuis Y · Menu ou le banc d’essai.");content.addView(help);
        LinearLayout rows=new LinearLayout(activity);rows.setOrientation(LinearLayout.VERTICAL);content.addView(rows);
        Runnable[] refresh={null};refresh[0]=()->{rows.removeAllViews();for(TouchButton button:new ArrayList<>(buttons)){Button row=new Button(activity);row.setText(button.label+" · "+KeyboardKeys.fromAction("key:"+button.key).title+" · "+(button.always?"Toujours affiché":"Tactile uniquement"));rows.addView(row);row.setOnClickListener(view->edit(activity,button,buttons,settings,refresh[0],applied));}};refresh[0].run();
        Button add=new Button(activity);add.setText("Créer un bouton");content.addView(add);add.setOnClickListener(view->{if(buttons.size()>=TouchButton.MAX_BUTTONS){Toast.makeText(activity,"Maximum : 12 boutons",Toast.LENGTH_SHORT).show();return;}edit(activity,null,buttons,settings,refresh[0],applied);});
        ScrollView scroll=new ScrollView(activity);scroll.addView(content);
        new AlertDialog.Builder(activity).setTitle("Mes boutons à l’écran").setView(scroll).setPositiveButton("Fermer",(d,w)->{if(applied!=null)applied.run();}).show();
    }
    private static void edit(Activity activity,TouchButton original,List<TouchButton> buttons,CustomButtons settings,Runnable refresh,Runnable applied) {
        LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(24,12,24,12);
        TextView nameLabel=new TextView(activity);nameLabel.setText("Nom du bouton");content.addView(nameLabel);
        EditText name=new EditText(activity);name.setSingleLine(true);name.setFilters(new InputFilter[]{new InputFilter.LengthFilter(20)});name.setHint("Ex. : NexLux, Zoom…");if(original!=null)name.setText(original.label);content.addView(name);
        int[] key={original==null?34:original.key};Button choose=new Button(activity);Runnable updateKey=()->choose.setText("Touche : "+KeyboardKeys.fromAction("key:"+key[0]).title+" · Modifier");updateKey.run();content.addView(choose);
        choose.setOnClickListener(view->KeyboardPickerDialog.show(activity,action->{key[0]=KeyboardKeys.fromAction(action).code;updateKey.run();}));
        RadioGroup modes=new RadioGroup(activity);RadioButton always=new RadioButton(activity);always.setId(android.view.View.generateViewId());always.setText("Toujours affiché · même avec une manette");modes.addView(always);
        RadioButton touch=new RadioButton(activity);touch.setId(android.view.View.generateViewId());touch.setText("Tactile uniquement");modes.addView(touch);modes.check(original==null || !original.always?touch.getId():always.getId());content.addView(modes);
        AlertDialog.Builder builder=new AlertDialog.Builder(activity).setTitle(original==null?"Créer un bouton":"Modifier le bouton").setView(content).setPositiveButton("Enregistrer",null).setNegativeButton("Annuler",null);
        if(original!=null)builder.setNeutralButton("Supprimer",(d,w)->{buttons.remove(original);settings.save(buttons);refresh.run();if(applied!=null)applied.run();});
        AlertDialog dialog=builder.create();dialog.show();dialog.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
            TouchButton value;try{value=new TouchButton(original==null?"custom-"+UUID.randomUUID():original.id,name.getText().toString(),key[0],modes.getCheckedRadioButtonId()==always.getId());}
            catch(IllegalArgumentException error){name.setError("Choisis un nom de 1 à 20 caractères");return;}
            if(original==null)buttons.add(value);else buttons.set(buttons.indexOf(original),value);
            settings.save(buttons);refresh.run();if(applied!=null)applied.run();dialog.dismiss();
        });
    }
}
