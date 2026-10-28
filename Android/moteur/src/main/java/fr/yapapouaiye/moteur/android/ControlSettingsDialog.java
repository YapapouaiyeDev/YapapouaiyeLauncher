/* SPDX-License-Identifier: GPL-3.0-or-later */
package fr.yapapouaiye.moteur.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.*;

public final class ControlSettingsDialog {
    private static final int TEXT = Color.rgb(239, 245, 248);
    public static void show(Activity activity, Runnable applied) {
        ControlSettings settings = new ControlSettings(activity);
        LinearLayout content = new LinearLayout(activity); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(24, 12, 24, 18);
        content.setBackgroundColor(Color.rgb(18, 25, 32));
        addText(content, "Moteur Yapapouaiye · réglages tactiles\nAucun verrouillage automatique : relève le doigt pour relâcher une commande.", 16);
        Button gamepad=new Button(activity);gamepad.setText("Manette · sensibilité et boutons");content.addView(gamepad);
        gamepad.setOnClickListener(view -> GamepadSettingsDialog.show(activity,applied));
        Button custom=new Button(activity);custom.setText("Mes boutons à l’écran · créer / modifier");content.addView(custom);
        custom.setOnClickListener(view->CustomButtonsDialog.show(activity,applied));
        SeekBar sensitivity = slider(content, "Sensibilité de la caméra tactile", settings.sensitivity(), 25, 200);
        SeekBar size = slider(content, "Taille des commandes", settings.size(), 75, 140);
        SeekBar opacity = slider(content, "Visibilité des commandes", settings.opacity(), 25, 95);
        SeekBar resolution = slider(content, "Résolution du jeu · prochain lancement", settings.resolution(), 50, 100);
        addText(content,"Moteur graphique · prochain lancement",14);
        String[] rendererIds={"auto","zink","krypton"};
        Spinner renderer=new Spinner(activity);renderer.setAdapter(new ArrayAdapter<>(activity,android.R.layout.simple_spinner_dropdown_item,new String[]{"Automatique · compatibilité","Zink · Vulkan système","Krypton · OpenGL ES"}));
        renderer.setBackgroundColor(Color.rgb(238,245,241));
        for(int i=0;i<rendererIds.length;i++)if(rendererIds[i].equals(settings.renderer()))renderer.setSelection(i);content.addView(renderer);
        addText(content,"Automatique utilise Zink pour Minecraft 26.2 afin de rendre les shaders du terrain. Krypton reste disponible pour les autres versions ou pour comparer.",13);
        Button performance=new Button(activity);performance.setText("Profil Fluidité · résolution 75 %, 6 chunks, 60 FPS");content.addView(performance);
        boolean[] performanceSelected={false};
        performance.setOnClickListener(view -> { resolution.setProgress(75);performanceSelected[0]=true;Toast.makeText(activity,"Profil Fluidité sélectionné · appliquer puis relancer le jeu",Toast.LENGTH_LONG).show(); });
        Switch left = new Switch(activity); left.setText("Disposition gaucher"); left.setTextColor(TEXT); left.setMinHeight(52); left.setChecked(settings.leftHanded()); content.addView(left);
        addText(content, "Réduire la résolution peut améliorer la fluidité. Les positions personnalisées restent prioritaires sur la disposition gaucher.", 13);
        Button reset = new Button(activity); reset.setText("Réinitialiser la disposition des touches"); content.addView(reset);
        reset.setOnClickListener(v -> { settings.resetLayout(); Toast.makeText(activity, "Disposition réinitialisée", Toast.LENGTH_SHORT).show(); });
        Button lab = new Button(activity); lab.setText("Essayer et déplacer les touches"); content.addView(lab);
        Runnable save = () -> {settings.save(sensitivity.getProgress(), size.getProgress(), opacity.getProgress(), resolution.getProgress(), left.isChecked());settings.renderer(rendererIds[renderer.getSelectedItemPosition()]);if(performanceSelected[0])activity.getSharedPreferences("yapapouaiye",Activity.MODE_PRIVATE).edit().putString("preset","performance").apply();};
        lab.setOnClickListener(v -> { save.run(); activity.startActivity(new Intent(activity, TouchLabActivity.class)); });
        ScrollView scroll = new ScrollView(activity); scroll.addView(content);
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle("Commandes Yapapouaiye").setView(scroll)
            .setPositiveButton("Appliquer", (d,w) -> { save.run(); if (applied != null) applied.run(); })
            .setNegativeButton("Fermer", (d,w) -> { if (applied != null) applied.run(); }).create();
        dialog.setOnCancelListener(d -> { if (applied != null) applied.run(); });
        dialog.show();
    }
    private static SeekBar slider(LinearLayout parent, String title, int value, int min, int max) {
        TextView label = addText(parent, title + " : " + value + " %", 14);
        SeekBar bar = new SeekBar(parent.getContext()); bar.setMin(min); bar.setMax(max); bar.setProgress(value); bar.setMinimumHeight(48); parent.addView(bar);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar b,int progress,boolean user) { label.setText(title + " : " + progress + " %"); }
            public void onStartTrackingTouch(SeekBar b) { }
            public void onStopTrackingTouch(SeekBar b) { }
        });
        return bar;
    }
    private static TextView addText(LinearLayout parent, String text, int size) {
        TextView view = new TextView(parent.getContext()); view.setText(text); view.setTextColor(TEXT); view.setTextSize(size); view.setPadding(0, 12, 0, 8); parent.addView(view); return view;
    }
}
