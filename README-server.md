# Server & Deployment (Action ou Vérité)

Cette doc explique comment lancer le serveur localement et les options de déploiement.

## Lancer en local
1. cd server
2. npm install
3. npm start
4. Ouvre http://localhost:3000

## Docker
- Build: docker build -t action-ou-verite:local ./server
- Run: docker run -p 3000:3000 action-ou-verite:local

## CI / Publication d'image (GHCR)
La workflow `docker-publish.yml` construit une image depuis `/server` et publie vers `ghcr.io/${{ github.repository_owner }}/action-ou-verite`.

Pour déployer automatiquement depuis l'image Docker, tu peux connecter Render / Railway / Cloud Run à la registry GHCR ou configurer un déploiement via GitHub Actions vers le provider choisi.

--
Si tu veux, je peux :
- ajouter un workflow pour déployer vers **Render** (via render-cli or GitHub integration),
- ou ajouter un workflow pour **Cloud Run** (nécessite un secret service account).
