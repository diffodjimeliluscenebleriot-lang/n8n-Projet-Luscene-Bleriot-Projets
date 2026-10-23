---
name: interview
description: Interroge l'utilisateur pour clarifier une demande floue ou ambitieuse AVANT d'écrire du code ou de produire quoi que ce soit, puis rédige une spécification validée. Utilise ce skill quand l'utilisateur dit "interview-moi", "pose-moi des questions", "aide-moi à préciser mon idée", ou quand une demande de fonctionnalité/projet est trop vague pour être exécutée sans deviner.
---

# Interview

Objectif : transformer une idée floue en une spécification claire, **sans rien deviner**. Tu ne codes rien et tu ne crées aucun fichier tant que l'interview n'est pas terminée et que la spec n'est pas validée.

## Avant de commencer

1. Si un projet est ouvert, lis rapidement le contexte (README, structure, fichiers concernés) pour ne pas poser de questions dont la réponse est déjà dans le code.
2. Reformule en une phrase ce que tu as compris de la demande.

## Déroulement

- **Une seule question à la fois.** Attends la réponse avant la suivante.
- Quand c'est possible, propose des **options** (A / B / C) avec ta recommandation, plutôt qu'une question ouverte.
- Va du général au détail :
  1. **Le pourquoi** : quel problème, pour qui, qu'est-ce qui se passe aujourd'hui sans cette solution ?
  2. **Le périmètre** : ce qui est inclus, et surtout ce qui est **exclu**.
  3. **Le comportement** : parcours principal, puis cas limites, erreurs, données vides, volumes.
  4. **Les contraintes** : techno imposée, performance, sécurité, délais, compatibilité.
  5. **Le critère de fin** : comment saura-t-on que c'est réussi ? Comment on le teste ?
- Creuse les réponses vagues (« ça doit être rapide » → « rapide comment ? moins d'1 s ? sur combien de données ? »).
- Signale les contradictions dès que tu les vois.
- Arrête-toi quand tu pourrais implémenter sans faire de supposition importante (en général 5 à 15 questions). Ne pose pas de questions pour le plaisir.

## Sortie

Rédige une spécification courte :

```markdown
# Spec : <titre>

## Problème
## Objectif
## Périmètre
- Inclus :
- Exclu :
## Comportement attendu
## Cas limites et erreurs
## Contraintes
## Critères d'acceptation
- [ ] ...
## Questions encore ouvertes
```

Demande à l'utilisateur de valider ou corriger la spec. Propose ensuite de l'enregistrer (par exemple `SPEC.md`) et de passer à l'implémentation.
