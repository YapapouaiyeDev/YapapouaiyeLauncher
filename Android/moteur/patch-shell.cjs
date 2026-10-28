// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

/*
 * Presentation-only transforms, applied by patch-upstream.cjs to the pinned
 * upstream originals. The runtime installer, its error handling, cancellation,
 * task listeners and FCL view classes remain intact. Java/graphics are required
 * compatibility components, not a newly implemented JVM or Minecraft renderer.
 *
 * Scope/limits: the technical runtime table and task log/list stay in the view
 * tree, hidden behind GONE ancestors where needed so findViewById/ViewBinding
 * keep their original IDs and types. Progress is indeterminate, not a fabricated
 * percentage. Existing error, EULA and permissions dialogs are not rewritten.
 * dialog_task.xml is shared by TaskDialog callers; its presentation changes for
 * all of them. Logs remain written by the engine, but are not shown in this
 * compact waiting window. Installation retry behavior is unchanged.
 */

const VIEW = 'com.tungsten.fcllibrary.component.view.';

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oneMatch(text, pattern, name) {
  const matches = [...text.matchAll(new RegExp(pattern.source, 'g'))];
  if (matches.length !== 1) {
    throw new Error(`Intégration écran Android absente ou ambiguë : ${name}`);
  }
  return matches[0][0];
}

function attributes(tag, changes) {
  for (const [name, value] of Object.entries(changes)) {
    const pattern = new RegExp(`\\s+${escaped(name)}="[^"]*"`);
    if (value === null) {
      tag = tag.replace(pattern, '');
    } else if (pattern.test(tag)) {
      tag = tag.replace(pattern, `\n        ${name}="${value}"`);
    } else {
      tag = tag.replace(/\s*(\/?>)$/, `\n        ${name}="${value}" $1`);
    }
  }
  return tag;
}

function editId(text, id, changes, replaceOnce) {
  const tag = oneMatch(text,
    new RegExp(`<[^!?/][^>]*\\bandroid:id="@\\+?id/${escaped(id)}"[^>]*>`), id);
  return replaceOnce(text, tag, attributes(tag, changes));
}

function editRoot(text, type, changes, replaceOnce) {
  const tag = oneMatch(text, new RegExp(`<${escaped(type)}\\b[^>]*>`), type);
  return replaceOnce(text, tag, attributes(tag, changes));
}

function viewTypes(text) {
  const result = new Map();
  const tags = text.matchAll(/<([\w.$:-]+)\b([^>]*\bandroid:id="@\+?id\/([\w]+)"[^>]*)>/g);
  for (const [, type, , id] of tags) {
    if (result.has(id)) throw new Error(`Identifiant Android dupliqué : ${id}`);
    result.set(id, type);
  }
  return result;
}

function preserveBindings(original, transformed, name) {
  const before = viewTypes(original);
  const after = viewTypes(transformed);
  for (const [id, type] of before) {
    if (after.get(id) !== type) {
      throw new Error(`Contrat ViewBinding modifié dans ${name} : ${id} (${type})`);
    }
  }
  return transformed;
}

