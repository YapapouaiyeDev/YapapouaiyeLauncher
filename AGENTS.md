# Consignes du projet

## Publication des versions

- Le titre d'une release GitHub doit être exactement son tag : `v` suivi de la version, par exemple `v1.6.1-4-beta.1`. Ne jamais ajouter « Yapapouaiye Launcher », « — Bêta », du Markdown ou un autre texte au titre. Cette convention a été explicitement demandée par l'utilisateur.
- Une version bêta doit rester une préversion GitHub (`prerelease: true`, `make_latest: "false"`), avec le manifeste `beta.yml`. Vérifier le titre et le statut après publication ; ne pas remplacer la dernière release stable par une bêta.

Pour modifier et synchroniser le numéro de version, suivre [VERSION.md](VERSION.md).
