# NexLux pour Minecraft 26.2

Sources récupérées du compagnon distribué, puis portées vers Minecraft 26.2,
NeoForge 26.2.0.93 et Java 25. Le JAR 1.21.1 reste distinct : renommer un JAR
ne change pas sa compatibilité binaire.

## Compilation sous Windows

Installer Minecraft 26.2 et NeoForge 26.2.0.93 avec le launcher, puis exécuter :

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
- Sans pièce d'armure équipée, le HUD d'armure ne dessine rien, y compris
  son fond sombre. L'éditeur conserve les pièces d'exemple.
- Le menu recalcule sa grille et sa recherche à chaque redimensionnement.
  Le dessin, les zones de clic et le défilement partagent `ClientMenuLayout`.
- La popup se déplace par sa barre de titre et se redimensionne depuis son
  coin inférieur droit. Un double-clic sur le titre restaure sa géométrie.
  `clientMenu` conserve ses dimensions préférées et sa position relative dans
  les deux configurations client. Une petite fenêtre de jeu ne détruit pas
  les dimensions choisies ; la sauvegarde se fait à la fin du geste.
- Les pictogrammes sont dessinés par `ClientIcons`, sans dépendre des emoji
  de la police Minecraft. Les titres utilisent une couleur ARGB opaque.
- Les fonds des compteurs FPS/CPS/ping/vitesse épousent leur texte avec
  quatre pixels de marge. L'éditeur aimante leurs bords et utilise les mêmes
  rectangles que le HUD en jeu, même quand les compteurs ont des largeurs différentes.
- `hudReferenceWidth`, `hudReferenceHeight`, `hudAnchorX` et `hudAnchorY`
  accompagnent les positions historiques dans les deux configurations client.
  Les ancrages restent stables entre fenêtre et plein écran ; les anciens
  fichiers sont repris automatiquement, y compris leurs positions hors écran.
- Une position devenue hors écran est recalée même si la taille de fenêtre
  n'a pas changé. Si une ligne XYZ ne tient plus avec une grande échelle GUI,
  les trois axes restent affichés sur des lignes séparées, dans le HUD et l'éditeur.
- Night Vision est réappliquée à la connexion et après suppression de l'effet
  par le serveur. Le launcher conserve aussi le réglage enregistré dans le jeu
  lors de la prochaine synchronisation des options.

## Tests du menu et du redimensionnement

`node --test scripts/test-nexlux-ui.cjs scripts/test-armor-hud.cjs scripts/test-companion-mod.cjs`
exécute les méthodes distribuées dans le JAR contre des services de jeu simulés.
Il couvre la grille, les pictogrammes, le défilement, les clics et cinq tailles
de fenêtre, ainsi que les ancrages du HUD et l'alignement des compteurs. Il
vérifie aussi les gestes de déplacement/redimensionnement de la popup, les
limites d'écran et de taille, la recherche conservée, la réouverture et la
sérialisation/restauration de sa géométrie.
Les cas de grande échelle GUI couvrent le rendu des trois coordonnées, les
positions périmées et leur recalage sans redimensionnement. Night Vision est
testée après disparition de l'effet et remplacement du joueur à la reconnexion.
Les captures de l'enregistreur dans `scratch/nexlux-menu-*.png` utilisent une
police de test et ne remplacent pas une vérification visuelle en partie réelle.

## Test du HUD d'armure

Après compilation, `node --test scripts/test-armor-hud.cjs scripts/test-companion-mod.cjs`
exécute les renderers des deux JAR distribués avec un enregistreur graphique
isolé : inventaire vide, chaque emplacement seul, armure complète, aperçu
et durabilité activée ou désactivée. Il vérifie aussi leur injection par le
launcher. Le test utilise le JDK et ASM installés avec NeoForge 26.2 ;
`NEXLUX_GAME_ROOT` permet de préciser leur dossier Minecraft.

Le correctif équivalent du compagnon 1.21.1, dont les sources complètes
ne sont pas disponibles, est conservé dans `scripts/PatchCompanionArmor.java`.
Il s'applique avec le JDK et ASM à un JAR non encore corrigé, vers un nouveau
fichier de sortie, avant de remplacer les deux copies distribuées.

## Vérification du 13 octobre 2026

Compilation avec les dépendances installées et démarrage NeoForge dans un
dossier temporaire, avec un utilisateur de test sans authentification et
sans ouverture de monde. NexLux est chargé et les ressources graphiques
terminent leur initialisation sans erreur de chargement du mod. Le menu en
jeu, le déplacement du HUD et une connexion serveur restent à vérifier
dans une partie réelle.

## Potion Timer et Saturation — 26 octobre 2026