module.exports = {
  'FCL/src/main/res/layout/activity_splash.xml': (original, replaceOnce) => {
    let text = editRoot(original, 'androidx.constraintlayout.widget.ConstraintLayout', {
      'android:background': '#0B0D13',
    }, replaceOnce);
    const fragment = oneMatch(text, /<androidx\.fragment\.app\.FragmentContainerView\b[^>]*>/, 'fragment de démarrage');
    text = replaceOnce(text, fragment, `
    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="0dp"
        android:gravity="center"
        android:orientation="vertical"
        android:padding="24dp"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent">

        <ImageView
            android:layout_width="64dp"
            android:layout_height="64dp"
            android:importantForAccessibility="no"
            android:src="@drawable/yapapouaiye_logo" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="16dp"
            android:gravity="center"
            android:text="Yapapouaiye Launcher"
            android:textColor="#FFFFFF"
            android:textSize="22sp"
            android:textStyle="bold" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:text="Ouverture du launcher…"
            android:textColor="#AFB7CA"
            android:textSize="14sp" />
    </LinearLayout>

    ${fragment}`);
    return preserveBindings(original, text, 'activity_splash.xml');
  },

  'FCL/src/main/java/com/tungsten/fcl/activity/SplashActivity.kt': (text, replaceOnce) =>
    replaceOnce(text,
      '        ImageUtil.loadInto(\n            binding.background, ThemeEngine.getInstance().getTheme().getBackground(this)\n        )',
      '        binding.background.setBackgroundColor(android.graphics.Color.rgb(11, 13, 19))'),

  'FCL/src/main/res/layout/fragment_runtime.xml': (original, replaceOnce) => {
    let text = editRoot(original, 'androidx.constraintlayout.widget.ConstraintLayout', {
      'android:background': '#0B0D13',
    }, replaceOnce);
    text = editId(text, 'title', {
      'android:background': '@android:color/transparent',
      'android:padding': '24dp',
      'android:text': 'Yapapouaiye Launcher',
      'android:textColor': '#FFFFFF',
      'android:textSize': '22sp',
      'android:textStyle': 'bold',
      'app:auto_text_background_tint': null,
      'app:auto_text_tint': null,
    }, replaceOnce);
    text = editId(text, 'runtime_parent', {
      'android:visibility': 'gone',
      'android:importantForAccessibility': 'noHideDescendants',
    }, replaceOnce);
    text = editId(text, 'split', {'android:visibility': 'gone'}, replaceOnce);
    text = editId(text, 'install', {
      'android:layout_marginStart': '24dp',
      'android:layout_marginEnd': '24dp',
      'android:layout_marginBottom': '20dp',
      'android:text': 'Préparer et continuer',
      'android:contentDescription': 'Préparer les composants Java nécessaires puis ouvrir Yapapouaiye',
      'app:layout_constraintStart_toEndOf': null,
      'app:layout_constraintStart_toStartOf': 'parent',
    }, replaceOnce);
    const summary = oneMatch(text,
      new RegExp(`<${escaped(VIEW)}FCLTextView\\b[^>]*android:text="@string/splash_runtime_title"[^>]*/>`),
      'description de préparation Java');
    text = replaceOnce(text, summary, `<ScrollView
        android:layout_width="0dp"
        android:layout_height="0dp"
        android:fillViewport="true"
        android:scrollbars="none"
        app:layout_constraintTop_toBottomOf="@id/title"
        app:layout_constraintBottom_toTopOf="@id/install"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:gravity="center"
            android:orientation="vertical"
            android:padding="24dp">

            <ProgressBar
                android:layout_width="40dp"
                android:layout_height="40dp"
                android:indeterminate="true"
                android:indeterminateTint="#FF5262"
                android:contentDescription="Préparation des composants du jeu" />

            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="20dp"
                android:gravity="center"
                android:text="Préparation de Minecraft Java"
                android:textColor="#FFFFFF"
                android:textSize="20sp"
                android:textStyle="bold" />

            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="12dp"
                android:gravity="center"
                android:text="Le support Java et graphique nécessaire au jeu est préparé automatiquement. Garde l’application ouverte pendant cette étape."
                android:textColor="#C1C8D9"
                android:textSize="15sp" />

            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="16dp"
                android:gravity="center"
                android:text="Cette préparation est surtout nécessaire au premier lancement. Le launcher s’ouvrira ensuite automatiquement."
                android:textColor="#929CB3"
                android:textSize="13sp" />
        </LinearLayout>
    </ScrollView>`);
    return preserveBindings(original, text, 'fragment_runtime.xml');
  },

  'FCL/src/main/res/layout/dialog_task.xml': (original, replaceOnce) => {
    // Guard that this is the pinned dialog shape, not an unrelated resource.
    oneMatch(original, /<ListView\b[^>]*android:id="@\+id\/list"[^>]*>/, 'liste de tâches');
    const text = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="320dp"
    android:layout_height="wrap_content"
    android:background="#111723"
    android:padding="24dp"
    android:orientation="vertical">

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="YAPAPOUAIYE LAUNCHER"
        android:textColor="#FF7180"
        android:textSize="12sp"
        android:textStyle="bold" />

    <${VIEW}FCLTextView
        android:id="@+id/title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="12dp"
        android:maxLines="2"
        android:textColor="#FFFFFF"
        android:textSize="21sp"
        android:textStyle="bold"
        android:accessibilityLiveRegion="polite" />

    <ProgressBar
        android:layout_width="36dp"
        android:layout_height="36dp"
        android:layout_gravity="center_horizontal"
        android:layout_marginTop="20dp"
        android:indeterminate="true"
        android:indeterminateTint="#FF5262"
        android:contentDescription="Préparation du jeu en cours" />

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:text="Préparation des fichiers et du support Java. Le jeu s’ouvrira automatiquement quand tout sera prêt."
        android:textColor="#C1C8D9"
        android:textSize="14sp" />

    <!-- Retain every original ID/type for TaskDialog; hide implementation logs
         at the ancestor level because TaskDialog may make logScroll visible. -->
    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:visibility="gone"
        android:importantForAccessibility="noHideDescendants">

        <ListView
            android:id="@+id/list"
            android:layout_width="match_parent"
            android:layout_height="1dp" />

        <ScrollView
            android:id="@+id/logScroll"
            android:layout_width="match_parent"
            android:layout_height="1dp"
            android:visibility="gone">

            <${VIEW}FCLTextView
                android:id="@+id/logView"
                android:layout_width="match_parent"
                android:layout_height="wrap_content" />
        </ScrollView>
    </FrameLayout>

    <androidx.appcompat.widget.LinearLayoutCompat
        android:id="@+id/bottom"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:orientation="horizontal">

        <${VIEW}FCLTextView
            android:id="@+id/speed"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_gravity="center_vertical"
            android:singleLine="true"
            android:textColor="#AFB7CA"
            android:textSize="12sp" />

        <View
            android:layout_width="0dp"
            android:layout_height="0dp"
            android:layout_weight="1" />

        <${VIEW}FCLButton
            android:id="@+id/cancel"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Annuler" />
    </androidx.appcompat.widget.LinearLayoutCompat>
</LinearLayout>
`;
    return preserveBindings(original, text, 'dialog_task.xml');
  },
};
