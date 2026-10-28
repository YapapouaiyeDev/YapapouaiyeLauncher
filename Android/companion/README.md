# Compagnon des commandes Android

Petit mod NeoForge client distribué uniquement avec l'APK. Il est distinct de NexLux et ne change aucun JAR du launcher PC. Aucun mod serveur n'est requis.

Sur l'écran de mort uniquement, F8 ouvre une saisie de chat Minecraft. L'adaptateur Android émet le code FCL `KEY_F8 = 66`, qui devient `GLFW_KEY_F8 = 297` dans Minecraft et possède aussi une traduction SDL/Android. Les autres écrans et touches conservent leur comportement. Aucun raccourci n'envoie de commande ou de demande de réapparition automatiquement.

Après envoi ou annulation du chat, Minecraft reconstruit normalement l'écran de mort si le joueur est toujours mort. Ses boutons reprennent le délai vanilla de 20 ticks. Le contrôleur restaure aussi l'écran précédent si un autre chemin de fermeture laisse réellement l'interface vide. Une réapparition, une déconnexion ou un changement de joueur annule ce suivi. Les autres écrans ne sont jamais remplacés.

Les commandes saisies dans cet écran passent par le traitement vanilla du chat et des commandes signées. Elles ne sont ajoutées ni à l'historique récent ni aux brouillons de ce compagnon ; aucun fichier, presse-papiers, journal ou serveur HTTP n'est utilisé pour leur transmission. Le serveur destinataire applique toujours sa propre authentification.

La variante 26.2 comprend également un mixin client qui borne les écritures de l'option gamma à 0–1. Les valeurs FullBright à 100 produisaient auparavant une erreur « Illegal option value » à chaque tick. Le mixin ne change aucune autre option et ne modifie pas NexLux. `GammaRangeTest` couvre les bornes, les valeurs non finies et les écritures répétées ; la validation sur téléphone vérifie l'absence de ces erreurs dans la session réelle.

## Compiler et tester

`powershell -NoProfile -ExecutionPolicy Bypass -File Android/build-companion.ps1`

Le script compile les variantes 26.2 et 1.21.1 contre les JAR Minecraft et NeoForge officiels déjà installés par le launcher. `-GameRoot` choisit un autre dossier Minecraft ; `-GameRoot1211` permet de prendre 1.21.1 dans une installation distincte ; `-JdkDirectory` choisit le dossier `bin` d'un JDK 25. Il exécute auparavant les tests du contrôleur commun. Les sorties se trouvent dans `dist/yapapouaiye-controls-26.2.jar` et `dist/yapapouaiye-controls-1.21.1.jar`. Les dossiers temporaires restent sous `Android/.build/`.

## Provenance et validation

Sources originales de ce dossier : licence MIT. Les dépendances restent externes aux JAR produits. APIs vérifiées dans les dépendances locales officielles Minecraft 26.2 / NeoForge 26.2.0.93 et Minecraft 1.21.1 / NeoForge 21.1.264, notamment `ScreenEvent.KeyPressed.Pre`, `ChatScreen`, `DeathScreen` et les méthodes de changement d'écran. Les tests avec un hôte factice couvrent les changements de joueur et de connexion, l'ouverture refusée, l'annulation et la réapparition. Ils ne confirment pas à eux seuls la réponse d'un serveur à `/login`.