Les deux modules se trouvent dans le menu NexLux. Un clic gauche active ou
désactive chaque module ; un clic droit ouvre ses réglages. Dans l'éditeur
HUD, glisser déplace Potion Timer avec la même aimantation que les compteurs ;
le clic droit ouvre les réglages. Survoler le module et tourner la molette
modifie sa taille par pas de 5 %, de 50 à 300 %, avec sauvegarde immédiate et
indépendante pour chaque module. La molette fait défiler les réglages sur
une petite fenêtre. Les nouveaux modules sont désactivés par défaut.

- Potion Timer lit les effets actifs du joueur, avec leurs icônes Minecraft,
  noms traduits, niveaux romains et durées MM:SS (∞ pour un effet permanent).
  Les informations et le fond peuvent être masqués séparément. Les exemples
  apparaissent uniquement dans l'éditeur, jamais dans le HUD en jeu.
- Saturation se superpose au HUD natif : contours dorés sur la nourriture,
  aperçu translucide de la nourriture tenue en main et des cœurs récupérables.
  Il n'y a plus de panneau séparé, de fond rectangulaire ni de position à déplacer.
  Les trois affichages se désactivent indépendamment ; le contour utilise RRGGBB.
  Les hooks suivent les coordonnées natives, y compris le tremblement, les rangées
  de cœurs et le mode hardcore. Les cœurs d'absorption restent intacts.
  La récupération est une estimation de la régénération naturelle : les règles
  et les effets du serveur restent déterminants. Aucun aperçu de récupération
  n'est affiché sans nourriture consommable, sous poison/flétrissement ou sans
  valeur de saturation reçue. Les contours partiels restent dans les 9 × 9 pixels
  de l'icône. La taille suit l'échelle GUI de Minecraft.
- Chaque module conserve indépendamment ses réglages dans les deux fichiers
  client historiques. La synchronisation des options par le launcher les préserve.
  Le rendu réduit temporairement l'échelle si nécessaire pour tenir dans la
  fenêtre. Lorsqu'un module change de dimensions, il recherche la place libre
  la plus proche sans déplacer les autres modules. Si la fenêtre est trop
  remplie pour tout contenir, il reste dans les limites de l'écran.
- La saturation utilise en priorité `ServerPlayer.getFoodData()` via le
  canal NeoForge facultatif de NexLux. Avec le JAR NexLux 26.2 sur le serveur,
  chaque changement est transmis, puis un rappel toutes les cinq secondes.
  Sans ce canal (ou après dix secondes sans rappel), le HUD utilise la dernière
  saturation reçue dans un paquet de santé Minecraft, sans nécessiter de mod
  serveur. Minecraft ne renvoie pas ces paquets à chaque changement de saturation,
  donc cette lecture peut dater. Aucun contour n'apparaît tant qu'aucune valeur
  serveur n'est disponible ; la valeur locale par défaut n'est jamais présentée
  comme une mesure. Une déconnexion
  ou un nouveau joueur invalident les deux sources.
  Voir aussi la [documentation des payloads NeoForge](https://docs.neoforged.net/docs/networking/payload/).
- Night Vision conserve son fonctionnement mais ne supprime ni ne remplace
  plus une potion de vision nocturne normale reçue du serveur.

Validation : compilation contre Minecraft 26.2, NeoForge 26.2.0.93 et Java 25 ;
`node --test scripts/test-nexlux-ui.cjs scripts/test-armor-hud.cjs scripts/test-companion-mod.cjs scripts/test-hud-persistence.cjs`.
Les tests exécutent les classes du JAR distribué contre des services isolés :
effets actifs/expirés/infinis, masquage des informations et du fond, saturation
0/20/fractionnaire, protocole, absence de canal, rappel limité, reconnexion,
expiration des données, rectangles compacts, déplacement et aimantation,
redimensionnement, champs incomplets, sauvegarde/rechargement réels via Gson,
préservation des options par le launcher et régression du HUD d'armure.
Le correctif de saturation couvre aussi le hook des paquets de santé, la
priorité du canal NexLux, le basculement après expiration, les valeurs invalides,
la déconnexion, les contours entiers/partiels confinés aux icônes, la nourriture
en main secondaire, les cœurs prévisionnels et l'absence de panneau déplaçable.
Le calcul des lignes de potion est mis en cache par tick ; les dimensions
n'allouent pas de nouvelles listes à chaque image.

À confirmer en partie réelle : rendu avec packs de ressources, solo et serveur
NeoForge avec/sans ce JAR, mort/changement de dimension, redémarrage complet,
petite/grande échelle GUI et mesure comparative des FPS. Les services isolés
ne constituent pas une validation en partie réelle ni une mesure des FPS.

Les tests supplémentaires du mode veille passent pour les deux compagnons,
et celui du relais réseau passe avec NeoForge 26.2.0.93. Les vérifications du
relais avec 21.1.264, 26.2.0.88 et 26.2.0.90 ne sont pas exécutables sur cette
machine : leurs fichiers de version NeoForge ne sont pas installés.
