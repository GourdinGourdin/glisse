# Crédits des vidéos

Toutes les vidéos du site viennent de [Pexels](https://www.pexels.com/fr-fr/license/) : usage gratuit, commercial compris, attribution non obligatoire. Le pied de page cite quand même Pexels.

Les fichiers sont dans `landing/assets/video/`. Chaque clip a trois versions : `<nom>.mp4` (ordinateur), `<nom>-m.mp4` (téléphone) et `<nom>.jpg` (image fixe). `hero-surf` a aussi `hero-surf-m.jpg`.

| Fichier | Où | Source Pexels | Auteur |
|---|---|---|---|
| `hero-surf` | Accueil, haut de page | [17092117](https://www.pexels.com/fr-fr/video/17092117/) | Daniel Halabi |
| `sport-surf` | Panneau Surf, bandeau de fin de la page À propos | [4782485](https://www.pexels.com/fr-fr/video/4782485/) | Jess Loiterton |
| `sport-voile` | Panneau Voile | [8906208](https://www.pexels.com/fr-fr/video/8906208/) | Los Muertos Crew |
| `sport-kite` | Panneau Kite | [13461741](https://www.pexels.com/fr-fr/video/13461741/) | Claudio AFC |
| `sport-paddle` | Panneau Paddle | [4769106](https://www.pexels.com/fr-fr/video/4769106/) | Martina Tomšič |
| `sport-windsurf` | Panneau Windsurf | [5491966](https://www.pexels.com/fr-fr/video/5491966/) | Dan Cristian Pădureț |
| `ligne-coucher` | Comment ça marche | [4782219](https://www.pexels.com/fr-fr/video/4782219/) | Jess Loiterton |
| `ecole-planche` | Section Écoles | [7938440](https://www.pexels.com/fr-fr/video/7938440/) | Kampus Production |
| `ecume` | Pied de page | [15456695](https://www.pexels.com/fr-fr/video/15456695/) | Daniel Torobekov |
| `vague-doree` | Page À propos, haut de page | [4961454](https://www.pexels.com/fr-fr/video/4961454/) | ArtHouse Studio |

Les pages Pexels refusent la lecture automatique : les auteurs viennent des fiches de résultats de recherche. Vérifier un nom sur sa page avant de le citer publiquement.

## Règles à garder

- La licence Pexels interdit de laisser croire qu'une personne filmée recommande un produit. Pas de légende, de nom ni de témoignage sur une vidéo où quelqu'un est reconnaissable, en particulier `ecole-planche` et `sport-paddle`.
- Pas d'enfant reconnaissable dans les vidéos du site.
- Ne pas indiquer de lieu sur une vidéo : aucun de ces clips n'est garanti tourné en France.

## Ajouter ou refaire un clip

Partir de la meilleure source Pexels (4K si elle existe). Boucle de 5 à 10 s en H.264, sans son, avec un fondu d'une seconde sur la fin pour raccorder au début. L'eau et l'écume demandent beaucoup de débit : ne pas descendre sous ces réglages, sinon l'image devient floue. Ordinateur : 1920 px de large, CRF 21, 6 Mbit/s au plus (2560 px et 8 Mbit/s pour le haut de l'accueil). Téléphone : 1280 px de large, CRF 25, 2,2 Mbit/s au plus (1080 x 1920 et 3 Mbit/s pour le haut de l'accueil). Ne pas zoomer une vidéo en CSS : recadrer à l'encodage. Dans le HTML : `<video data-video="<nom>" muted loop playsinline preload="none">`, et `site.js` s'occupe du reste.
