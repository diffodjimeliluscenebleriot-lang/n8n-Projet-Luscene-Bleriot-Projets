---
name: doubt-driven-dev
description: Développement guidé par le doute - chaque hypothèse est listée et vérifiée, chaque affirmation ("ça marche", "c'est corrigé", "cette fonction existe") doit être prouvée par une exécution réelle avant d'être annoncée. Utilise ce skill quand l'utilisateur demande du "doubt-driven dev", veut un développement rigoureux, ou pour un bug difficile, du code critique, ou quand une solution précédente "qui marchait" s'est avérée fausse.
---

# Doubt-Driven Development

Principe : **tout ce que tu crois est suspect tant que tu ne l'as pas vérifié.** Ta mémoire, la doc, les noms de fonctions, ton propre code et même les tests qui passent peuvent mentir.

## Règles

1. **Pas d'affirmation sans preuve.** Interdit de dire « ça marche », « c'est corrigé » ou « c'est bon » sans avoir exécuté quelque chose qui le montre. Cite la commande et sa sortie.
2. **Vérifie avant d'utiliser.** Une API, une option, un fichier, une version : lis le code source ou la doc réelle du projet au lieu de te fier à ta mémoire.
3. **Un test qui n'a jamais échoué ne prouve rien.** Écris le test, vérifie qu'il **échoue** pour la bonne raison, puis fais-le passer.
4. **Doute de ton propre correctif.** Après une correction, demande-toi : « Et si j'avais corrigé le symptôme et pas la cause ? » Reproduis le bug d'origine pour vérifier qu'il a disparu.
5. **Distingue clairement** ce qui est *vérifié*, ce qui est *supposé* et ce qui est *inconnu*.

## Boucle de travail

Pour chaque étape :

1. **Hypothèses** : liste ce que tu tiens pour vrai et qui conditionne ta solution.
   > H1 : la fonction `parse()` renvoie `null` si l'entrée est vide - *non vérifié*
2. **Vérification** : pour chaque hypothèse critique, trouve le moyen le moins cher de la confirmer ou de l'infirmer (lire le code, lancer un script d'une ligne, un test, un log).
3. **Changement minimal** : modifie le moins de choses possible, une à la fois.
4. **Preuve** : exécute et montre le résultat. Si le résultat te surprend, même un peu, **arrête-toi et comprends pourquoi** avant de continuer.
5. **Contre-examen** : cherche activement ce qui pourrait encore casser (entrée vide, null, très grand volume, concurrence, Windows/Linux, encodage).

## Rapport final

Termine toujours par :

```markdown
## Vérifié
- <affirmation> - preuve : <commande / test / sortie>

## Supposé (non vérifié)
- <hypothèse> - pourquoi je n'ai pas pu la vérifier

## Risques restants
- ...

## Niveau de confiance : faible / moyen / élevé - <justification en une phrase>
```

Si quelque chose n'a pas pu être vérifié, dis-le clairement. Ne remplis pas les trous avec de l'optimisme.
