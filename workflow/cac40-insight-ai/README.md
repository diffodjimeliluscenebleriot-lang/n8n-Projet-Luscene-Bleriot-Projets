# CAC 40 Insight AI

Un **workflow n8n unique** qui analyse les **40 sociétés du CAC 40** sur la période choisie (de un jour à un an glissants), à partir de **cours de clôture réels** et d'une **composition de l'indice actualisée à chaque exécution**. Le rapport final est rédigé en français par **Gemini**, qui ne reçoit que des données déjà calculées.

> Projet pédagogique. Le rapport ne constitue pas un conseil en investissement.

- **Aucun nœud Code, Function ou équivalent** : tous les traitements utilisent des nœuds natifs (Edit Fields, Filter, IF, Split Out, Loop Over Items, Remove Duplicates, Sort, Aggregate, Wait, HTML, Markdown, Form…).
- **Un seul workflow**, entièrement défini dans [`workflow.ts`](workflow.ts), seul fichier de ce dossier.
- **Par défaut, les 40 sociétés sont analysées.** Une sélection personnalisée est aussi possible.

## Ce que fait la version 2

- **Six périodes d'analyse au choix.** Le formulaire propose 1 jour (dernière séance), 1 semaine, 1 mois, 1 trimestre, 1 semestre et 1 an glissants. Le nombre minimal de cotations exigé s'adapte à la période (2 pour un jour, 200 pour un an). Pour « 1 jour », seules les deux dernières séances sont utilisées, et la variation sur la période est alors la variation du jour.
- **Cours du jour à chaque exécution.** Pour chacune des 40 sociétés, le workflow lit à chaque lancement les clôtures EODHD et affiche le **cours de la dernière séance en euros**, sa **variation par rapport à la séance précédente** et sa **variation sur la période**. Le rapport contient un tableau trié de la plus forte hausse à la plus forte baisse, le bilan du jour (nombre de hausses, de baisses et d'inchangées) et les trois plus fortes hausses et baisses. Le message Telegram affiche la date de la dernière séance et le nombre de hausses et de baisses.
- **Deux vrais agents IA (nœud AI Agent).** Chaque agent est relié à un sous-nœud **Google Gemini Chat Model**. Son **prompt système** (Options → System Message) et son **prompt utilisateur** (champ « Prompt ») sont lisibles en clair dans le nœud, et une note du canevas les résume :
  - « Agent IA analyste » : modèle « Modèle Google Gemini (analyste) », outils « Calculatrice » et « Réflexion », format de sortie « Format JSON de l’analyse ». Il produit une analyse structurée : tonalité, points clés, lecture sectorielle, sociétés remarquables, qualité des données et avertissements ;
  - « Agent IA rédacteur » : modèle « Modèle Google Gemini (rédacteur) » et outil « Réflexion du rédacteur ». Il rédige le rapport en 11 sections à partir des chiffres calculés et de l'analyse du premier agent.
  - Les outils sont facultatifs : l'agent décide lui-même s'il les appelle.
- **Analyse par secteur.** Le nœud natif Summarize calcule, pour chaque secteur, le rendement moyen, le meilleur, le plus faible, la volatilité moyenne et la liste des sociétés.
- **Graphiques.** Trois graphiques QuickChart sont intégrés au rapport :
  - le rendement de chaque société, en vert ou rouge selon le signe, avec le pourcentage écrit à côté du nom (par exemple « 1. Capgemini : +19,51 % ») ;
  - le **cours de clôture en euros** de chaque société au début et à la fin de la période (par exemple « Capgemini : 106,10 € → 126,80 € »). Les barres utilisent une échelle logarithmique pour comparer des cours allant de quelques euros à plus de 1 000 € ;
  - le rendement moyen par secteur, avec son pourcentage.
- **Pourcentages lisibles.** Ils sont toujours signés et à 2 décimales (« +1,62 % », « −19,64 % ») dans les graphiques, le classement, le tableau comparatif et Telegram.
- **Comptages fiables.** Le workflow calcule lui-même tous les dénombrements (hausses, baisses, seuils, alertes par type, comptes par secteur) dans l'objet `compteurs`. Gemini a pour consigne de recopier ces valeurs sans jamais compter lui-même : lors d'un premier essai, il s'était trompé en comptant seul.
- **Historique Google Sheets.** À chaque exécution, une ligne par société est ajoutée dans la feuille « CAC 40 Insight AI – Historique ».
- **Telegram.** Un résumé est envoyé, suivi du graphique des rendements. Jusqu'à 6 sociétés, il contient le classement complet ; au-delà, les 3 meilleures et les 3 plus faibles performances. Dans les deux cas, il reprend aussi les points clés de Gemini.
- **Aucun groupe replié** : tous les nœuds sont visibles, et 9 notes de couleur expliquent chaque étape.

## Fichiers

| Fichier | Rôle |
|---|---|
| `workflow.ts` | Définition du workflow avec le SDK officiel `@n8n/workflow-sdk` |

## Prérequis

- Une instance n8n récente, sur n8n Cloud ou auto-hébergée. Les versions de nœuds utilisées sont Form Trigger 2.6, HTTP Request 4.5, Edit Fields 3.5, AI Agent 3.1 et Google Gemini Chat Model 1.2.
- Une clé API **EODHD** (https://eodhd.com).
- Une clé **Google AI Studio** pour Gemini.
- *Facultatif* : un compte Gmail connecté à n8n, pour recevoir le rapport par e-mail.

## Sources de données

| Donnée | Source | Détails |
|---|---|---|
| Composition du CAC 40 | API MediaWiki (documentée) : `https://en.wikipedia.org/w/api.php?action=parse&page=CAC_40&prop=text\|revid` | Le workflow lit le tableau `#constituents` (nom, secteur, symbole) avec le nœud HTML. Le numéro de révision Wikipédia utilisé est conservé dans le rapport. |
| Contrôle de la composition | Liste de contrôle intégrée (nœud « Liste de contrôle CAC 40 ») | Elle contient les 40 symboles relevés le 22/10/2026 sur Wikipédia en (révision 1381078418) et fr (révision 240488739), deux sources concordantes. Elle sert à détecter les entrées et sorties de l'indice, les doublons, les symboles invalides et l'absence des 10 sociétés clés. Elle ne sert de **secours** que si Wikipédia est inaccessible, et le rapport l'indique alors (« composition NON actualisée »). |
| Cours historiques | EODHD End-of-Day API : `GET https://eodhd.com/api/eod/{SYMBOLE}?from=&to=&period=d&order=a&fmt=json` | Clôtures quotidiennes **ajustées** des dividendes et des divisions d'actions (`adjusted_close`), avec leur date. Ce sont des données de fin de journée, **pas du temps réel**. |
| Actualités (facultatives) | EODHD Financial News API : `GET https://eodhd.com/api/news?s={SYMBOLE}&from=&to=&limit=` | Le workflow conserve pour chaque article le titre, la date, l'URL, la source (domaine), un résumé et le score de sentiment fourni par EODHD. |

**Format des symboles.** Wikipédia fournit des symboles au format `MNEMO.PA` (Euronext Paris) ou `MNEMO.AS` (Euronext Amsterdam, par exemple ArcelorMittal `MT.AS`). C'est aussi le format d'EODHD, dont les codes de place sont `PA` et `AS`. Les mnémoniques seuls (`AIR`, `MC`, `DG`…) ne sont **jamais** envoyés tels quels. Chaque symbole est vérifié à l'exécution : un symbole inconnu d'EODHD renvoie une erreur HTTP 404, et la société est signalée « symbole introuvable » dans le rapport.

**Quotas EODHD**, d'après https://eodhd.com/financial-apis/api-limits consulté le 22/10/2026 :
- forfait gratuit : 20 appels par jour, plus un bonus unique de 500 appels, avec un an d'historique ;
- forfaits payants : 100 000 appels par jour, et 1 000 requêtes par minute ;
- une requête de cours coûte 1 appel et une requête d'actualités en coûte 5.

Une analyse complète consomme donc **40 appels**, et **240** avec le module actualités. Avec le forfait gratuit, une analyse complète n'est possible que grâce au bonus de bienvenue ; ensuite, il faut un forfait payant (« EOD Historical Data — All World », à partir de 19,99 €/mois) ou une sélection d'au plus 20 sociétés par jour.

## Identifiants (credentials) à configurer dans n8n

Aucune clé ne figure dans `workflow.ts`.

1. **EODHD API (api_token)**
   - Type : *Query Auth*.
   - Name : `api_token`.
   - Value : votre clé EODHD.
   - À sélectionner dans les nœuds « Cours historiques EODHD » et « Actualités EODHD ».
2. **Google Gemini (PaLM) API** : votre clé Google AI Studio, à sélectionner dans les nœuds « Modèle Google Gemini (analyste) » et « Modèle Google Gemini (rédacteur) ».
3. **Gmail** (facultatif) : connexion OAuth2, à sélectionner dans le nœud « Envoyer le rapport par e-mail ».
4. **Google Sheets** : l'identifiant « Google Sheets account », déjà connecté dans l'instance. La feuille de destination est indiquée par `googleSheetId` dans le nœud « Paramètres analyse ».
5. **Telegram** : l'identifiant « Telegram account », déjà connecté. Pour activer l'envoi, renseignez `telegramChatId` dans « Paramètres analyse ». Pour obtenir votre identifiant de discussion, envoyez `/start` à votre bot, puis ouvrez `https://api.telegram.org/bot<VOTRE_TOKEN>/getUpdates` et relevez `message.chat.id`. Si le champ reste vide, aucun message n'est envoyé.

## Lire le projet

Le projet tient dans un seul fichier, [`workflow.ts`](workflow.ts). Il se lit comme du code : chaque bloc `node(...)` est un nœud n8n, et les lignes `.to(...)` décrivent l'enchaînement. Les noms des nœuds sont en français et correspondent exactement à ceux affichés dans n8n.

Pour une lecture rapide, commencez par les schémas et tableaux de ce README, puis par le bas du fichier `workflow.ts`, où le chaînage complet est écrit.

## Installation et utilisation

Aucune installation n'est nécessaire pour lire le projet. Pour l'utiliser, il faut une instance n8n avec les identifiants décrits ci-dessous.

## Importer dans n8n

Le workflow est défini dans `workflow.ts`. Il peut être créé dans n8n à partir de ce code grâce au serveur MCP n8n (`create_workflow_from_code`). Le workflow « CAC 40 Insight AI » a été créé de cette façon dans l'instance de démonstration, **sans être publié**.

## Exemple de configuration

La section « Identifiants » ci-dessus sert d'exemple de configuration : elle liste les identifiants à créer et les valeurs à renseigner, sans aucune clé réelle.

## Exécution

1. Ouvrez le workflow, puis cliquez sur **Execute workflow**. Pour une URL de formulaire permanente, publiez-le.
2. Remplissez le formulaire :
   - **Périmètre** : « Tout le CAC 40 (40 sociétés) » (valeur par défaut) ou « Sélection personnalisée », avec les sociétés à cocher.
   - **Période** : 1 jour (dernière séance), 1 semaine, 1 mois (par défaut), 1 trimestre, 1 semestre ou 1 an glissants. Le nombre minimal de cotations et l'horizon des scénarios s'adaptent à la période.
   - **Modules** : comparaison, risques, actualités et scénario, activables séparément. Les actualités sont désactivées par défaut à cause de leur coût en appels.
   - **E-mail** : facultatif.
3. Le rapport s'affiche à la fin du formulaire et, si une adresse a été saisie, il est aussi envoyé par Gmail. Une analyse complète dure environ 2 à 3 minutes, à cause de la pause entre deux appels.

Les seuils se règlent dans le nœud **« Paramètres analyse »**. Ce sont des règles de surveillance de la maquette, pas des recommandations :

| Paramètre | Valeur par défaut |
|---|---|
| `seuilBaissePeriodePct` | -10 |
| `seuilBaisseMaxPct` | -15 |
| `seuilVolatilitePct` | 35 |
| `seuilFraicheurJours` | 5 |
| `minObservations` | 15 |
| `pauseEntreAppelsSecondes` | 3 |
| `kFavorable` / `kCentral` / `kDefavorable` | 1 / 0 / -1 |
| `montantPanierEur` | 1000 |

## Fonctionnement du workflow (54 nœuds, 9 notes, aucun groupe replié)

1. **Formulaire → Paramètres** : normalise les choix, calcule la période (de J−1 mois à aujourd'hui, fuseau Europe/Paris) et fixe les seuils.
2. **Composition du CAC 40** :
   - appel à l'API MediaWiki, puis extraction HTML du tableau `#constituents` ;
   - normalisation des symboles ;
   - contrôles : 40 sociétés, doublons, symboles valides, présence des 10 sociétés clés (Airbus, Air Liquide, Sanofi, Schneider Electric, LVMH, L'Oréal, TotalEnergies, BNP Paribas, Capgemini, Vinci) et changements par rapport à la liste de contrôle ;
   - une société par item (Split Out), filtre selon la sélection, suppression des doublons.
3. **Analyse par société** (Loop Over Items, une société à la fois) :
   - pause, pour respecter le débit autorisé ;
   - cours EODHD : 3 tentatives, et une erreur n'arrête pas la boucle ;
   - contrôle des données : valeurs numériques, cours > 0, tri par date ;
   - indicateurs : rendement, plus haut et plus bas, baisse maximale, volatilité ;
   - qualité des données (`OK`, `ANCIEN`, `INSUFFISANT`, `AUCUNE_DONNEE` ou `ERREUR`) et alertes ;
   - actualités, si le module est activé.
4. **Consolidation, secteurs et historique** :
   - classement par rendement (nœud Sort), qui alimente trois branches ;
   - historique : une ligne par société est ajoutée dans Google Sheets. Cette branche est placée en haut du canevas pour s'exécuter en premier (ordre d'exécution v1) ;
   - consolidation de toutes les sociétés (Aggregate) ;
   - statistiques par secteur : Filter, Summarize, Sort et Aggregate ;
   - fusion des résultats et des secteurs (Merge par position).
5. **Synthèse, scénarios et graphiques** :
   - dates communes et statistiques du panier : moyenne équipondérée, médiane, hausses et baisses ;
   - scénarios ;
   - tableaux Markdown ;
   - URL des graphiques QuickChart.
6. **Deux agents IA Gemini, sur l'ensemble consolidé** (jamais un appel par société) :
   - analyste : sortie structurée imposée par le sous-nœud de format de sortie, lue par le nœud « Analyse Gemini structurée » ;
   - rédacteur : rapport en 11 sections. Les tableaux et graphiques calculés par le workflow remplacent les marqueurs `[[…]]` ; un marqueur oublié est ajouté en annexe ;
   - conversion du rapport en HTML.
7. **Diffusion** : page de fin du formulaire, envoi Gmail si une adresse est fournie, et résumé avec graphique sur Telegram si `telegramChatId` est renseigné.

### Formules

- **Rendement** (%) = (cours final / cours initial − 1) × 100. Il n'est calculé que si le cours initial est strictement positif et qu'il y a au moins 2 cotations. Le résultat est arrondi à 2 décimales.
- **Volatilité annualisée** (%) = écart-type échantillon des rendements logarithmiques quotidiens × √252 × 100.
- **Baisse maximale** (%) = minimum, sur la période, de (cours / plus haut atteint jusque-là − 1) × 100.
- **Classement** : seules sont classées les sociétés dont la qualité est `OK` et dont les dates initiale et finale sont les dates communes les plus fréquentes. Les autres sont listées à part, comme non comparables.
- **Scénarios hypothétiques** (sans probabilité ni cours cible) :
  - variation du panier équipondéré = k × σ ;
  - σ = volatilité annualisée moyenne × √(N/252), où N est le nombre de séances de la période choisie (1 pour un jour, 5 pour une semaine, 21 pour un mois, 63 pour un trimestre, 126 pour un semestre, 252 pour un an) ;
  - k vaut +1 (favorable), 0 (central) ou −1 (défavorable).

### Prompts des agents IA

Les prompts sont lisibles dans les nœuds « Agent IA analyste » et « Agent IA rédacteur » : prompt système dans Options → System Message, prompt utilisateur dans le champ « Prompt ». Les deux notes violettes du canevas les résument. Chaque message système est écrit au format XML (rôle, instructions, contexte, exemples, format de sortie, entrées) et contient cinq exemples : trois proches du projet et deux fictifs, clairement marqués comme illustratifs. Les deux messages système, professionnels et en français, imposent les règles suivantes :
- utiliser uniquement les données fournies ;
- ne jamais inventer de valeur, de date, de cours ou d'article ;
- distinguer les faits des interprétations ;
- citer les sources d'actualité fournies ;
- ne jamais présenter une actualité comme la cause d'un mouvement de cours ;
- signaler les données manquantes ou anciennes ;
- ne garantir aucun rendement et ne donner aucune recommandation.

L'analyste doit répondre dans le format structuré imposé par le sous-nœud « Format JSON de l’analyse » (nom du nœud conservé dans n8n). Il peut vérifier un calcul avec la Calculatrice, mais jamais compter les sociétés. Le rédacteur doit suivre une structure en 11 sections : synthèse exécutive, composition et périmètre, période, tableau comparatif, classement, analyse sectorielle, risques, actualités, trois scénarios, limites et conclusion. Il impose aussi d'indiquer le nombre de sociétés attendues, le nombre analysées avec succès et les sociétés en erreur, et de préciser s'il s'agit d'une analyse complète ou partielle.

Les agents n'ont accès à aucun outil de recherche web : ils ne travaillent que sur les données fournies.

## Tests réalisés (22/10/2026)

| Test | Résultat |
|---|---|
| `tsc` (vérification TypeScript) | ✅ |
| Validation du SDK `@n8n/workflow-sdk` 0.37.2 (`validateWorkflow`) | ✅ 0 erreur, 0 avertissement |
| Contrôles du projet : un seul déclencheur, aucun nœud Code, mode « code » du nœud Sort non utilisé, connexions valides, aucun nœud isolé, aucun secret, 40 sociétés dans la liste de contrôle et le formulaire, 10 sociétés clés présentes | ✅ |
| Appel réel à l'API MediaWiki (curl) : tableau `constituents` de 40 lignes, symboles concordants avec Wikipédia fr | ✅ |
| Appel réel à EODHD avec la clé `demo` : format de `/api/eod` (`date`, `close`, `adjusted_close`…) et de `/api/news` (`title`, `link`, `date`, `content`, `sentiment`) | ✅ (la clé `demo` ne couvre pas `.PA` : HTTP 403) |
| Exécution n8n avec données épinglées : 3 sociétés, actualités activées | ✅ Rendement 5,3 %, volatilité 21,27 %, baisse maximale −5,76 %, recalculés indépendamment en Python |
| Exécution n8n, cas d'erreur : 40 sociétés, Wikipédia hors ligne, EODHD en HTTP 402 puis 404, Gemini en erreur | ✅ Aucune interruption, 40 sociétés signalées en erreur, liste de contrôle utilisée et signalée, rapport produit avec les tableaux en annexe |
| Exécution **réelle** dans n8n (TotalEnergies + Vinci), sans clé EODHD | ✅ Wikipédia en direct (révision 1381078418, 40 sociétés, noms nettoyés). Gemini en direct : rapport en 10 sections, marqueurs respectés, aucun chiffre inventé. EODHD signalé « identifiant EODHD non configuré dans n8n » sans interrompre le workflow. |
| **v2**, exécution n8n avec données épinglées (4 sociétés, 4 secteurs) | ✅ Le nœud Summarize produit une ligne par secteur. Les deux graphiques QuickChart, les points clés Gemini, la lecture sectorielle et les avertissements sont insérés dans le rapport. |
| **v2**, exécution **réelle** (Airbus + Sanofi, sans clé EODHD) | ✅ Wikipédia en direct. Gemini analyste en direct : sortie structurée valide lue par « Analyse Gemini structurée ». Gemini rédacteur en direct : 11 sections, marqueurs respectés. 2 lignes réellement ajoutées dans Google Sheets. Le cas « aucun secteur calculable » ne bloque pas le workflow. |
| **v3**, exécution **réelle** (Airbus, Air Liquide, Axa) | ✅ Les deux modèles Gemini sont appelés par leurs agents. L'analyste renvoie un objet structuré valide via le format de sortie. Le rédacteur produit les 11 sections. Telegram (texte et graphique) et Google Sheets fonctionnent. |

La version 2 a corrigé trois défauts supplémentaires :
- la branche Google Sheets ne s'exécutait pas avant la page finale du formulaire ; elle est désormais placée en haut du canevas ;
- l'onglet « gid=0 » était introuvable ; il est maintenant désigné par son nom, « Untitled » ;
- un « NaN » apparaissait pour la volatilité sectorielle quand elle n'était pas calculable.

**Non testés** :
- l'envoi Telegram, car `telegramChatId` est vide (voir la section des identifiants) ;
- l'envoi Gmail, car aucun identifiant Gmail n'est connecté dans l'instance.

Ces tests ont permis de corriger trois défauts :
- n8n renvoie parfois l'erreur sous forme de **chaîne** (`{ "error": "Credentials not found" }`) et non d'objet ; le workflow gère désormais les deux formes ;
- le texte extrait de Wikipédia contenait des liens « [/wiki/…] », désormais supprimés ;
- « n.d. » s'affichait « n,d. », remplacé par « n/d ».

**Non testé faute de clé** : la récupération de **cours réels pour les 40 symboles `.PA`/`.AS`** chez EODHD. La couverture effective de chaque symbole sera vérifiée à la première exécution avec une vraie clé : un symbole non couvert apparaîtra en erreur 404 dans le rapport. Les données épinglées des tests sont **synthétiques** et ne représentent aucun cours réel.

## Limites connues

- Euronext, la source officielle, ne propose pas de point d'accès documenté et exploitable sans code : ses réponses AJAX sont chiffrées et ses pages protégées par un anti-robot. La composition vient donc de Wikipédia, recoupée avec une liste de contrôle datée. En cas d'écart, le rapport le signale au lieu de le corriger.
- Le formulaire n8n ne permet pas de générer dynamiquement les cases à cocher. La liste des 40 sociétés du formulaire est donc fixe. Le workflow, lui, analyse toujours la composition actualisée, et signale une société cochée qui ne ferait plus partie de l'indice.
- Les cours sont des clôtures de fin de journée. La dernière date disponible est indiquée pour chaque société.
- Les scénarios sont illustratifs : ils supposent une volatilité constante et une corrélation parfaite entre sociétés.
- Le modèle Gemini est `models/gemini-3-flash-preview`, valeur par défaut du nœud dans l'instance. Il peut être changé dans la liste du nœud.
- Les graphiques sont générés par l'API publique QuickChart (`https://quickchart.io/chart`). Les noms des sociétés et leurs rendements sont transmis dans l'URL de l'image : ce sont des données de marché publiques.
- Si vous renommez l'onglet « Untitled » de la feuille d'historique, mettez à jour le champ « Sheet » du nœud Google Sheets.
- Les secteurs proviennent de Wikipédia (en anglais) : Gemini les commente, mais ne les traduit pas dans les tableaux.
