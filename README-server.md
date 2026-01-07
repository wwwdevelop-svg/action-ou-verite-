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

## Déploiement sur Render (recommandé pour commencer)

Le dépôt contient un `render.yaml` prêt à l'emploi pour créer un service Web Docker sur Render. Pour déployer :

1. Va sur https://render.com et connecte ton compte GitHub.
2. Crée un nouveau service, choisis **Web Service**, sélectionne ce repo et la branche `feat/action-ou-verite`.
3. Render détectera `render.yaml` et utilisera le `Dockerfile` situé dans `server/Dockerfile`.
4. La variable `PORT` est gérée automatiquement par Render — le serveur écoute sur `process.env.PORT || 3000`.

Si tu veux que je crée un workflow GitHub Actions pour déclencher un déploiement via l'API Render (en utilisant un `RENDER_API_KEY` stocké dans les Secrets), dis‑le moi et je l'ajoute.
