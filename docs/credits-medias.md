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

Boucle de 5 à 10 s en H.264, sans son, avec un fondu d'une seconde sur la fin pour raccorder au début. Viser moins de 3 Mo sur ordinateur (1280 px de large, 1600 pour le haut de page) et moins de 1 Mo sur téléphone (960 px de large, 540 x 960 pour le haut de l'accueil). Dans le HTML : `<video data-video="<nom>" muted loop playsinline preload="none">`, et `site.js` s'occupe du reste.
