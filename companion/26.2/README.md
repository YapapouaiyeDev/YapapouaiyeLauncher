# NexLux pour Minecraft 26.2

Sources récupérées du compagnon distribué, puis portées vers Minecraft 26.2,
NeoForge 26.2.0.90 et Java 25. Le JAR 1.21.1 reste distinct : renommer un JAR
ne change pas sa compatibilité binaire.

## Compilation sous Windows

Installer Minecraft 26.2 et NeoForge 26.2.0.90 avec le launcher, puis exécuter :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-companion-26.2.ps1
```

Le paramètre `-GameRoot` permet de préciser le dossier Minecraft. Le script
utilise le JDK 25 installé par le launcher et les dépendances déclarées par
les deux JSON de version. Il compile dans un nouveau dossier temporaire,
puis remplace `mods/nexlux-26.2.jar` et `src/assets/nexlux-26.2.jar` seulement
après compilation et création réussies du JAR.

## Invariants

- Le launcher sélectionne le compagnon selon la version Minecraft et NeoForge.
- Les métadonnées du mod refusent les versions Minecraft incompatibles.
- Aucun appel à `Options.save()` pendant l'initialisation : il effacerait les
  raccourcis des mods qui n'ont pas encore enregistré leurs touches.
- Les positions du HUD restent enregistrées dans les deux fichiers de
  configuration client historiques.

## Vérification du 13 octobre 2026

Compilation avec les dépendances installées et démarrage NeoForge dans un
dossier temporaire, avec un utilisateur de test sans authentification et
sans ouverture de monde. NexLux est chargé et les ressources graphiques
terminent leur initialisation sans erreur de chargement du mod. Le menu en
jeu, le déplacement du HUD et une connexion serveur restent à vérifier
dans une partie réelle.
