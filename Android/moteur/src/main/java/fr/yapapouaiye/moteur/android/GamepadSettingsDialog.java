/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;
import android.app.Activity;
import android.app.AlertDialog;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.widget.*;
import fr.yapapouaiye.moteur.input.GamepadBindings;
import fr.yapapouaiye.moteur.input.GamepadLook;

public final class GamepadSettingsDialog {
    private GamepadSettingsDialog() { }
    public static void show(Activity activity,Runnable applied) {
        GamepadSettings settings=new GamepadSettings(activity);
        String[] actions=new String[GamepadBindings.BUTTONS.length];
        Button[] rows=new Button[actions.length];
        LinearLayout layout=new LinearLayout(activity);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(20,12,20,12);
        TextView sensitivityLabel=new TextView(activity);layout.addView(sensitivityLabel);
        SeekBar sensitivity=new SeekBar(activity);sensitivity.setMin(GamepadLook.MIN);sensitivity.setMax(GamepadLook.MAX);sensitivity.setKeyProgressIncrement(25);sensitivity.setProgress(settings.lookSensitivity());layout.addView(sensitivity);
        sensitivityLabel.setText("Sensibilité du stick droit : "+sensitivity.getProgress()+" %");
        sensitivity.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar,int value,boolean user) { sensitivityLabel.setText("Sensibilité du stick droit : "+value+" %"); }
            public void onStartTrackingTouch(SeekBar bar) { }
            public void onStopTrackingTouch(SeekBar bar) { }
        });
        TextView sensitivityHelp=new TextView(activity);sensitivityHelp.setText("Vitesse de rotation en jeu : 100 % = ancienne vitesse ; 300 % = trois fois plus rapide. Jusqu’à 2000 % (×20). Appliquer prend effet tout de suite. Le tactile et le curseur des menus gardent leur propre vitesse.");layout.addView(sensitivityHelp);
        TextView help=new TextView(activity);help.setText("Choisis un bouton, puis son action. Tu peux aussi appuyer sur un bouton de ta manette pour le sélectionner.\n\nProfil commun aux manettes Xbox / PlayStation. Stick gauche : déplacement ; stick droit : caméra. Les boutons se relâchent quand tu les relâches.");layout.addView(help);
        for(int i=0;i<actions.length;i++) {
            final int index=i;actions[i]=settings.action(i);Button button=new Button(activity);rows[i]=button;update(button,index,actions[index]);layout.addView(button);
            button.setOnClickListener(view -> choose(activity,rows,actions,index));
        }
        Button reset=new Button(activity);reset.setText("Rétablir les affectations par défaut");layout.addView(reset);
        reset.setOnClickListener(view -> {for(int i=0;i<actions.length;i++){actions[i]=GamepadBindings.defaultAction(i);update(rows[i],i,actions[i]);}});
        ScrollView scroll=new ScrollView(activity);scroll.addView(layout);
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Manette · sensibilité et boutons").setView(scroll)
            .setPositiveButton("Appliquer",(d,w) -> {settings.save(actions,sensitivity.getProgress());if(applied!=null)applied.run();Toast.makeText(activity,"Réglages de manette enregistrés",Toast.LENGTH_SHORT).show();})
            .setNegativeButton("Annuler",null).create();
        dialog.setOnKeyListener((d,code,event) -> {
            if(!controller(event))return false;
            int index=GamepadBindings.buttonIndex(code);
            if(index>=0 && event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0)choose(activity,rows,actions,index);
            return true;
        });
        dialog.show();
    }
    private static boolean controller(KeyEvent event) {
        InputDevice device=event.getDevice();int sources=device==null?event.getSource():device.getSources();
        return (sources&InputDevice.SOURCE_GAMEPAD)==InputDevice.SOURCE_GAMEPAD || (sources&InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK;
    }
    private static void choose(Activity activity,Button[] rows,String[] actions,int index) {
        new AlertDialog.Builder(activity).setTitle(GamepadBindings.LABELS[index]).setSingleChoiceItems(GamepadBindings.TITLES,GamepadBindings.actionIndex(actions[index]),(dialog,which)->{
            actions[index]=GamepadBindings.ACTIONS[which];update(rows[index],index,actions[index]);dialog.dismiss();
        }).setPositiveButton("Touche clavier…",(dialog,which)->KeyboardPickerDialog.show(activity,key->{actions[index]=key;update(rows[index],index,key);}))
            .setNegativeButton("Annuler",null).show();
    }
    private static void update(Button button,int index,String action) { button.setText(GamepadBindings.LABELS[index]+"  →  "+GamepadBindings.title(action)); }
}
