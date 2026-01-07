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

Si tu veux, je peux :

### Déployer via GitHub Actions (optionnel)

Je peux ajouter un workflow qui déclenche un déploiement Render via l'API chaque fois que tu pousses sur la branche `feat/action-ou-verite`.

Étapes pour l'utiliser :

1. Crée une **API Key** Render (Account → API Keys).
2. Dans ton dépôt GitHub, va dans **Settings → Secrets → Actions** et ajoute `RENDER_API_KEY` avec la valeur de l'API Key.
3. Le workflow `deploy-to-render.yml` déclenchera un POST vers l'endpoint Render pour lancer un déploiement du service `srv-d5f9jushg0os73820bsg`.

Je l'ai ajouté dans `.github/workflows/deploy-to-render.yml` et il est configuré pour la branche `feat/action-ou-verite`.

## Déploiement sur Render (recommandé pour commencer)

Le dépôt contient un `render.yaml` prêt à l'emploi pour créer un service Web Docker sur Render. Pour déployer :

1. Va sur https://render.com et connecte ton compte GitHub.
2. Crée un nouveau service, choisis **Web Service**, sélectionne ce repo et la branche `feat/action-ou-verite`.
3. Render détectera `render.yaml` et utilisera le `Dockerfile` situé dans `server/Dockerfile`.
4. La variable `PORT` est gérée automatiquement par Render — le serveur écoute sur `process.env.PORT || 3000`.

Si tu veux que je crée un workflow GitHub Actions pour déclencher un déploiement via l'API Render (en utilisant un `RENDER_API_KEY` stocké dans les Secrets), dis‑le moi et je l'ajoute.
