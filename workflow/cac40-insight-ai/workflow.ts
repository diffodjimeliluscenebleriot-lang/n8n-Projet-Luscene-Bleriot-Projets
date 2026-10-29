import { workflow, node, trigger, sticky, newCredential, ifElse, merge, splitInBatches, nextBatch, languageModel, tool, outputParser, expr } from '@n8n/workflow-sdk';

const P = '$("Paramètres analyse").first().json';
const REF = '$("Liste de contrôle CAC 40").first().json';
const COMPO = '$("Contrôler composition").first().json';
const LOOP = '$("Boucle par société").item.json';
const RS = '$json.resultats.map(r => r.societe)';
const COMPARABLE = '(s => s.qualite === "OK" && s.dateFinale === $json.dateFinaleReference && s.dateInitiale === $json.dateInitialeReference)';
const T = '$("Mettre en forme les tableaux").first().json';
const A = '($("Analyse Gemini structurée").first().json.analyse || {})';
const TICKER_RE = '/^[A-Z0-9]+\\.(PA|AS)$/';

const ERR = '(typeof $json.error === "string" ? $json.error : String($json.error?.message ?? $json.error?.description ?? JSON.stringify($json.error)))';
const HTTPCODE = 'String((typeof $json.error === "object" && ($json.error.httpCode ?? $json.error.status)) || (' + ERR + '.match(/\\b([1-5][0-9]{2})\\b/) || [])[1] || "erreur")';
const CLEAN = '.replace(/\\s*\\[[^\\]]*\\]/g, "").trim()';

const conditionOptions = { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 };

const formulaire = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Formulaire CAC 40 Insight',
    parameters: {
      formTitle: 'CAC 40 Insight AI',
      formDescription: 'Analyse comparative des sociétés du CAC 40 sur un mois glissant, à partir de cours de clôture réels (EODHD) et d’une composition de l’indice actualisée à chaque exécution. Outil pédagogique : ce rapport ne constitue pas un conseil en investissement.',
      formFields: {
        values: [
          { fieldLabel: 'Périmètre analysé', fieldName: 'perimetre', fieldType: 'radio', requiredField: true, defaultValue: 'Tout le CAC 40 (40 sociétés)', fieldOptions: { values: [{ option: 'Tout le CAC 40 (40 sociétés)' }, { option: 'Sélection personnalisée' }] } },
          { fieldLabel: 'Sociétés (uniquement pour une sélection personnalisée)', fieldName: 'societes', fieldType: 'checkbox', requiredField: false, fieldOptions: { values: [
            { option: 'Accor (AC)' }, { option: 'Air Liquide (AI)' }, { option: 'Airbus (AIR)' }, { option: 'ArcelorMittal (MT)' }, { option: 'Axa (CS)' },
            { option: 'BNP Paribas (BNP)' }, { option: 'Bouygues (EN)' }, { option: 'Bureau Veritas (BVI)' }, { option: 'Capgemini (CAP)' }, { option: 'Carrefour (CA)' },
            { option: 'Crédit Agricole (ACA)' }, { option: 'Danone (BN)' }, { option: 'Dassault Systèmes (DSY)' }, { option: 'Eiffage (FGR)' }, { option: 'Engie (ENGI)' },
            { option: 'EssilorLuxottica (EL)' }, { option: 'Eurofins Scientific (ERF)' }, { option: 'Euronext (ENX)' }, { option: 'Hermès (RMS)' }, { option: 'Kering (KER)' },
            { option: 'Legrand (LR)' }, { option: "L'Oréal (OR)" }, { option: 'LVMH (MC)' }, { option: 'Michelin (ML)' }, { option: 'Orange (ORA)' },
            { option: 'Pernod Ricard (RI)' }, { option: 'Publicis (PUB)' }, { option: 'Renault (RNO)' }, { option: 'Safran (SAF)' }, { option: 'Saint-Gobain (SGO)' },
            { option: 'Sanofi (SAN)' }, { option: 'Schneider Electric (SU)' }, { option: 'Société Générale (GLE)' }, { option: 'Stellantis (STLAP)' }, { option: 'STMicroelectronics (STMPA)' },
            { option: 'Thales (HO)' }, { option: 'TotalEnergies (TTE)' }, { option: 'Unibail-Rodamco-Westfield (URW)' }, { option: 'Veolia (VIE)' }, { option: 'Vinci (DG)' }
          ] } },
          { fieldLabel: 'Période d’analyse', fieldName: 'periode', fieldType: 'dropdown', requiredField: true, defaultValue: '1 mois glissant', fieldOptions: { values: [{ option: '1 jour (dernière séance)' }, { option: '1 semaine glissante' }, { option: '1 mois glissant' }, { option: '1 trimestre glissant' }, { option: '1 semestre glissant' }, { option: '1 an glissant' }] } },
          { fieldLabel: 'Module comparaison', fieldName: 'module_comparaison', fieldType: 'dropdown', requiredField: true, defaultValue: 'Oui', fieldOptions: { values: [{ option: 'Oui' }, { option: 'Non' }] } },
          { fieldLabel: 'Module risques', fieldName: 'module_risques', fieldType: 'dropdown', requiredField: true, defaultValue: 'Oui', fieldOptions: { values: [{ option: 'Oui' }, { option: 'Non' }] } },
          { fieldLabel: 'Module actualités (5 appels EODHD par société)', fieldName: 'module_actualites', fieldType: 'dropdown', requiredField: true, defaultValue: 'Non', fieldOptions: { values: [{ option: 'Oui' }, { option: 'Non' }] } },
          { fieldLabel: 'Module scénario', fieldName: 'module_scenario', fieldType: 'dropdown', requiredField: true, defaultValue: 'Oui', fieldOptions: { values: [{ option: 'Oui' }, { option: 'Non' }] } },
          { fieldLabel: 'E-mail pour recevoir le rapport (facultatif)', fieldName: 'email', fieldType: 'email', requiredField: false, placeholder: 'prenom.nom@exemple.fr' }
        ]
      },
      options: {
        buttonLabel: 'Lancer l’analyse',
        appendAttribution: false,
        customCss: 'table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d0d4dc;padding:4px 6px;text-align:left}th{background:#f1f3f7}'
      }
    }
  },
  output: [{ perimetre: 'Tout le CAC 40 (40 sociétés)', societes: [], periode: '1 mois glissant', module_comparaison: 'Oui', module_risques: 'Oui', module_actualites: 'Non', module_scenario: 'Oui', email: '', submittedAt: '2026-10-22T20:00:00.000+02:00', formMode: 'test' }]
});

const DUREE_PERIODE = '({ "1 jour (dernière séance)": { days: 10 }, "1 semaine glissante": { days: 7 }, "1 mois glissant": { months: 1 }, "1 trimestre glissant": { months: 3 }, "1 semestre glissant": { months: 6 }, "1 an glissant": { months: 12 } })[String($json.periode ?? $json["Période d’analyse"] ?? "1 mois glissant")] || { months: 1 }';
const OBSERVATIONS_PERIODE = '({ "1 jour (dernière séance)": 2, "1 semaine glissante": 4, "1 mois glissant": 15, "1 trimestre glissant": 50, "1 semestre glissant": 110, "1 an glissant": 200 })[String($json.periode ?? $json["Période d’analyse"] ?? "1 mois glissant")] ?? 15';

const parametres = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Paramètres analyse',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'p-perimetre', name: 'perimetreDemande', type: 'string', value: expr('{{ String($json.perimetre ?? $json["Périmètre analysé"] ?? "Tout le CAC 40 (40 sociétés)") }}') },
          { id: 'p-selection', name: 'selectionMnemos', type: 'array', value: expr('{{ [].concat($json.societes ?? $json["Sociétés (uniquement pour une sélection personnalisée)"] ?? []).map(l => (String(l).match(/\\(([A-Z0-9]+)\\)\\s*$/) || [])[1]).filter(Boolean) }}') },
          { id: 'p-complete', name: 'analyseComplete', type: 'boolean', value: expr('{{ String($json.perimetre ?? $json["Périmètre analysé"] ?? "Tout").startsWith("Tout") || [].concat($json.societes ?? $json["Sociétés (uniquement pour une sélection personnalisée)"] ?? []).length === 0 }}') },
          { id: 'p-avert', name: 'avertissementSelection', type: 'string', value: expr('{{ !String($json.perimetre ?? $json["Périmètre analysé"] ?? "Tout").startsWith("Tout") && [].concat($json.societes ?? $json["Sociétés (uniquement pour une sélection personnalisée)"] ?? []).length === 0 ? "Sélection personnalisée demandée sans aucune société cochée : l’analyse a été étendue à tout le CAC 40." : "" }}') },
          { id: 'p-periode', name: 'periodeLibelle', type: 'string', value: expr('{{ String($json.periode ?? $json["Période d’analyse"] ?? "1 mois glissant") + " (clôtures quotidiennes)" }}') },
          { id: 'p-fin', name: 'dateFin', type: 'string', value: expr('{{ $today.setZone("Europe/Paris").toISODate() }}') },
          { id: 'p-debut', name: 'dateDebut', type: 'string', value: expr('{{ $today.setZone("Europe/Paris").minus(' + DUREE_PERIODE + ').toISODate() }}') },
          { id: 'p-exec', name: 'dateExecution', type: 'string', value: expr('{{ $now.setZone("Europe/Paris").toFormat("dd/MM/yyyy HH:mm") }}') },
          { id: 'p-mcomp', name: 'moduleComparaison', type: 'boolean', value: expr('{{ String($json.module_comparaison ?? $json["Module comparaison"] ?? "Oui") === "Oui" }}') },
          { id: 'p-mrisk', name: 'moduleRisques', type: 'boolean', value: expr('{{ String($json.module_risques ?? $json["Module risques"] ?? "Oui") === "Oui" }}') },
          { id: 'p-mnews', name: 'moduleActualites', type: 'boolean', value: expr('{{ String($json.module_actualites ?? $json["Module actualités (5 appels EODHD par société)"] ?? "Non") === "Oui" }}') },
          { id: 'p-mscen', name: 'moduleScenario', type: 'boolean', value: expr('{{ String($json.module_scenario ?? $json["Module scénario"] ?? "Oui") === "Oui" }}') },
          { id: 'p-email', name: 'email', type: 'string', value: expr('{{ String($json.email ?? $json["E-mail pour recevoir le rapport (facultatif)"] ?? "").trim() }}') },
          { id: 'p-s-baisse', name: 'seuilBaissePeriodePct', type: 'number', value: -10 },
          { id: 'p-s-dd', name: 'seuilBaisseMaxPct', type: 'number', value: -15 },
          { id: 'p-s-vol', name: 'seuilVolatilitePct', type: 'number', value: 35 },
          { id: 'p-s-fresh', name: 'seuilFraicheurJours', type: 'number', value: 5 },
          { id: 'p-s-obs', name: 'minObservations', type: 'number', value: expr('{{ ' + OBSERVATIONS_PERIODE + ' }}') },
          { id: 'p-pause', name: 'pauseEntreAppelsSecondes', type: 'number', value: 3 },
          { id: 'p-news', name: 'articlesParSociete', type: 'number', value: 3 },
          { id: 'p-jan', name: 'joursBourseParAn', type: 'number', value: 252 },
          { id: 'p-jmo', name: 'horizonScenarioJours', type: 'number', value: expr('{{ ({ "1 jour (dernière séance)": 1, "1 semaine glissante": 5, "1 mois glissant": 21, "1 trimestre glissant": 63, "1 semestre glissant": 126, "1 an glissant": 252 })[String($json.periode ?? $json["Période d’analyse"] ?? "1 mois glissant")] ?? 21 }}') },
          { id: 'p-kfav', name: 'kFavorable', type: 'number', value: 1 },
          { id: 'p-kcen', name: 'kCentral', type: 'number', value: 0 },
          { id: 'p-kdef', name: 'kDefavorable', type: 'number', value: -1 },
          { id: 'p-panier', name: 'montantPanierEur', type: 'number', value: 1000 },
          { id: 'p-tg', name: 'telegramChatId', type: 'string', value: '' },
          { id: 'p-gs', name: 'googleSheetId', type: 'string', value: '' }
        ]
      }
    }
  },
  output: [{ perimetreDemande: 'Tout le CAC 40 (40 sociétés)', selectionMnemos: [], analyseComplete: true, avertissementSelection: '', periodeLibelle: '1 mois glissant (clôtures quotidiennes)', dateFin: '2026-10-22', dateDebut: '2026-09-22', dateExecution: '22/10/2026 20:00', moduleComparaison: true, moduleRisques: true, moduleActualites: false, moduleScenario: true, email: '', seuilBaissePeriodePct: -10, seuilBaisseMaxPct: -15, seuilVolatilitePct: 35, seuilFraicheurJours: 5, minObservations: 15, pauseEntreAppelsSecondes: 3, articlesParSociete: 3, joursBourseParAn: 252, horizonScenarioJours: 21, kFavorable: 1, kCentral: 0, kDefavorable: -1, montantPanierEur: 1000 }]
});

const listeControle = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Liste de contrôle CAC 40',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'r-date', name: 'dateReference', type: 'string', value: '2026-10-22' },
          { id: 'r-src', name: 'sourceReference', type: 'string', value: 'Wikipédia en (révision 1381078418, tableau « constituents ») et Wikipédia fr (révision 240488739, « Composition actuelle »), concordantes, consultées le 22/10/2026' },
          { id: 'r-cles', name: 'societesCles', type: 'array', value: '["AIR","AI","SAN","SU","MC","OR","TTE","BNP","CAP","DG"]' },
          { id: 'r-list', name: 'reference', type: 'array', value: '[{"nom":"Accor","ticker":"AC.PA"},{"nom":"Air Liquide","ticker":"AI.PA"},{"nom":"Airbus","ticker":"AIR.PA"},{"nom":"ArcelorMittal","ticker":"MT.AS"},{"nom":"Axa","ticker":"CS.PA"},{"nom":"BNP Paribas","ticker":"BNP.PA"},{"nom":"Bouygues","ticker":"EN.PA"},{"nom":"Bureau Veritas","ticker":"BVI.PA"},{"nom":"Capgemini","ticker":"CAP.PA"},{"nom":"Carrefour","ticker":"CA.PA"},{"nom":"Crédit Agricole","ticker":"ACA.PA"},{"nom":"Danone","ticker":"BN.PA"},{"nom":"Dassault Systèmes","ticker":"DSY.PA"},{"nom":"Eiffage","ticker":"FGR.PA"},{"nom":"Engie","ticker":"ENGI.PA"},{"nom":"EssilorLuxottica","ticker":"EL.PA"},{"nom":"Eurofins Scientific","ticker":"ERF.PA"},{"nom":"Euronext","ticker":"ENX.PA"},{"nom":"Hermès","ticker":"RMS.PA"},{"nom":"Kering","ticker":"KER.PA"},{"nom":"Legrand","ticker":"LR.PA"},{"nom":"L’Oréal","ticker":"OR.PA"},{"nom":"LVMH","ticker":"MC.PA"},{"nom":"Michelin","ticker":"ML.PA"},{"nom":"Orange","ticker":"ORA.PA"},{"nom":"Pernod Ricard","ticker":"RI.PA"},{"nom":"Publicis","ticker":"PUB.PA"},{"nom":"Renault","ticker":"RNO.PA"},{"nom":"Safran","ticker":"SAF.PA"},{"nom":"Saint-Gobain","ticker":"SGO.PA"},{"nom":"Sanofi","ticker":"SAN.PA"},{"nom":"Schneider Electric","ticker":"SU.PA"},{"nom":"Société Générale","ticker":"GLE.PA"},{"nom":"Stellantis","ticker":"STLAP.PA"},{"nom":"STMicroelectronics","ticker":"STMPA.PA"},{"nom":"Thales","ticker":"HO.PA"},{"nom":"TotalEnergies","ticker":"TTE.PA"},{"nom":"Unibail-Rodamco-Westfield","ticker":"URW.PA"},{"nom":"Veolia","ticker":"VIE.PA"},{"nom":"Vinci","ticker":"DG.PA"}]' }
        ]
      }
    }
  },
  output: [{ dateReference: '2026-10-22', sourceReference: 'Wikipédia en + fr', societesCles: ['AIR', 'AI', 'SAN', 'SU', 'MC', 'OR', 'TTE', 'BNP', 'CAP', 'DG'], reference: [{ nom: 'Accor', ticker: 'AC.PA' }] }]
});

const compositionWikipedia = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Composition CAC 40 Wikipédia',
    executeOnce: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://en.wikipedia.org/w/api.php',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'action', value: 'parse' },
          { name: 'page', value: 'CAC_40' },
          { name: 'prop', value: 'text|revid' },
          { name: 'redirects', value: '1' },
          { name: 'format', value: 'json' },
          { name: 'formatversion', value: '2' }
        ]
      },
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'User-Agent', value: 'CAC40InsightAI/1.0 (projet pedagogique; https://github.com/diffodjimeliluscenebleriot-lang/Luscene-Bleriot-Projets)' }
        ]
      },
      options: { timeout: 30000 }
    }
  },
  output: [{ parse: { title: 'CAC 40', pageid: 6058, revid: 1381078418, text: '<table class="wikitable sortable" id="constituents"><tbody><tr><th>Company</th></tr><tr><td>Accor</td><td>Consumer Services</td><td>Hotels</td><td>AC.PA</td></tr></tbody></table>' } }]
});

const preparerHtml = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Préparer HTML composition',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'h-html', name: 'html', type: 'string', value: expr('{{ $json.parse?.text ?? "" }}') },
          { id: 'h-rev', name: 'revisionWikipedia', type: 'number', value: expr('{{ $json.parse?.revid ?? null }}') },
          { id: 'h-err', name: 'erreurSource', type: 'string', value: expr('{{ $json.error ? "API MediaWiki indisponible : " + ' + ERR + '.slice(0, 300) : ($json.parse?.text ? "" : "Réponse inattendue de l’API MediaWiki (aucun contenu de page).") }}') }
        ]
      }
    }
  },
  output: [{ html: '<table id="constituents"></table>', revisionWikipedia: 1381078418, erreurSource: '' }]
});

const extraireTableau = node({
  type: 'n8n-nodes-base.html',
  version: 1.2,
  config: {
    name: 'Extraire tableau composition',
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'extractHtmlContent',
      sourceData: 'json',
      dataPropertyName: 'html',
      extractionValues: {
        values: [
          { key: 'noms', cssSelector: '#constituents tr td:nth-of-type(1)', returnValue: 'text', returnArray: true },
          { key: 'secteurs', cssSelector: '#constituents tr td:nth-of-type(2)', returnValue: 'text', returnArray: true },
          { key: 'tickers', cssSelector: '#constituents tr td:nth-of-type(4)', returnValue: 'text', returnArray: true }
        ]
      },
      options: { trimValues: true, cleanUpText: true }
    }
  },
  output: [{ noms: ['Accor', 'Air Liquide'], secteurs: ['Consumer Services', 'Basic Materials'], tickers: ['AC.PA', 'AI.PA'] }]
});

const normaliserComposition = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normaliser composition',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'n-ok', name: 'sourceDisponible', type: 'boolean', value: expr('{{ Array.isArray($json.tickers) && $json.tickers.filter(t => String(t).trim()).length > 0 }}') },
          { id: 'n-orig', name: 'origineComposition', type: 'string', value: expr('{{ Array.isArray($json.tickers) && $json.tickers.filter(t => String(t).trim()).length > 0 ? "Wikipédia (en), page CAC 40, tableau « constituents », via l’API MediaWiki" : "Liste de contrôle interne du " + ' + REF + '.dateReference + " (source en ligne indisponible : composition NON actualisée)" }}') },
          { id: 'n-soc', name: 'societesRetenues', type: 'array', value: expr('{{ (Array.isArray($json.tickers) && $json.tickers.filter(t => String(t).trim()).length > 0 ? $json.tickers.map((t, i) => ({ nom: String(($json.noms || [])[i] || "")' + CLEAN + ', secteur: String(($json.secteurs || [])[i] || "")' + CLEAN + ', tickerSource: String(t)' + CLEAN + '.toUpperCase() })) : ' + REF + '.reference.map(r => ({ nom: r.nom, secteur: "", tickerSource: r.ticker }))).filter(s => s.tickerSource) }}') },
          { id: 'n-rev', name: 'revisionWikipedia', type: 'number', value: expr('{{ $("Préparer HTML composition").first().json.revisionWikipedia }}') },
          { id: 'n-url', name: 'urlSource', type: 'string', value: expr('{{ $("Préparer HTML composition").first().json.revisionWikipedia ? "https://en.wikipedia.org/w/index.php?title=CAC_40&oldid=" + $("Préparer HTML composition").first().json.revisionWikipedia : "" }}') },
          { id: 'n-err', name: 'erreurSource', type: 'string', value: expr('{{ $("Préparer HTML composition").first().json.erreurSource || ($json.error ? "Extraction HTML impossible : " + ' + ERR + '.slice(0, 200) : "") }}') },
          { id: 'n-date', name: 'dateConsultation', type: 'string', value: expr('{{ $now.setZone("Europe/Paris").toFormat("dd/MM/yyyy HH:mm") }}') }
        ]
      }
    }
  },
  output: [{ sourceDisponible: true, origineComposition: 'Wikipédia (en)', societesRetenues: [{ nom: 'Accor', secteur: 'Consumer Services', tickerSource: 'AC.PA' }], revisionWikipedia: 1381078418, urlSource: 'https://en.wikipedia.org/w/index.php?title=CAC_40&oldid=1381078418', erreurSource: '', dateConsultation: '22/10/2026 20:00' }]
});

const controlerComposition = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Contrôler composition',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'c-nb', name: 'nbSocietesRetenues', type: 'number', value: expr('{{ $json.societesRetenues.length }}') },
          { id: 'c-dup', name: 'doublons', type: 'array', value: expr('{{ $json.societesRetenues.map(s => s.tickerSource).filter((t, i, a) => a.indexOf(t) !== i) }}') },
          { id: 'c-abs', name: 'absentsParRapportAuControle', type: 'array', value: expr('{{ ' + REF + '.reference.filter(r => !$json.societesRetenues.some(s => s.tickerSource === r.ticker)).map(r => r.nom + " (" + r.ticker + ")") }}') },
          { id: 'c-new', name: 'nouveauxParRapportAuControle', type: 'array', value: expr('{{ $json.societesRetenues.filter(s => !' + REF + '.reference.some(r => r.ticker === s.tickerSource)).map(s => s.nom + " (" + s.tickerSource + ")") }}') },
          { id: 'c-cles', name: 'societesClesManquantes', type: 'array', value: expr('{{ ' + REF + '.societesCles.filter(m => !$json.societesRetenues.some(s => s.tickerSource.split(".")[0] === m)) }}') },
          { id: 'c-inv', name: 'symbolesInvalides', type: 'array', value: expr('{{ $json.societesRetenues.filter(s => !' + TICKER_RE + '.test(s.tickerSource)).map(s => s.nom + " (" + s.tickerSource + ")") }}') },
          { id: 'c-ok', name: 'compositionVerifiee', type: 'boolean', value: expr('{{ $json.sourceDisponible && $json.societesRetenues.length === 40 && new Set($json.societesRetenues.map(s => s.tickerSource)).size === 40 && $json.societesRetenues.every(s => ' + TICKER_RE + '.test(s.tickerSource)) }}') },
          { id: 'c-chg', name: 'changementDetecte', type: 'boolean', value: expr('{{ $json.sourceDisponible && (' + REF + '.reference.some(r => !$json.societesRetenues.some(s => s.tickerSource === r.ticker)) || $json.societesRetenues.some(s => !' + REF + '.reference.some(r => r.ticker === s.tickerSource))) }}') },
          { id: 'c-hors', name: 'selectionHorsIndice', type: 'array', value: expr('{{ ' + P + '.analyseComplete ? [] : ' + P + '.selectionMnemos.filter(m => !$json.societesRetenues.some(s => s.tickerSource.split(".")[0] === m)) }}') },
          { id: 'c-soc', name: 'societes', type: 'array', value: expr('{{ $json.societesRetenues.map(s => ({ nom: s.nom, secteur: s.secteur, tickerSource: s.tickerSource, mnemo: s.tickerSource.split(".")[0], symbole: ' + TICKER_RE + '.test(s.tickerSource) ? s.tickerSource : "", symboleValide: ' + TICKER_RE + '.test(s.tickerSource), place: s.tickerSource.endsWith(".AS") ? "Euronext Amsterdam (XAMS)" : (s.tickerSource.endsWith(".PA") ? "Euronext Paris (XPAR)" : "inconnue") })) }}') }
        ]
      }
    }
  },
  output: [{ nbSocietesRetenues: 40, doublons: [], absentsParRapportAuControle: [], nouveauxParRapportAuControle: [], societesClesManquantes: [], symbolesInvalides: [], compositionVerifiee: true, changementDetecte: false, selectionHorsIndice: [], societes: [{ nom: 'Accor', secteur: 'Consumer Services', tickerSource: 'AC.PA', mnemo: 'AC', symbole: 'AC.PA', symboleValide: true, place: 'Euronext Paris (XPAR)' }] }]
});

const uneLigneParSociete = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1.1,
  config: {
    name: 'Une ligne par société',
    parameters: { fieldToSplitOut: 'societes', include: 'noOtherFields' }
  },
  output: [{ nom: 'Accor', secteur: 'Consumer Services', tickerSource: 'AC.PA', mnemo: 'AC', symbole: 'AC.PA', symboleValide: true, place: 'Euronext Paris (XPAR)' }]
});

const filtrerSelection = node({
  type: 'n8n-nodes-base.filter',
  version: 2.4,
  config: {
    name: 'Filtrer selon la sélection',
    parameters: {
      conditions: {
        options: conditionOptions,
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $json.symboleValide }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } },
          { leftValue: expr('{{ ' + P + '.analyseComplete || ' + P + '.selectionMnemos.includes($json.mnemo) }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ]
      }
    }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', symbole: 'AC.PA', symboleValide: true, place: 'Euronext Paris (XPAR)' }]
});

const supprimerDoublons = node({
  type: 'n8n-nodes-base.removeDuplicates',
  version: 2,
  config: {
    name: 'Supprimer les doublons',
    parameters: { operation: 'removeDuplicateInputItems', compare: 'selectedFields', fieldsToCompare: 'symbole' }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', symbole: 'AC.PA', symboleValide: true, place: 'Euronext Paris (XPAR)' }]
});

const boucle = splitInBatches({
  version: 3,
  config: { name: 'Boucle par société', parameters: { batchSize: 1 } }
});

const pause = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Pause limite de débit',
    parameters: { resume: 'timeInterval', amount: expr('{{ ' + P + '.pauseEntreAppelsSecondes }}'), unit: 'seconds' }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', symbole: 'AC.PA' }]
});

const coursHistoriques = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Cours historiques EODHD',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('https://eodhd.com/api/eod/{{ ' + LOOP + '.symbole }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 'from', value: expr('{{ ' + P + '.dateDebut }}') },
          { name: 'to', value: expr('{{ ' + P + '.dateFin }}') },
          { name: 'period', value: 'd' },
          { name: 'order', value: 'a' },
          { name: 'fmt', value: 'json' }
        ]
      },
      options: { timeout: 30000, response: { response: { fullResponse: true, responseFormat: 'json' } } }
    },
    credentials: { httpQueryAuth: newCredential('EODHD API (api_token)') }
  },
  output: [{ statusCode: 200, headers: {}, body: [{ date: '2026-09-22', open: 100, high: 101, low: 99, close: 100.5, adjusted_close: 100.5, volume: 1000 }] }]
});

const controlerCours = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Contrôler données de cours',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'k-nom', name: 'nom', type: 'string', value: expr('{{ ' + LOOP + '.nom }}') },
          { id: 'k-mnemo', name: 'mnemo', type: 'string', value: expr('{{ ' + LOOP + '.mnemo }}') },
          { id: 'k-sym', name: 'symbole', type: 'string', value: expr('{{ ' + LOOP + '.symbole }}') },
          { id: 'k-place', name: 'place', type: 'string', value: expr('{{ ' + LOOP + '.place }}') },
          { id: 'k-sect', name: 'secteur', type: 'string', value: expr('{{ ' + LOOP + '.secteur }}') },
          { id: 'k-http', name: 'statutHttp', type: 'string', value: expr('{{ $json.error ? ' + HTTPCODE + ' : String($json.statusCode ?? "") }}') },
          { id: 'k-err', name: 'erreur', type: 'string', value: expr('{{ $json.error ? ' + ERR + '.slice(0, 300) : (Array.isArray($json.body) ? "" : "réponse non conforme (tableau attendu)") }}') },
          { id: 'k-type', name: 'typeErreur', type: 'string', value: expr('{{ !$json.error ? "" : (/credential/i.test(' + ERR + ') ? "identifiant EODHD non configuré dans n8n" : (' + HTTPCODE + ' === "402" ? "quota journalier EODHD dépassé (HTTP 402)" : (' + HTTPCODE + ' === "429" ? "limite de débit EODHD atteinte (HTTP 429)" : (' + HTTPCODE + ' === "404" ? "symbole introuvable chez EODHD (HTTP 404)" : ((' + HTTPCODE + ' === "401" || ' + HTTPCODE + ' === "403") ? "clé API refusée ou marché non couvert par le forfait (HTTP 401/403)" : "erreur HTTP ou réseau"))))) }}') },
          { id: 'k-recu', name: 'nbLignesRecues', type: 'number', value: expr('{{ Array.isArray($json.body) ? $json.body.length : 0 }}') },
          { id: 'k-cours', name: 'cours', type: 'array', value: expr('{{ (Array.isArray($json.body) ? $json.body : []).filter(c => c && typeof c.date === "string" && Number.isFinite(Number(c.adjusted_close)) && Number(c.adjusted_close) > 0 && Number.isFinite(Number(c.close))).map(c => ({ date: c.date, cloture: Number(c.close), clotureAjustee: Number(c.adjusted_close) })).sort((a, b) => a.date.localeCompare(b.date)).slice(-(String(' + P + '.periodeLibelle).startsWith("1 jour") ? 2 : 1e9)) }}') },
          { id: 'k-src', name: 'sourceCours', type: 'string', value: 'EODHD End-of-Day API (/api/eod) : clôtures quotidiennes ajustées des dividendes et divisions, données de fin de journée (non temps réel)' },
          { id: 'k-req', name: 'requeteCours', type: 'string', value: expr('{{ "https://eodhd.com/api/eod/" + ' + LOOP + '.symbole + "?from=" + ' + P + '.dateDebut + "&to=" + ' + P + '.dateFin + "&period=d&order=a" }}') }
        ]
      }
    }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', symbole: 'AC.PA', place: 'Euronext Paris (XPAR)', secteur: 'Consumer Services', statutHttp: '200', erreur: '', typeErreur: '', nbLignesRecues: 22, cours: [{ date: '2026-09-22', cloture: 40.1, clotureAjustee: 40.1 }], sourceCours: 'EODHD', requeteCours: 'https://eodhd.com/api/eod/AC.PA' }]
});

const calculerRendement = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Calculer rendement et extrêmes',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'i-nb', name: 'nbObservations', type: 'number', value: expr('{{ $json.cours.length }}') },
          { id: 'i-d0', name: 'dateInitiale', type: 'string', value: expr('{{ $json.cours.length ? $json.cours[0].date : "" }}') },
          { id: 'i-p0', name: 'coursInitial', type: 'number', value: expr('{{ $json.cours.length ? $json.cours[0].clotureAjustee : null }}') },
          { id: 'i-d1', name: 'dateFinale', type: 'string', value: expr('{{ $json.cours.length ? $json.cours[$json.cours.length - 1].date : "" }}') },
          { id: 'i-p1', name: 'coursFinal', type: 'number', value: expr('{{ $json.cours.length ? $json.cours[$json.cours.length - 1].clotureAjustee : null }}') },
          { id: 'i-ret', name: 'rendementPct', type: 'number', value: expr('{{ $json.cours.length >= 2 && Number($json.cours[0].clotureAjustee) > 0 ? Math.round((($json.cours[$json.cours.length - 1].clotureAjustee / $json.cours[0].clotureAjustee) - 1) * 10000) / 100 : null }}') },
          { id: 'i-max', name: 'plusHaut', type: 'number', value: expr('{{ $json.cours.length ? Math.max(...$json.cours.map(c => c.clotureAjustee)) : null }}') },
          { id: 'i-min', name: 'plusBas', type: 'number', value: expr('{{ $json.cours.length ? Math.min(...$json.cours.map(c => c.clotureAjustee)) : null }}') },
          { id: 'i-dd', name: 'baisseMaxPct', type: 'number', value: expr('{{ $json.cours.length >= 2 ? Math.round(Math.min(...$json.cours.map((c, i) => c.clotureAjustee / Math.max(...$json.cours.slice(0, i + 1).map(x => x.clotureAjustee)) - 1)) * 10000) / 100 : null }}') },
          { id: 'i-gap', name: 'ecartAuPlusHautPct', type: 'number', value: expr('{{ $json.cours.length ? Math.round(($json.cours[$json.cours.length - 1].clotureAjustee / Math.max(...$json.cours.map(c => c.clotureAjustee)) - 1) * 10000) / 100 : null }}') },
          { id: 'i-log', name: 'rendementsLog', type: 'array', value: expr('{{ $json.cours.slice(1).map((c, i) => Math.log(c.clotureAjustee / $json.cours[i].clotureAjustee)) }}') },
          { id: 'i-fresh', name: 'fraicheurJours', type: 'number', value: expr('{{ $json.cours.length ? Math.floor($today.diff(DateTime.fromISO($json.cours[$json.cours.length - 1].date), "days").days) : null }}') }
        ]
      }
    }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', symbole: 'AC.PA', statutHttp: '200', cours: [], nbObservations: 22, dateInitiale: '2026-09-22', coursInitial: 40.1, dateFinale: '2026-10-21', coursFinal: 41.2, rendementPct: 2.74, plusHaut: 41.5, plusBas: 39.2, baisseMaxPct: -3.1, ecartAuPlusHautPct: -0.72, rendementsLog: [0.01], fraicheurJours: 1 }]
});

const calculerVolatilite = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Calculer volatilité',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'v-moy', name: 'rendementLogMoyen', type: 'number', value: expr('{{ $json.rendementsLog.length ? $json.rendementsLog.reduce((a, b) => a + b, 0) / $json.rendementsLog.length : null }}') },
          { id: 'v-vol', name: 'volatiliteAnnualiseePct', type: 'number', value: expr('{{ $json.rendementsLog.length >= 2 ? Math.round(Math.sqrt($json.rendementsLog.reduce((s, r) => s + Math.pow(r - $json.rendementsLog.reduce((a, b) => a + b, 0) / $json.rendementsLog.length, 2), 0) / ($json.rendementsLog.length - 1)) * Math.sqrt(' + P + '.joursBourseParAn) * 10000) / 100 : null }}') },
          { id: 'v-meth', name: 'methodeVolatilite', type: 'string', value: 'Écart-type échantillon des rendements logarithmiques quotidiens de la période × √(jours de bourse par an), exprimé en %' }
        ]
      }
    }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', rendementPct: 2.74, rendementLogMoyen: 0.001, volatiliteAnnualiseePct: 22.4, methodeVolatilite: 'écart-type' }]
});

const calculerCoursJour = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Calculer cours du jour',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'j-cj', name: 'coursDuJour', type: 'number', value: expr('{{ $json.cours.length ? $json.cours[$json.cours.length - 1].cloture : null }}') },
          { id: 'j-cv', name: 'coursVeille', type: 'number', value: expr('{{ $json.cours.length >= 2 ? $json.cours[$json.cours.length - 2].cloture : null }}') },
          { id: 'j-vj', name: 'variationJourPct', type: 'number', value: expr('{{ $json.cours.length >= 2 && Number($json.cours[$json.cours.length - 2].cloture) > 0 ? Math.round((($json.cours[$json.cours.length - 1].cloture / $json.cours[$json.cours.length - 2].cloture) - 1) * 10000) / 100 : null }}') }
        ]
      }
    }
  },
  output: [{ coursDuJour: 41.2, coursVeille: 40.9, variationJourPct: 0.73 }]
});

const qualifier = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Qualifier et alerter',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'except',
      excludeFields: 'cours,rendementsLog',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'q-q', name: 'qualite', type: 'string', value: expr('{{ $json.statutHttp !== "200" || $json.erreur ? "ERREUR" : ($json.nbObservations === 0 ? "AUCUNE_DONNEE" : (($json.nbObservations < ' + P + '.minObservations || $json.rendementPct === null) ? "INSUFFISANT" : ($json.fraicheurJours > ' + P + '.seuilFraicheurJours ? "ANCIEN" : "OK"))) }}') },
          { id: 'q-m', name: 'motifQualite', type: 'string', value: expr('{{ $json.statutHttp !== "200" || $json.erreur ? ($json.typeErreur || "erreur") + " — " + $json.erreur : ($json.nbObservations === 0 ? "aucune cotation renvoyée sur la période" : (($json.nbObservations < ' + P + '.minObservations || $json.rendementPct === null) ? "historique incomplet : " + $json.nbObservations + " cotations (minimum " + ' + P + '.minObservations + ")" : ($json.fraicheurJours > ' + P + '.seuilFraicheurJours ? "dernière cotation datée du " + $json.dateFinale + " (" + $json.fraicheurJours + " jours)" : "données complètes"))) }}') },
          { id: 'q-a', name: 'alertes', type: 'array', value: expr('{{ [ ($json.rendementPct !== null && $json.rendementPct <= ' + P + '.seuilBaissePeriodePct) ? "rendement sur la période ≤ " + ' + P + '.seuilBaissePeriodePct + " %" : null, ($json.baisseMaxPct !== null && $json.baisseMaxPct <= ' + P + '.seuilBaisseMaxPct) ? "baisse maximale depuis un plus haut ≤ " + ' + P + '.seuilBaisseMaxPct + " %" : null, ($json.volatiliteAnnualiseePct !== null && $json.volatiliteAnnualiseePct >= ' + P + '.seuilVolatilitePct) ? "volatilité annualisée ≥ " + ' + P + '.seuilVolatilitePct + " %" : null, ($json.fraicheurJours !== null && $json.fraicheurJours > ' + P + '.seuilFraicheurJours) ? "données de plus de " + ' + P + '.seuilFraicheurJours + " jours" : null ].filter(Boolean) }}') },
          { id: 'q-k', name: 'cleTri', type: 'number', value: expr('{{ $json.rendementPct === null ? -1000000 : $json.rendementPct }}') }
        ]
      }
    }
  },
  output: [{ nom: 'Accor', mnemo: 'AC', symbole: 'AC.PA', place: 'Euronext Paris (XPAR)', statutHttp: '200', nbObservations: 22, dateInitiale: '2026-09-22', coursInitial: 40.1, dateFinale: '2026-10-21', coursFinal: 41.2, rendementPct: 2.74, baisseMaxPct: -3.1, volatiliteAnnualiseePct: 22.4, fraicheurJours: 1, qualite: 'OK', motifQualite: 'données complètes', alertes: [], cleTri: 2.74 }]
});

const actualitesActivees = ifElse({
  version: 2.2,
  config: {
    name: 'Actualités activées ?',
    parameters: {
      conditions: {
        options: conditionOptions,
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ ' + P + '.moduleActualites }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ]
      }
    }
  }
});

const actualitesEodhd = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Actualités EODHD',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://eodhd.com/api/news',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: {
        parameters: [
          { name: 's', value: expr('{{ $json.symbole }}') },
          { name: 'from', value: expr('{{ ' + P + '.dateDebut }}') },
          { name: 'to', value: expr('{{ ' + P + '.dateFin }}') },
          { name: 'limit', value: expr('{{ ' + P + '.articlesParSociete }}') },
          { name: 'offset', value: '0' },
          { name: 'fmt', value: 'json' }
        ]
      },
      options: { timeout: 30000, response: { response: { fullResponse: true, responseFormat: 'json' } } }
    },
    credentials: { httpQueryAuth: newCredential('EODHD API (api_token)') }
  },
  output: [{ statusCode: 200, headers: {}, body: [{ date: '2026-10-21T08:00:00+00:00', title: 'Titre', content: 'Résumé', link: 'https://example.com/article', symbols: ['AC.PA'], tags: [], sentiment: { polarity: 0.1, neg: 0.05, neu: 0.85, pos: 0.1 } }] }]
});

const joindreActualites = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Joindre les actualités',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'a-soc', name: 'societe', type: 'object', value: expr('{{ $("Qualifier et alerter").item.json }}') },
          { id: 'a-art', name: 'actualites', type: 'array', value: expr('{{ (Array.isArray($json.body) ? $json.body : []).filter(a => a && a.title && a.link).map(a => ({ titre: String(a.title), date: String(a.date ?? ""), url: String(a.link), source: (String(a.link).match(/^https?:\\/\\/([^\\/]+)/) || [])[1] || "inconnue", resume: String(a.content ?? "").replace(/\\s+/g, " ").slice(0, 400), polariteFournisseur: a.sentiment?.polarity ?? null, fournisseur: "EODHD Financial News API" })) }}') },
          { id: 'a-stat', name: 'statutActualites', type: 'string', value: expr('{{ $json.error ? "indisponible : " + ' + ERR + '.slice(0, 200) : (Array.isArray($json.body) && $json.body.length ? "ok" : "aucun article trouvé sur la période") }}') }
        ]
      }
    }
  },
  output: [{ societe: { nom: 'Accor', symbole: 'AC.PA', qualite: 'OK', rendementPct: 2.74, cleTri: 2.74 }, actualites: [], statutActualites: 'ok' }]
});

const sansActualites = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Sans actualités',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'z-soc', name: 'societe', type: 'object', value: expr('{{ $json }}') },
          { id: 'z-art', name: 'actualites', type: 'array', value: expr('{{ [] }}') },
          { id: 'z-stat', name: 'statutActualites', type: 'string', value: 'module désactivé' }
        ]
      }
    }
  },
  output: [{ societe: { nom: 'Accor', symbole: 'AC.PA', qualite: 'OK', rendementPct: 2.74, cleTri: 2.74 }, actualites: [], statutActualites: 'module désactivé' }]
});

const classer = node({
  type: 'n8n-nodes-base.sort',
  version: 1,
  config: {
    name: 'Classer par rendement',
    parameters: { type: 'simple', sortFieldsUi: { sortField: [{ fieldName: 'societe.cleTri', order: 'descending' }] } }
  },
  output: [{ societe: { nom: 'Accor', rendementPct: 2.74, cleTri: 2.74 }, actualites: [], statutActualites: 'ok' }]
});

const consolider = node({
  type: 'n8n-nodes-base.aggregate',
  version: 1,
  config: {
    name: 'Consolider les résultats',
    parameters: { aggregate: 'aggregateAllItemData', destinationFieldName: 'resultats' }
  },
  output: [{ resultats: [{ societe: { nom: 'Accor', rendementPct: 2.74, qualite: 'OK', dateInitiale: '2026-09-22', dateFinale: '2026-10-21' }, actualites: [], statutActualites: 'ok' }] }]
});

const societesAnalysees = node({
  type: 'n8n-nodes-base.filter',
  version: 2.4,
  config: {
    name: 'Sociétés avec rendement',
    alwaysOutputData: true,
    parameters: {
      conditions: {
        options: conditionOptions,
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ typeof $json.societe?.rendementPct === "number" }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ]
      }
    }
  },
  output: [{ societe: { nom: 'Accor', secteur: 'Consumer Services', rendementPct: 2.74, volatiliteAnnualiseePct: 22.4 }, actualites: [], statutActualites: 'ok' }]
});

const lignesSecteur = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Préparer les lignes secteur',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'ls-sec', name: 'secteur', type: 'string', value: expr('{{ $json.societe?.secteur || ($json.societe ? "Secteur non renseigné" : "") }}') },
          { id: 'ls-nom', name: 'nom', type: 'string', value: expr('{{ $json.societe?.nom ?? "" }}') },
          { id: 'ls-ret', name: 'rendementPct', type: 'number', value: expr('{{ $json.societe?.rendementPct ?? null }}') },
          { id: 'ls-vol', name: 'volatilite', type: 'number', value: expr('{{ $json.societe?.volatiliteAnnualiseePct ?? null }}') }
        ]
      }
    }
  },
  output: [{ secteur: 'Consumer Services', nom: 'Accor', rendementPct: 2.74, volatilite: 22.4 }]
});

const statsSecteur = node({
  type: 'n8n-nodes-base.summarize',
  version: 1.1,
  config: {
    name: 'Statistiques par secteur',
    alwaysOutputData: true,
    parameters: {
      fieldsToSummarize: {
        values: [
          { aggregation: 'count', field: 'nom' },
          { aggregation: 'average', field: 'rendementPct' },
          { aggregation: 'max', field: 'rendementPct' },
          { aggregation: 'min', field: 'rendementPct' },
          { aggregation: 'average', field: 'volatilite' },
          { aggregation: 'concatenate', field: 'nom', separateBy: ', ' }
        ]
      },
      fieldsToSplitBy: 'secteur',
      options: { skipEmptySplitFields: true }
    }
  },
  output: [{ secteur: 'Consumer Services', count_nom: 2, average_rendementPct: 1.5, max_rendementPct: 2.74, min_rendementPct: 0.3, average_volatilite: 22.4, concatenated_nom: 'Accor, Publicis' }]
});

const classerSecteurs = node({
  type: 'n8n-nodes-base.sort',
  version: 1,
  config: {
    name: 'Classer les secteurs',
    onError: 'continueRegularOutput',
    parameters: { type: 'simple', sortFieldsUi: { sortField: [{ fieldName: 'average_rendementPct', order: 'descending' }] } }
  },
  output: [{ secteur: 'Consumer Services', count_nom: 2, average_rendementPct: 1.5 }]
});

const regrouperSecteurs = node({
  type: 'n8n-nodes-base.aggregate',
  version: 1,
  config: {
    name: 'Regrouper les secteurs',
    alwaysOutputData: true,
    parameters: { aggregate: 'aggregateAllItemData', destinationFieldName: 'secteursBruts' }
  },
  output: [{ secteursBruts: [{ secteur: 'Consumer Services', count_nom: 2, average_rendementPct: 1.5 }] }]
});

const fusion = merge({
  version: 3.2,
  config: { name: 'Fusionner sociétés et secteurs', parameters: { mode: 'combine', combineBy: 'combineByPosition' } }
});

const ligneHistorique = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Préparer la ligne d’historique',
    position: [2700, 120],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'hi-date', name: 'date_execution', type: 'string', value: expr('{{ ' + P + '.dateExecution }}') },
          { id: 'hi-exec', name: 'execution_id', type: 'string', value: expr('{{ $execution.id }}') },
          { id: 'hi-per', name: 'perimetre', type: 'string', value: expr('{{ ' + P + '.analyseComplete ? "CAC 40 complet" : "Sélection personnalisée" }}') },
          { id: 'hi-d0', name: 'periode_debut', type: 'string', value: expr('{{ ' + P + '.dateDebut }}') },
          { id: 'hi-d1', name: 'periode_fin', type: 'string', value: expr('{{ ' + P + '.dateFin }}') },
          { id: 'hi-soc', name: 'societe', type: 'string', value: expr('{{ $json.societe.nom }}') },
          { id: 'hi-sym', name: 'symbole', type: 'string', value: expr('{{ $json.societe.symbole }}') },
          { id: 'hi-sec', name: 'secteur', type: 'string', value: expr('{{ $json.societe.secteur || "" }}') },
          { id: 'hi-rang', name: 'rang', type: 'string', value: expr('{{ $json.societe.qualite === "OK" ? String($itemIndex + 1) : "" }}') },
          { id: 'hi-ret', name: 'rendement_pct', type: 'string', value: expr('{{ $json.societe.rendementPct ?? "" }}') },
          { id: 'hi-vol', name: 'volatilite_pct', type: 'string', value: expr('{{ $json.societe.volatiliteAnnualiseePct ?? "" }}') },
          { id: 'hi-dd', name: 'baisse_max_pct', type: 'string', value: expr('{{ $json.societe.baisseMaxPct ?? "" }}') },
          { id: 'hi-dl', name: 'date_derniere_cotation', type: 'string', value: expr('{{ $json.societe.dateFinale || "" }}') },
          { id: 'hi-q', name: 'qualite', type: 'string', value: expr('{{ $json.societe.qualite }}') },
          { id: 'hi-src', name: 'source', type: 'string', value: 'EODHD (clôtures ajustées de fin de journée)' }
        ]
      }
    }
  },
  output: [{ date_execution: '22/10/2026 20:00', execution_id: '1', perimetre: 'CAC 40 complet', periode_debut: '2026-09-22', periode_fin: '2026-10-22', societe: 'Accor', symbole: 'AC.PA', secteur: 'Consumer Services', rang: '1', rendement_pct: '2.74', volatilite_pct: '22.4', baisse_max_pct: '-3.1', date_derniere_cotation: '2026-10-21', qualite: 'OK', source: 'EODHD' }]
});

const historiqueSheets = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Ajouter à l’historique Google Sheets',
    position: [2900, 120],
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'sheet',
      operation: 'append',
      authentication: 'oAuth2',
      documentId: { __rl: true, mode: 'id', value: expr('{{ ' + P + '.googleSheetId }}') },
      sheetName: { __rl: true, mode: 'name', value: 'Untitled' },
      columns: {
        mappingMode: 'autoMapInputData',
        value: {},
        schema: [
          { id: 'date_execution', displayName: 'date_execution', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'execution_id', displayName: 'execution_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'perimetre', displayName: 'perimetre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'periode_debut', displayName: 'periode_debut', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'periode_fin', displayName: 'periode_fin', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'societe', displayName: 'societe', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'symbole', displayName: 'symbole', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'secteur', displayName: 'secteur', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'rang', displayName: 'rang', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'rendement_pct', displayName: 'rendement_pct', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'volatilite_pct', displayName: 'volatilite_pct', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'baisse_max_pct', displayName: 'baisse_max_pct', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'date_derniere_cotation', displayName: 'date_derniere_cotation', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'qualite', displayName: 'qualite', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'source', displayName: 'source', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: { cellFormat: 'USER_ENTERED', handlingExtraData: 'ignoreIt' }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets account') }
  },
  output: [{ date_execution: '22/10/2026 20:00', societe: 'Accor' }]
});

const datesReference = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Dates de référence',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      assignments: {
        assignments: [
          { id: 'd-fin', name: 'dateFinaleReference', type: 'string', value: expr('{{ Object.entries(' + RS + '.filter(s => s.qualite === "OK" && s.dateFinale).reduce((acc, s) => ({ ...acc, [s.dateFinale]: (acc[s.dateFinale] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? "" }}') },
          { id: 'd-deb', name: 'dateInitialeReference', type: 'string', value: expr('{{ Object.entries(' + RS + '.filter(s => s.qualite === "OK" && s.dateInitiale).reduce((acc, s) => ({ ...acc, [s.dateInitiale]: (acc[s.dateInitiale] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "" }}') }
        ]
      }
    }
  },
  output: [{ resultats: [], dateFinaleReference: '2026-10-21', dateInitialeReference: '2026-09-22' }]
});

const synthese = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Synthèse et scénarios',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 's-per', name: 'perimetre', type: 'string', value: expr('{{ ' + P + '.analyseComplete ? "Analyse complète du CAC 40 (objectif : 40 sociétés)" : "Analyse partielle : sélection personnalisée de " + ' + P + '.selectionMnemos.length + " société(s)" }}') },
          { id: 's-att', name: 'societesAttendues', type: 'number', value: expr('{{ ' + P + '.analyseComplete ? ' + COMPO + '.nbSocietesRetenues : ' + P + '.selectionMnemos.length }}') },
          { id: 's-trt', name: 'societesTraitees', type: 'number', value: expr('{{ $json.resultats.length }}') },
          { id: 's-ok', name: 'societesAnalyseesAvecSucces', type: 'number', value: expr('{{ ' + RS + '.filter(s => s.rendementPct !== null).length }}') },
          { id: 's-ech', name: 'societesEnEchec', type: 'array', value: expr('{{ ' + RS + '.filter(s => s.qualite !== "OK").map(s => ({ nom: s.nom, symbole: s.symbole, qualite: s.qualite, motif: s.motifQualite })) }}') },
          { id: 's-cls', name: 'classement', type: 'array', value: expr('{{ ' + RS + '.filter(' + COMPARABLE + ').map((s, i) => ({ rang: i + 1, nom: s.nom, mnemo: s.mnemo, rendementPct: s.rendementPct })) }}') },
          { id: 's-ncmp', name: 'nonComparables', type: 'array', value: expr('{{ ' + RS + '.filter(s => s.rendementPct !== null && !' + COMPARABLE + '(s)).map(s => ({ nom: s.nom, rendementPct: s.rendementPct, dateInitiale: s.dateInitiale, dateFinale: s.dateFinale, qualite: s.qualite })) }}') },
          { id: 's-moy', name: 'rendementMoyenEquipondere', type: 'number', value: expr('{{ ' + RS + '.filter(' + COMPARABLE + ').length ? Math.round(' + RS + '.filter(' + COMPARABLE + ').reduce((a, s) => a + s.rendementPct, 0) / ' + RS + '.filter(' + COMPARABLE + ').length * 100) / 100 : null }}') },
          { id: 's-med', name: 'rendementMedian', type: 'number', value: expr('{{ ' + RS + '.filter(' + COMPARABLE + ').length ? ' + RS + '.filter(' + COMPARABLE + ').map(s => s.rendementPct).sort((a, b) => a - b).map((v, i, a) => a.length % 2 ? a[(a.length - 1) / 2] : Math.round((a[a.length / 2 - 1] + a[a.length / 2]) / 2 * 100) / 100)[0] : null }}') },
          { id: 's-hb', name: 'repartition', type: 'object', value: expr('{{ ({ hausse: ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.rendementPct > 0).length, baisse: ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.rendementPct < 0).length, stable: ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.rendementPct === 0).length }) }}') },
          { id: 's-vol', name: 'volatiliteMoyennePct', type: 'number', value: expr('{{ ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.volatiliteAnnualiseePct !== null).length ? Math.round(' + RS + '.filter(' + COMPARABLE + ').filter(s => s.volatiliteAnnualiseePct !== null).reduce((a, s) => a + s.volatiliteAnnualiseePct, 0) / ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.volatiliteAnnualiseePct !== null).length * 100) / 100 : null }}') },
          { id: 's-risk', name: 'risques', type: 'array', value: expr('{{ ' + RS + '.filter(s => s.alertes && s.alertes.length).map(s => ({ nom: s.nom, alertes: s.alertes, rendementPct: s.rendementPct, baisseMaxPct: s.baisseMaxPct, volatiliteAnnualiseePct: s.volatiliteAnnualiseePct, fraicheurJours: s.fraicheurJours })) }}') },
          { id: 's-news', name: 'actualites', type: 'array', value: expr('{{ $json.resultats.flatMap(r => (r.actualites || []).map(a => ({ ...a, societe: r.societe.nom }))).map((a, i, arr) => ({ ...a, societe: [...new Set(arr.filter(b => b.url === a.url).map(b => b.societe))].join(", ") })).filter((a, i, arr) => arr.findIndex(b => b.url === a.url) === i) }}') },
          { id: 's-nstat', name: 'statutModuleActualites', type: 'string', value: expr('{{ !' + P + '.moduleActualites ? "désactivé" : ($json.resultats.every(r => r.statutActualites === "ok") ? "complet" : ($json.resultats.some(r => r.statutActualites === "ok") ? "incomplet : " + $json.resultats.filter(r => r.statutActualites !== "ok").length + " société(s) sans actualités ou en erreur" : "indisponible ou sans article sur la période")) }}') },
          { id: 's-sig', name: 'sigmaMensuellePct', type: 'number', value: expr('{{ ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.volatiliteAnnualiseePct !== null).length ? Math.round(' + RS + '.filter(' + COMPARABLE + ').filter(s => s.volatiliteAnnualiseePct !== null).reduce((a, s) => a + s.volatiliteAnnualiseePct, 0) / ' + RS + '.filter(' + COMPARABLE + ').filter(s => s.volatiliteAnnualiseePct !== null).length * Math.sqrt(' + P + '.horizonScenarioJours / ' + P + '.joursBourseParAn) * 100) / 100 : null }}') },
          { id: 's-sect', name: 'secteurs', type: 'array', value: expr('{{ ($json.secteursBruts || []).filter(s => s && s.secteur).map(s => ({ secteur: s.secteur, nbSocietes: s.count_nom ?? null, societes: s.concatenated_nom ?? "", rendementMoyenPct: Number.isFinite(s.average_rendementPct) ? Math.round(s.average_rendementPct * 100) / 100 : null, meilleurRendementPct: s.max_rendementPct ?? null, pireRendementPct: s.min_rendementPct ?? null, volatiliteMoyennePct: Number.isFinite(s.average_volatilite) ? Math.round(s.average_volatilite * 100) / 100 : null })) }}') },
          { id: 's-tab', name: 'tableau', type: 'array', value: expr('{{ ' + RS + '.map(s => ({ nom: s.nom, mnemo: s.mnemo, symbole: s.symbole, place: s.place, secteur: s.secteur, dateInitiale: s.dateInitiale, coursInitial: s.coursInitial, dateFinale: s.dateFinale, coursFinal: s.coursFinal, rendementPct: s.rendementPct, nbObservations: s.nbObservations, volatiliteAnnualiseePct: s.volatiliteAnnualiseePct, baisseMaxPct: s.baisseMaxPct, ecartAuPlusHautPct: s.ecartAuPlusHautPct, fraicheurJours: s.fraicheurJours, qualite: s.qualite, comparable: ' + COMPARABLE + '(s) })) }}') }
        ]
      }
    }
  },
  output: [{ resultats: [], dateFinaleReference: '2026-10-21', dateInitialeReference: '2026-09-22', perimetre: 'Analyse complète du CAC 40', societesAttendues: 40, societesTraitees: 40, societesAnalyseesAvecSucces: 40, societesEnEchec: [], classement: [], nonComparables: [], rendementMoyenEquipondere: 1.2, rendementMedian: 1.1, repartition: { hausse: 25, baisse: 15, stable: 0 }, volatiliteMoyennePct: 24.5, risques: [], actualites: [], statutModuleActualites: 'désactivé', sigmaMensuellePct: 7.07, tableau: [] }]
});

const scenarios = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Construire les scénarios',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'sc-f', name: 'formuleScenario', type: 'string', value: expr('{{ "Variation hypothétique du panier équipondéré sur la période choisie = k × σ, avec σ = volatilité annualisée moyenne × √(" + ' + P + '.horizonScenarioJours + "/" + ' + P + '.joursBourseParAn + "). Valeur hypothétique = " + ' + P + '.montantPanierEur + " € × (1 + variation / 100). Paramètres k : favorable = " + ' + P + '.kFavorable + ", central = " + ' + P + '.kCentral + ", défavorable = " + ' + P + '.kDefavorable + "." }}') },
          { id: 'sc-l', name: 'scenarios', type: 'array', value: expr('{{ !' + P + '.moduleScenario || $json.sigmaMensuellePct === null ? [] : [["Favorable", ' + P + '.kFavorable, "les sociétés du panier évoluent collectivement d’un écart-type de la période à la hausse, au rythme de la volatilité observée sur la période"], ["Central", ' + P + '.kCentral, "le panier reste globalement stable : aucune variation n’est supposée"], ["Défavorable", ' + P + '.kDefavorable, "les sociétés du panier évoluent collectivement d’un écart-type de la période à la baisse"]].map(x => ({ scenario: x[0], k: x[1], hypothese: x[2], variationHypothetiquePct: Math.round(x[1] * $json.sigmaMensuellePct * 100) / 100, valeurHypothetiquePanierEur: Math.round(' + P + '.montantPanierEur * (1 + x[1] * $json.sigmaMensuellePct / 100) * 100) / 100 })) }}') },
          { id: 'sc-cpt', name: 'compteurs', type: 'object', value: expr('{{ ({ base: "sociétés classées (rendement calculé, dates communes)", nbSocietesClassees: $json.classement.length, nbHausse: $json.classement.filter(c => c.rendementPct > 0).length, nbBaisse: $json.classement.filter(c => c.rendementPct < 0).length, nbRendementInferieurOuEgalMoins10Pct: $json.classement.filter(c => c.rendementPct <= -10).length, nbRendementSuperieurOuEgal10Pct: $json.classement.filter(c => c.rendementPct >= 10).length, nbVolatiliteSuperieureOuEgale35Pct: $json.tableau.filter(s => s.comparable && s.volatiliteAnnualiseePct >= 35).length, nbVolatiliteSuperieureOuEgale50Pct: $json.tableau.filter(s => s.comparable && s.volatiliteAnnualiseePct >= 50).length, nbSocietesAvecAlerte: $json.risques.length, nbAlerteRendementPeriode: $json.tableau.filter(s => s.rendementPct !== null && s.rendementPct <= ' + P + '.seuilBaissePeriodePct).length, nbAlerteBaisseMax: $json.tableau.filter(s => s.baisseMaxPct !== null && s.baisseMaxPct <= ' + P + '.seuilBaisseMaxPct).length, nbAlerteVolatilite: $json.tableau.filter(s => s.volatiliteAnnualiseePct !== null && s.volatiliteAnnualiseePct >= ' + P + '.seuilVolatilitePct).length, nbAlerteFraicheur: $json.tableau.filter(s => s.fraicheurJours !== null && s.fraicheurJours > ' + P + '.seuilFraicheurJours).length, periodeTexte: $json.dateInitialeReference ? "du " + $json.dateInitialeReference.split("-").reverse().join("/") + " au " + $json.dateFinaleReference.split("-").reverse().join("/") : "non disponible", parSecteur: [...new Set($json.tableau.filter(s => s.comparable).map(s => s.secteur))].map(sec => ({ secteur: sec, nbSocietes: $json.tableau.filter(s => s.comparable && s.secteur === sec).length, nbHausse: $json.tableau.filter(s => s.comparable && s.secteur === sec && s.rendementPct > 0).length, nbBaisse: $json.tableau.filter(s => s.comparable && s.secteur === sec && s.rendementPct < 0).length, nbBaisseDeuxChiffres: $json.tableau.filter(s => s.comparable && s.secteur === sec && s.rendementPct <= -10).length, nbHausseDeuxChiffres: $json.tableau.filter(s => s.comparable && s.secteur === sec && s.rendementPct >= 10).length })) }) }}') },
          { id: 'sc-lim', name: 'limitesScenario', type: 'string', value: 'Simulation illustrative, sans probabilité associée ni cours cible : elle suppose des variations normales, une volatilité future égale à la volatilité passée sur la période et une corrélation parfaite entre sociétés, ce qui n’est pas réaliste. Ce n’est pas une prévision.' }
        ]
      }
    }
  },
  output: [{ sigmaMensuellePct: 7.07, formuleScenario: 'k × σ', scenarios: [{ scenario: 'Favorable', k: 1, hypothese: '...', variationHypothetiquePct: 7.07, valeurHypothetiquePanierEur: 1070.7 }], limitesScenario: '...' }]
});

const BILAN_JOUR_JS = '(() => { const v = $json.resultats.map(r => r.societe).filter(s => s.variationJourPct !== null && s.variationJourPct !== undefined); const dates = $json.resultats.map(r => r.societe.dateFinale).filter(Boolean).sort(); const haus = v.filter(s => s.variationJourPct > 0).sort((a, b) => b.variationJourPct - a.variationJourPct); const baisses = v.filter(s => s.variationJourPct < 0).sort((a, b) => a.variationJourPct - b.variationJourPct); const extrait = s => ({ nom: s.nom, mnemo: s.mnemo, variationJourPct: s.variationJourPct }); return { date: dates.length ? dates[dates.length - 1] : null, nbCalculees: v.length, hausse: haus.length, baisse: baisses.length, inchange: v.filter(s => s.variationJourPct === 0).length, plusFortesHausses: haus.slice(0, 3).map(extrait), plusFortesBaisses: baisses.slice(0, 3).map(extrait) }; })()';

const bilanJour = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Préparer le bilan du jour',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      options: { ignoreConversionErrors: true },
      assignments: {
        assignments: [
          { id: 'bj-bil', name: 'coursDuJourBilan', type: 'object', value: expr('{{ ' + BILAN_JOUR_JS + ' }}') }
        ]
      }
    }
  },
  output: [{ coursDuJourBilan: { date: '2026-10-21', nbCalculees: 40, hausse: 25, baisse: 15, inchange: 0, plusFortesHausses: [], plusFortesBaisses: [] } }]
});

const TABLEAU_JOUR_JS = '(() => { const pc = x => (x === null || x === undefined) ? "n/d" : (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %"; const b = $json.coursDuJourBilan; const lignes = $json.resultats.map(r => r.societe).sort((p, q) => (q.variationJourPct ?? -1e9) - (p.variationJourPct ?? -1e9)).map(s => "| " + s.nom + " | " + s.symbole + " | " + (s.coursDuJour === null || s.coursDuJour === undefined ? "n/d" : String(s.coursDuJour).replace(".", ",") + " €") + " | " + (s.dateFinale || "n/d") + " | " + pc(s.variationJourPct) + " | " + pc(s.rendementPct) + " |"); return ["| Société | Symbole | Cours du jour | Date du cours | Variation du jour | Variation sur la période |", "|---|---|---|---|---|---|"].concat(lignes).join("\\n") + "\\n\\n**Dernière séance : " + (b.date || "n/d") + "** — " + b.hausse + " hausse(s), " + b.baisse + " baisse(s), " + b.inchange + " inchangée(s) sur " + b.nbCalculees + " société(s) calculée(s)." + (b.plusFortesHausses.length ? "\\n\\nPlus fortes hausses : " + b.plusFortesHausses.map(s => s.nom + " (" + pc(s.variationJourPct) + ")").join(" ; ") + "." : "") + (b.plusFortesBaisses.length ? "\\n\\nPlus fortes baisses : " + b.plusFortesBaisses.map(s => s.nom + " (" + pc(s.variationJourPct) + ")").join(" ; ") + "." : "") + "\\n\\n_Cours de clôture en euros de la dernière séance disponible (EODHD, données de fin de journée)._"; })()';

const tableaux = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Mettre en forme les tableaux',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      assignments: {
        assignments: [
          { id: 't-tab', name: 'mdTableau', type: 'string', value: expr('{{ !' + P + '.moduleComparaison ? "_Module comparaison désactivé._" : ' + TABLEAU_JOUR_JS + ' + "\\n\\n" + ' + '["| Société | Symbole | Date initiale | Cours initial (€) | Date finale | Cours final (€) | Rendement | Obs. | Qualité |", "|---|---|---|---|---|---|---|---|---|"].concat($json.tableau.map(s => "| " + s.nom + " | " + s.symbole + " | " + (s.dateInitiale || "n/d") + " | " + String(s.coursInitial ?? "n/d").replace(".", ",") + " | " + (s.dateFinale || "n/d") + " | " + String(s.coursFinal ?? "n/d").replace(".", ",") + " | " + (s.rendementPct === null ? "n/d" : (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(s.rendementPct)) + " | " + s.nbObservations + " | " + s.qualite + (s.comparable || s.rendementPct === null ? "" : " (dates différentes)") + " |")).join("\\n") }}') },
          { id: 't-cls', name: 'mdClassement', type: 'string', value: expr('{{ !' + P + '.moduleComparaison ? "_Module comparaison désactivé._" : ($json.classement.length ? ["| Rang | Société | Rendement |", "|---|---|---|"].concat($json.classement.map(c => "| " + c.rang + " | " + c.nom + " (" + c.mnemo + ") | " + (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(c.rendementPct) + " |")).join("\\n") + "\\n\\nPériode commune : du " + $json.dateInitialeReference + " au " + $json.dateFinaleReference + ". Rendement moyen équipondéré : " + String($json.rendementMoyenEquipondere).replace(".", ",") + " % ; médiane : " + String($json.rendementMedian).replace(".", ",") + " % ; " + $json.repartition.hausse + " hausse(s), " + $json.repartition.baisse + " baisse(s)." + ($json.nonComparables.length ? "\\n\\nNon classées faute de dates communes : " + $json.nonComparables.map(n => n.nom + " (" + n.dateInitiale + " → " + n.dateFinale + ")").join(", ") + "." : "") : "_Aucune société ne dispose de données suffisamment comparables pour établir un classement._") }}') },
          { id: 't-risk', name: 'mdRisques', type: 'string', value: expr('{{ !' + P + '.moduleRisques ? "_Module risques désactivé._" : ["| Société | Volatilité annualisée (%) | Baisse max. (%) | Écart au plus haut (%) | Alertes |", "|---|---|---|---|---|"].concat($json.tableau.filter(s => s.rendementPct !== null).map(s => "| " + s.nom + " | " + String(s.volatiliteAnnualiseePct ?? "n/d").replace(".", ",") + " | " + String(s.baisseMaxPct ?? "n/d").replace(".", ",") + " | " + String(s.ecartAuPlusHautPct ?? "n/d").replace(".", ",") + " | " + (($json.risques.find(r => r.nom === s.nom) || {}).alertes || []).join(" ; ") + " |")).join("\\n") + "\\n\\nRègles de surveillance de la maquette (configurables, pas des recommandations) : rendement ≤ " + ' + P + '.seuilBaissePeriodePct + " %, baisse maximale ≤ " + ' + P + '.seuilBaisseMaxPct + " %, volatilité ≥ " + ' + P + '.seuilVolatilitePct + " %, données de plus de " + ' + P + '.seuilFraicheurJours + " jours." }}') },
          { id: 't-news', name: 'mdActualites', type: 'string', value: expr('{{ !' + P + '.moduleActualites ? "_Module actualités désactivé._" : ($json.actualites.length ? $json.actualites.map(a => "- **" + a.societe + "** — [" + a.titre.replace(/[\\[\\]]/g, "") + "](" + a.url + ") — " + a.source + ", " + String(a.date).slice(0, 10)).join("\\n") : "_Aucun article disponible (" + $json.statutModuleActualites + ")._") }}') },
          { id: 't-scen', name: 'mdScenarios', type: 'string', value: expr('{{ !' + P + '.moduleScenario ? "_Module scénario désactivé._" : ($json.scenarios.length ? ["| Scénario | k | Variation hypothétique (%) | Valeur hypothétique d’un panier de " + ' + P + '.montantPanierEur + " € |", "|---|---|---|---|"].concat($json.scenarios.map(s => "| " + s.scenario + " | " + s.k + " | " + String(s.variationHypothetiquePct).replace(".", ",") + " | " + String(s.valeurHypothetiquePanierEur).replace(".", ",") + " € |")).join("\\n") + "\\n\\n" + $json.formuleScenario + "\\n\\n" + $json.limitesScenario : "_Scénarios non calculables : volatilité indisponible._") }}') },
          { id: 't-err', name: 'mdErreurs', type: 'string', value: expr('{{ $json.societesEnEchec.length ? $json.societesEnEchec.map(e => "- " + e.nom + " (" + e.symbole + ") : " + e.qualite + " — " + e.motif).join("\\n") : "Aucune société en erreur ou avec des données insuffisantes." }}') },
          { id: 't-comp', name: 'mdComposition', type: 'string', value: expr('{{ "- Source : " + ' + COMPO + '.origineComposition + (' + COMPO + '.urlSource ? " ([révision " + ' + COMPO + '.revisionWikipedia + "](" + ' + COMPO + '.urlSource + "))" : "") + ", consultée le " + ' + COMPO + '.dateConsultation + "\\n- Sociétés trouvées : " + ' + COMPO + '.nbSocietesRetenues + " / 40 attendues — composition " + (' + COMPO + '.compositionVerifiee ? "vérifiée (40 symboles uniques et valides)" : "NON vérifiée") + "\\n- Changements par rapport à la liste de contrôle du " + ' + REF + '.dateReference + " : " + (' + COMPO + '.changementDetecte ? "entrées " + (' + COMPO + '.nouveauxParRapportAuControle.join(", ") || "aucune") + " ; sorties " + (' + COMPO + '.absentsParRapportAuControle.join(", ") || "aucune") : "aucun") + "\\n- Doublons : " + (' + COMPO + '.doublons.join(", ") || "aucun") + " ; symboles invalides : " + (' + COMPO + '.symbolesInvalides.join(", ") || "aucun") + " ; sociétés clés manquantes : " + (' + COMPO + '.societesClesManquantes.join(", ") || "aucune") + (' + COMPO + '.erreurSource ? "\\n- Incident source : " + ' + COMPO + '.erreurSource : "") + (' + COMPO + '.selectionHorsIndice.length ? "\\n- Sociétés sélectionnées absentes de la composition actuelle : " + ' + COMPO + '.selectionHorsIndice.join(", ") : "") + (' + P + '.avertissementSelection ? "\\n- " + ' + P + '.avertissementSelection : "") }}') }
          ,{ id: 't-sect', name: 'mdSecteurs', type: 'string', value: expr('{{ $json.secteurs.length ? ["| Secteur | Sociétés | Rendement moyen (%) | Meilleur (%) | Plus faible (%) | Volatilité moyenne (%) |", "|---|---|---|---|---|---|"].concat($json.secteurs.map(s => "| " + s.secteur + " | " + s.nbSocietes + " (" + s.societes + ") | " + String(s.rendementMoyenPct ?? "n/d").replace(".", ",") + " | " + String(s.meilleurRendementPct ?? "n/d").replace(".", ",") + " | " + String(s.pireRendementPct ?? "n/d").replace(".", ",") + " | " + String(s.volatiliteMoyennePct ?? "n/d").replace(".", ",") + " |")).join("\n") + "\n\nMoyennes simples (équipondérées) des sociétés disposant d’un rendement calculé ; secteurs tels que publiés par la source de composition (Wikipédia)." : "_Aucune statistique sectorielle disponible._" }}') }
        ]
      }
    }
  },
  output: [{ mdTableau: '| Société |', mdClassement: '| Rang |', mdRisques: '| Société |', mdActualites: '-', mdScenarios: '| Scénario |', mdErreurs: 'Aucune', mdComposition: '- Source' }]
});

const graphiques = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Construire les graphiques QuickChart',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      assignments: {
        assignments: [
          { id: 'gr-ret', name: 'urlGraphiqueRendements', type: 'string', value: expr('{{ $json.classement.length ? "https://quickchart.io/chart?w=900&h=" + Math.max(320, $json.classement.length * 22 + 110) + "&bkg=white&c=" + encodeURIComponent(JSON.stringify({ type: "horizontalBar", data: { labels: $json.classement.map(c => c.rang + ". " + c.nom + " : " + (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(c.rendementPct)), datasets: [{ label: "Rendement (%)", data: $json.classement.map(c => c.rendementPct), backgroundColor: $json.classement.map(c => c.rendementPct >= 0 ? "#1f9d55" : "#d64545") }] }, options: { legend: { display: false }, title: { display: true, text: "Rendement de chaque société, en %, du " + $json.dateInitialeReference.split("-").reverse().join("/") + " au " + $json.dateFinaleReference.split("-").reverse().join("/") }, scales: { xAxes: [{ scaleLabel: { display: true, labelString: "Rendement sur la période (%)" } }] } } })) : "" }}') },
          { id: 'gr-sec', name: 'urlGraphiqueSecteurs', type: 'string', value: expr('{{ $json.secteurs.length ? "https://quickchart.io/chart?w=900&h=" + Math.max(300, $json.secteurs.length * 34 + 110) + "&bkg=white&c=" + encodeURIComponent(JSON.stringify({ type: "horizontalBar", data: { labels: $json.secteurs.map(s => s.secteur + " (" + s.nbSocietes + " sté) : " + (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(s.rendementMoyenPct)), datasets: [{ label: "Rendement moyen (%)", data: $json.secteurs.map(s => s.rendementMoyenPct), backgroundColor: $json.secteurs.map(s => s.rendementMoyenPct >= 0 ? "#1a3cff" : "#d64545") }] }, options: { legend: { display: false }, title: { display: true, text: "Rendement moyen par secteur, en %" }, scales: { xAxes: [{ scaleLabel: { display: true, labelString: "Rendement moyen sur la période (%)" } }] } } })) : "" }}') },
          { id: 'gr-eur', name: 'urlGraphiqueCours', type: 'string', value: expr('{{ $json.classement.length ? "https://quickchart.io/chart?w=900&h=" + Math.max(360, $json.classement.length * 30 + 140) + "&bkg=white&c=" + encodeURIComponent(JSON.stringify({ type: "horizontalBar", data: { labels: $json.classement.map(c => $json.tableau.find(s => s.nom === c.nom)).map(s => s.nom + " : " + (x => Number(x).toFixed(2).replace(".", ",") + " €")(s.coursInitial) + " → " + (x => Number(x).toFixed(2).replace(".", ",") + " €")(s.coursFinal)), datasets: [{ label: "Cours au " + $json.dateInitialeReference.split("-").reverse().join("/") + " (€)", data: $json.classement.map(c => $json.tableau.find(s => s.nom === c.nom).coursInitial), backgroundColor: "#a9b4c6" }, { label: "Cours au " + $json.dateFinaleReference.split("-").reverse().join("/") + " (€)", data: $json.classement.map(c => $json.tableau.find(s => s.nom === c.nom).coursFinal), backgroundColor: "#1a3cff" }] }, options: { legend: { display: true, position: "top" }, title: { display: true, text: "Cours de clôture ajusté en euros, début et fin de période" }, scales: { xAxes: [{ type: "logarithmic", ticks: { display: false }, scaleLabel: { display: true, labelString: "Longueur des barres en échelle logarithmique : les cours exacts sont indiqués à gauche" } }] } } })) : "" }}') },
        ]
      }
    }
  },
  output: [{ urlGraphiqueRendements: 'https://quickchart.io/chart?c=...', urlGraphiqueSecteurs: 'https://quickchart.io/chart?c=...' }]
});

const modeleAnalyste = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.2,
  config: {
    name: 'Modèle Google Gemini (analyste)',
    parameters: { modelName: 'models/gemini-3-flash-preview', options: { temperature: 0.1, maxOutputTokens: 4096 } },
    credentials: { googlePalmApi: newCredential('Google Gemini (PaLM) API') }
  }
});

const calculatrice = tool({
  type: '@n8n/n8n-nodes-langchain.toolCalculator',
  version: 1,
  config: { name: 'Calculatrice', parameters: {} }
});

const reflexionAnalyste = tool({
  type: '@n8n/n8n-nodes-langchain.toolThink',
  version: 1.1,
  config: { name: 'Réflexion', parameters: {} }
});

const formatAnalyse = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Format JSON de l’analyse',
    parameters: { schemaType: 'fromJson', jsonSchemaExample: '{ "tonaliteGlobale": "mitigée", "pointsCles": ["Le rendement moyen équipondéré est de -1,87 %."], "lectureSectorielle": [{ "secteur": "Healthcare", "commentaire": "Secteur le plus performant." }], "societesASurveiller": [{ "societe": "Capgemini", "raison": "Plus forte hausse (+19,51 %)." }], "qualiteDonnees": "40 sociétés analysées sur 40.", "avertissements": ["Période courte d’un mois."] }' }
  }
});

const agentAnalyste = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agent IA analyste',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 5,
    waitBetweenTries: 5000,
    parameters: {
      promptType: 'define',
      text: expr('Analyse les données suivantes (période du {{ ' + T + '.dateInitialeReference || ' + P + '.dateDebut }} au {{ ' + T + '.dateFinaleReference || ' + P + '.dateFin }}) et renvoie le JSON demandé.\n\nDONNÉES :\n{{ JSON.stringify({ perimetre: ' + T + '.perimetre, comptage: { attendues: ' + T + '.societesAttendues, analyseesAvecSucces: ' + T + '.societesAnalyseesAvecSucces, enEchec: ' + T + '.societesEnEchec.map(e => e.nom + " : " + e.qualite) }, statistiques: { rendementMoyenEquipondere: ' + T + '.rendementMoyenEquipondere, rendementMedian: ' + T + '.rendementMedian, repartition: ' + T + '.repartition, volatiliteMoyennePct: ' + T + '.volatiliteMoyennePct }, compteurs: ' + T + '.compteurs, societes: ' + T + '.tableau.filter(s => s.rendementPct !== null).map(s => ({ nom: s.nom, secteur: s.secteur, rendementPct: s.rendementPct, volatiliteAnnualiseePct: s.volatiliteAnnualiseePct, baisseMaxPct: s.baisseMaxPct, ecartAuPlusHautPct: s.ecartAuPlusHautPct, qualite: s.qualite, comparable: s.comparable })), secteurs: ' + T + '.secteurs, alertesRisque: ' + T + '.risques, actualites: ' + T + '.actualites.map(a => ({ societe: a.societe, titre: a.titre, source: a.source, date: a.date, polariteFournisseur: a.polariteFournisseur })) }) }}'),
      hasOutputParser: true,
      options: {
        systemMessage: '<role>\nTu es un analyste actions senior, spécialisé sur le marché français et les sociétés du CAC 40. Tu produis des analyses factuelles, prudentes et rédigées en français, destinées à des étudiants.\n</role>\n\n<instructions>\n<goal>\nÀ partir des indicateurs déjà calculés par le workflow, produire une analyse structurée : tonalité globale, 3 à 5 points clés chiffrés, lecture sectorielle, sociétés remarquables, qualité des données et avertissements.\n</goal>\n\n<context>\n- Utilise uniquement les données fournies dans le message. Tu n’as aucune connaissance extérieure sur les cours, les entreprises ou l’actualité.\n- N’invente jamais un chiffre, une date, une société, un article ou une cause. Recopie les valeurs telles quelles, avec leur signe et leur unité.\n- Pour tout nombre de sociétés (hausses, baisses, dépassements de seuils, comptes par secteur), recopie uniquement les valeurs de l’objet « compteurs ». Ne compte jamais toi-même.\n- Distingue les faits (chiffres fournis) des interprétations, et reste prudent : « semble », « suggère ».\n- N’affirme jamais qu’une actualité a causé un mouvement de cours.\n- Aucune recommandation d’achat ou de vente, aucun cours cible, aucune probabilité, aucune garantie de rendement. « À surveiller » signifie « remarquable dans les données », pas un conseil.\n- Signale explicitement les données manquantes, anciennes ou non comparables.\n- Outils disponibles : la Calculatrice, pour vérifier un écart ou une moyenne que tu veux citer (jamais pour compter des sociétés) ; la Réflexion, pour organiser ton raisonnement avant de répondre.\n- Les exemples ci-dessous servent uniquement à illustrer le style et le format attendus. Leurs noms, leurs chiffres et leurs marchés sont inventés : ne les réutilise jamais dans ton analyse.\n</context>\n\n<examples>\n<example_1>\nCas : sélection personnalisée de 3 sociétés, période d’un mois. Données : Société Alpha +3,21 %, Société Beta -0,12 %, Société Gamma -2,75 % ; compteurs : 1 hausse, 2 baisses.\nSortie attendue : tonalité « mitigée » ; pointsCles : le rendement moyen équipondéré est de +0,11 %, la médiane de -0,12 %, et seule une société sur trois progresse ; lectureSectorielle : un commentaire par secteur présent ; societesASurveiller : Société Gamma, pour sa baisse la plus forte de la période ; qualiteDonnees : 3 sociétés analysées sur 3 ; avertissements : échantillon de trois sociétés, trop petit pour une conclusion générale.\n</example_1>\n\n<example_2>\nCas : analyse complète de 40 sociétés, avec 2 sociétés en échec d’extraction. Données : moyenne équipondérée de +1,40 % sur 38 sociétés valides ; compteurs : 24 hausses, 14 baisses.\nSortie attendue : tonalité « plutôt positive » ; pointsCles : 24 hausses et 14 baisses recopiées des compteurs, et les 2 sociétés en échec signalées nommément ; qualiteDonnees : 38 sociétés analysées sur 40 attendues ; avertissements : deux sociétés exclues du calcul, leurs rendements ne sont pas comparés.\n</example_2>\n\n<example_3>\nCas : période agitée avec beaucoup d’alertes de volatilité. Données : compteurs : 9 sociétés avec une alerte de volatilité ; un secteur ne contient qu’une seule société.\nSortie attendue : tonalité « prudente » ; pointsCles : 9 sociétés dépassent le seuil de volatilité, nombre recopié des compteurs ; lectureSectorielle : le secteur à une seule société est signalé comme non comparable ; avertissements : la volatilité est annualisée à partir d’une seule période d’un mois, elle ne donne pas une mesure long terme.\n</example_3>\n\n<example_4>\nCas fantaisie : la Bourse imaginaire des Îles Vertes, sociétés fictives Verdeau et Brumelac. Données : Verdeau +12,00 %, Brumelac -8,00 %.\nSortie attendue : tonalité « contrastée » ; pointsCles : Verdeau progresse de +12,00 %, Brumelac recule de -8,00 % ; societesASurveiller : Brumelac, pour sa baisse ; avertissements : marché fictif, valeurs illustratives uniquement.\n</example_4>\n\n<example_5>\nCas fantaisie : la planète imaginaire Zéphyra, où les cours sont exprimés en pièces d’or. Données : aucune société calculable, toutes les cotations sont manquantes.\nSortie attendue : tonalité « non déterminable » ; pointsCles : aucun rendement n’est calculable, faute de cotations ; qualiteDonnees : 0 société analysée ; avertissements : analyse impossible, à signaler sans rien extrapoler.\n</example_5>\n</examples>\n\n<output_format>\nRéponds uniquement avec un objet structuré contenant les champs suivants :\n- tonaliteGlobale : un court texte ;\n- pointsCles : une liste de 3 à 5 constats chiffrés ;\n- lectureSectorielle : une liste d’éléments, chacun avec le champ secteur et le champ commentaire ;\n- societesASurveiller : une liste d’éléments, chacun avec le champ societe et le champ raison ;\n- qualiteDonnees : un court texte ;\n- avertissements : une liste de textes.\nLe format technique est imposé par le sous-nœud de sortie : ne l’ajoute pas toi-même.\n</output_format>\n</instructions>\n\n<inputs>\nLe message utilisateur contient les données JSON calculées par le workflow : périmètre, comptage, statistiques, compteurs, secteurs, alertes de risque et actualités fournies.\n</inputs>',
        maxIterations: 6
      }
    },
    subnodes: { model: modeleAnalyste, tools: [calculatrice, reflexionAnalyste], outputParser: formatAnalyse }
  },
  output: [{ output: { tonaliteGlobale: 'mitigée', pointsCles: ['…'], lectureSectorielle: [], societesASurveiller: [], qualiteDonnees: '…', avertissements: [] } }]
});

const analyseStructuree = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Analyse Gemini structurée',
    onError: 'continueRegularOutput',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'as-json', name: 'analyse', type: 'object', value: expr('{{ $json.output && typeof $json.output === "object" ? $json.output : {} }}') },
          { id: 'as-stat', name: 'statutAnalyse', type: 'string', value: expr('{{ $json.error ? "Agent IA analyste indisponible : " + ' + ERR + ' : ($json.output ? "ok" : "réponse vide") }}') }
        ]
      }
    }
  },
  output: [{ analyse: { tonaliteGlobale: 'mitigée', pointsCles: ['…'], lectureSectorielle: [], societesASurveiller: [], qualiteDonnees: '…', avertissements: [] }, statutAnalyse: 'ok' }]
});

const modeleRedacteur = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.2,
  config: {
    name: 'Modèle Google Gemini (rédacteur)',
    parameters: { modelName: 'models/gemini-3-flash-preview', options: { temperature: 0.2, maxOutputTokens: 8192 } },
    credentials: { googlePalmApi: newCredential('Google Gemini (PaLM) API') }
  }
});

const reflexionRedacteur = tool({
  type: '@n8n/n8n-nodes-langchain.toolThink',
  version: 1.1,
  config: { name: 'Réflexion du rédacteur', parameters: {} }
});

const gemini = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agent IA rédacteur',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 5,
    waitBetweenTries: 5000,
    parameters: {
      promptType: 'define',
      text: expr('Rédige le rapport « CAC 40 Insight AI » à partir des seules données JSON ci-dessous. Les calculs ont été faits par le workflow et une analyse structurée a été produite en amont par Gemini analyste : ne recalcule rien et ne modifie aucun chiffre.\n\n' +
            'Structure obligatoire (titres Markdown de niveau 2, dans cet ordre) :\n' +
            '## 1. Synthèse exécutive\n## 2. Composition et périmètre analysés\n## 3. Période\n## 4. Tableau comparatif\n## 5. Classement des performances\n## 6. Analyse sectorielle\n## 7. Risques\n## 8. Actualités\n## 9. Trois scénarios hypothétiques\n## 10. Limites des données\n## 11. Conclusion\n\n' +
            'Marqueurs à recopier tels quels, seuls sur leur ligne, chacun une seule fois : [[POINTS_CLES]] dans la section 1, [[COMPOSITION]] dans la section 2, [[GRAPHIQUE_RENDEMENTS]] puis [[TABLEAU_COMPARATIF]] dans la section 4, [[CLASSEMENT]] dans la section 5, [[SECTEURS]] dans la section 6, [[RISQUES]] dans la section 7, [[ACTUALITES]] dans la section 8, [[SCENARIOS]] dans la section 9, [[ERREURS]] dans la section 10. Le workflow les remplace par des tableaux et des graphiques générés automatiquement : ne les recopie pas, commente-les.\n\n' +
            'Indique explicitement : le nombre de sociétés attendues ({{ ' + T + '.societesAttendues }}), le nombre analysées avec succès ({{ ' + T + '.societesAnalyseesAvecSucces }}) et la liste des sociétés en erreur ou aux données insuffisantes. {{ ' + P + '.analyseComplete ? "L’utilisateur a demandé l’analyse complète du CAC 40 : rappelle que l’objectif est de couvrir les 40 sociétés." : "L’utilisateur a demandé une sélection personnalisée : précise clairement qu’il s’agit d’une analyse partielle." }}\n' +
            'Pour chaque module désactivé, écris simplement que le module n’a pas été demandé.\n\n' +
            'DONNÉES :\n```json\n{{ JSON.stringify({ projet: "CAC 40 Insight AI", dateExecution: ' + P + '.dateExecution, perimetre: ' + T + '.perimetre, periode: { libelle: ' + P + '.periodeLibelle, debutDemande: ' + P + '.dateDebut, finDemandee: ' + P + '.dateFin, premiereCotationCommune: ' + T + '.dateInitialeReference, derniereCotationCommune: ' + T + '.dateFinaleReference }, modules: { comparaison: ' + P + '.moduleComparaison, risques: ' + P + '.moduleRisques, actualites: ' + P + '.moduleActualites, scenario: ' + P + '.moduleScenario }, composition: { source: ' + COMPO + '.origineComposition, revision: ' + COMPO + '.revisionWikipedia, verifiee: ' + COMPO + '.compositionVerifiee, societesTrouvees: ' + COMPO + '.nbSocietesRetenues, changementDetecte: ' + COMPO + '.changementDetecte, entrees: ' + COMPO + '.nouveauxParRapportAuControle, sorties: ' + COMPO + '.absentsParRapportAuControle, incident: ' + COMPO + '.erreurSource, selectionHorsIndice: ' + COMPO + '.selectionHorsIndice }, nature: "Clôtures quotidiennes ajustées (dividendes et divisions) fournies par EODHD, données de fin de journée et non temps réel", comptage: { attendues: ' + T + '.societesAttendues, traitees: ' + T + '.societesTraitees, analyseesAvecSucces: ' + T + '.societesAnalyseesAvecSucces, enEchec: ' + T + '.societesEnEchec }, tableau: ' + T + '.tableau, classement: ' + T + '.classement, nonComparables: ' + T + '.nonComparables, statistiques: { rendementMoyenEquipondere: ' + T + '.rendementMoyenEquipondere, rendementMedian: ' + T + '.rendementMedian, repartition: ' + T + '.repartition, volatiliteMoyennePct: ' + T + '.volatiliteMoyennePct }, compteurs: ' + T + '.compteurs, secteurs: ' + T + '.secteurs, analyseStructureeGemini: $json.analyse || "indisponible", risques: ' + P + '.moduleRisques ? { alertes: ' + T + '.risques, seuils: { rendementPeriodePct: ' + P + '.seuilBaissePeriodePct, baisseMaxPct: ' + P + '.seuilBaisseMaxPct, volatilitePct: ' + P + '.seuilVolatilitePct, fraicheurJours: ' + P + '.seuilFraicheurJours }, methodeVolatilite: "écart-type échantillon des rendements logarithmiques quotidiens × √252" } : "module non demandé", actualites: ' + P + '.moduleActualites ? { statut: ' + T + '.statutModuleActualites, articles: ' + T + '.actualites } : "module non demandé", scenarios: ' + P + '.moduleScenario ? { formule: ' + T + '.formuleScenario, resultats: ' + T + '.scenarios, limites: ' + T + '.limitesScenario } : "module non demandé" }, null, 2) }}\n```'),
      hasOutputParser: false,
      options: {
        systemMessage: '<role>\nTu es analyste financier senior. Tu rédiges en français des rapports de marché professionnels, sobres et factuels, destinés à un public étudiant.\n</role>\n\n<instructions>\n<goal>\nRédiger le rapport « CAC 40 Insight AI » en Markdown, à partir des seules données JSON du message et de l’analyse structurée produite en amont par l’agent analyste. Les calculs ont déjà été faits par le workflow : tu ne recalcules rien et tu ne modifies aucun chiffre.\n</goal>\n\n<context>\n- Utilise uniquement les données fournies dans le message, y compris l’analyse structurée de l’agent analyste. Tu n’as aucune connaissance extérieure sur les cours, les entreprises ou l’actualité.\n- N’invente jamais une valeur, une date, un rendement, un cours, un article, une source ou une citation. Recopie les chiffres à l’identique. Si une donnée manque, écris « non disponible ».\n- Pour tout nombre de sociétés (hausses, baisses, dépassements de seuils, comptes par secteur), recopie uniquement les valeurs de l’objet « compteurs ». Ne compte jamais toi-même.\n- Pour la période, recopie exactement « compteurs.periodeTexte ». Pour les alertes, utilise les compteurs par type (nbAlerteRendementPeriode, nbAlerteBaisseMax, nbAlerteVolatilite, nbAlerteFraicheur) ; nbSocietesAvecAlerte est le total des sociétés ayant au moins une alerte.\n- Distingue les faits des interprétations : introduis toujours une interprétation par « Interprétation : ».\n- Pour les actualités, ne cite que les articles fournis, avec leur source et leur date. N’affirme jamais qu’une actualité a causé un mouvement de cours : au mieux, signale une concomitance.\n- Signale explicitement les données manquantes, incomplètes, anciennes ou non comparables, ainsi que toute incertitude sur la composition de l’indice.\n- Ne garantis aucun rendement. Aucune recommandation d’achat ou de vente, aucun cours cible, aucune probabilité. Les scénarios sont des hypothèses illustratives, pas des prévisions.\n- Les marqueurs [[…]] sont remplacés plus tard par des tableaux et des points clés déjà rédigés : ne recopie pas leur contenu, commente-le en une ou deux phrases.\n- Outil disponible : la Réflexion, pour organiser ton plan avant d’écrire. Elle n’apporte aucune donnée nouvelle.\n- Les exemples ci-dessous illustrent uniquement la structure et le ton. Leurs noms, chiffres et marchés sont inventés : ne les réutilise jamais.\n</context>\n\n<examples>\n<example_1>\nCas : sélection personnalisée de 3 sociétés. Section 2 attendue : « L’analyse porte sur une sélection personnalisée de 3 sociétés sur 3 attendues ; il s’agit donc d’une analyse partielle. » suivi du marqueur [[COMPOSITION]] seul sur sa ligne.\n</example_1>\n\n<example_2>\nCas : analyse complète, 2 sociétés en échec. Section 10 attendue : une phrase qui précise que 38 sociétés sur 40 ont été analysées, puis le nom des 2 sociétés en échec, puis le marqueur [[ERREURS]] seul sur sa ligne.\n</example_2>\n\n<example_3>\nCas : comptage d’alertes. Section 7 attendue : « 9 sociétés ont au moins une alerte. » Ce nombre est recopié de compteurs, jamais recalculé, puis le marqueur [[RISQUES]] seul sur sa ligne.\n</example_3>\n\n<example_4>\nCas fantaisie : marché imaginaire des Îles Vertes, sociétés Verdeau et Brumelac. Section 6 attendue : « Interprétation : le secteur fictif des Forges semble porter la séance, mais il ne compte qu’une seule société. » suivi du marqueur [[SECTEURS]].\n</example_4>\n\n<example_5>\nCas fantaisie : planète Zéphyra, aucune cotation disponible. Section 3 attendue : « Période : non disponible, aucune cotation n’a pu être recueillie. » suivi d’un avertissement en section 10 expliquant que l’analyse est impossible.\n</example_5>\n</examples>\n\n<output_format>\nRéponds uniquement en Markdown, sans bloc de code englobant, avec des titres de niveau 2 dans cet ordre :\n## 1. Synthèse exécutive\n## 2. Composition et périmètre analysés\n## 3. Période\n## 4. Tableau comparatif\n## 5. Classement des performances\n## 6. Analyse sectorielle\n## 7. Risques\n## 8. Actualités\n## 9. Trois scénarios hypothétiques\n## 10. Limites des données\n## 11. Conclusion\n\nMarqueurs, chacun seul sur sa ligne et une seule fois : [[POINTS_CLES]] en section 1 ; [[COMPOSITION]] en section 2 ; [[GRAPHIQUE_RENDEMENTS]] puis [[TABLEAU_COMPARATIF]] en section 4 ; [[CLASSEMENT]] en section 5 ; [[SECTEURS]] en section 6 ; [[RISQUES]] en section 7 ; [[ACTUALITES]] en section 8 ; [[SCENARIOS]] en section 9 ; [[ERREURS]] en section 10.\n\nEn section 1, indique le nombre de sociétés attendues, le nombre analysées avec succès et la liste des sociétés en erreur ou aux données insuffisantes. Indique si l’analyse est complète ou partielle. Pour chaque module désactivé, écris simplement que le module n’a pas été demandé.\n</output_format>\n</instructions>\n\n<inputs>\nLe message utilisateur contient les données JSON du workflow (période, composition, tableau des sociétés, classement, statistiques, compteurs, secteurs, alertes, actualités, scénarios) et l’analyse structurée de l’agent analyste.\n</inputs>',
        maxIterations: 4
      }
    },
    subnodes: { model: modeleRedacteur, tools: [reflexionRedacteur] }
  },
  output: [{ output: '## 1. Synthèse exécutive\n...' }]
});

const texteGemini = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Extraire le texte Gemini',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'x-txt', name: 'texteGemini', type: 'string', value: expr('{{ ((typeof $json.output === "string" ? $json.output : "") || ($json.content?.parts || []).map(p => p.text || "").join("") || $json.text || "").replace(/^```(?:markdown)?\\s*/i, "").replace(/```\\s*$/, "").trim() || "## Rapport narratif indisponible\\n\\nGemini n’a pas renvoyé de texte" + ($json.error ? " (" + ' + ERR + '.slice(0, 200) + ")" : "") + ". Les tableaux ci-dessous, calculés par le workflow, restent valables." }}') },
          { id: 'x-ok', name: 'texteGeminiDisponible', type: 'boolean', value: expr('{{ !!((typeof $json.output === "string" && $json.output.trim()) || ($json.content?.parts || []).map(p => p.text || "").join("") || $json.text) }}') },
          { id: 'x-titre', name: 'titre', type: 'string', value: expr('{{ "CAC 40 Insight AI — rapport du " + ' + P + '.dateExecution }}') }
        ]
      }
    }
  },
  output: [{ texteGemini: '## 1. Synthèse exécutive\n[[COMPOSITION]]', texteGeminiDisponible: true, titre: 'CAC 40 Insight AI — rapport du 22/10/2026 20:00' }]
});

const G = '$("Construire les graphiques QuickChart").first().json';
const MARQUEURS = '({ "[[POINTS_CLES]]": ((' + A + '.pointsCles || []).length ? "**Points clés — Gemini analyste (tonalité : " + (' + A + '.tonaliteGlobale || "indéterminée") + ")**\n\n" + ' + A + '.pointsCles.map(x => "- " + x).join("\n") + ((' + A + '.societesASurveiller || []).length ? "\n\n**Remarquables dans les données :** " + ' + A + '.societesASurveiller.map(x => x.societe + " (" + x.raison + ")").join(" ; ") : "") + (' + A + '.qualiteDonnees ? "\n\n_Qualité des données selon l’analyse : " + ' + A + '.qualiteDonnees + "_" : "") : "_Analyse structurée Gemini indisponible._"), "[[COMPOSITION]]": ' + T + '.mdComposition, "[[GRAPHIQUE_RENDEMENTS]]": (' + G + '.urlGraphiqueRendements ? "<img src=\\"" + ' + G + '.urlGraphiqueRendements + "\\" alt=\\"Rendement par société\\" style=\\"max-width:100%\\">" : "_Graphique indisponible : aucune société comparable._"), "[[TABLEAU_COMPARATIF]]": (' + G + '.urlGraphiqueCours ? "<img src=\\"" + ' + G + '.urlGraphiqueCours + "\\" alt=\\"Cours en euros\\" style=\\"max-width:100%\\">\\n\\n" : "") + ' + T + '.mdTableau, "[[CLASSEMENT]]": ' + T + '.mdClassement, "[[SECTEURS]]": (' + G + '.urlGraphiqueSecteurs ? "<img src=\\"" + ' + G + '.urlGraphiqueSecteurs + "\\" alt=\\"Rendement moyen par secteur\\" style=\\"max-width:100%\\">\n\n" : "") + ' + T + '.mdSecteurs + ((' + A + '.lectureSectorielle || []).length ? "\n\n**Lecture sectorielle (Gemini analyste)**\n\n" + ' + A + '.lectureSectorielle.map(l => "- **" + l.secteur + "** : " + l.commentaire).join("\n") : ""), "[[RISQUES]]": ' + T + '.mdRisques, "[[ACTUALITES]]": ' + T + '.mdActualites, "[[SCENARIOS]]": ' + T + '.mdScenarios, "[[ERREURS]]": ' + T + '.mdErreurs + ((' + A + '.avertissements || []).length ? "\n\n**Avertissements de l’analyse IA :**\n" + ' + A + '.avertissements.map(x => "- " + x).join("\n") : "") })';

const assembler = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Assembler le rapport',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      assignments: {
        assignments: [
          { id: 'r-md', name: 'rapportMarkdown', type: 'string', value: expr('{{ Object.entries(' + MARQUEURS + ').reduce((acc, e) => acc.split(e[0]).join(e[1]), $json.texteGemini) + Object.entries(' + MARQUEURS + ').filter(e => !$json.texteGemini.includes(e[0])).map(e => "\\n\\n### Annexe automatique : " + e[0].replace(/[\\[\\]]/g, "") + "\\n\\n" + e[1]).join("") }}') }
        ]
      }
    }
  },
  output: [{ texteGemini: '...', titre: 'CAC 40 Insight AI', rapportMarkdown: '## 1. Synthèse exécutive' }]
});

const versHtml = node({
  type: 'n8n-nodes-base.markdown',
  version: 1,
  config: {
    name: 'Convertir le rapport en HTML',
    parameters: {
      mode: 'markdownToHtml',
      markdown: expr('{{ "# " + $json.titre + "\\n\\n" + $json.rapportMarkdown + "\\n\\n---\\n\\n_Sources : composition — " + ' + COMPO + '.origineComposition + " ; cours et actualités — EODHD (End-of-Day API, Financial News API), clôtures de fin de journée. Rédaction assistée par Gemini à partir des seules données calculées par le workflow. Document pédagogique : ce n’est pas un conseil en investissement._" }}'),
      destinationKey: 'rapportHtml',
      options: { tables: true, openLinksInNewWindow: true, simplifiedAutoLink: true, strikethrough: true }
    }
  },
  output: [{ titre: 'CAC 40 Insight AI', rapportMarkdown: '...', rapportHtml: '<h1>CAC 40 Insight AI</h1>' }]
});

const page = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Construire la page du rapport',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      include: 'all',
      assignments: {
        assignments: [
          { id: 'g-html', name: 'pageHtml', type: 'string', value: expr('{{ "<div style=\\"font-family:Arial,Helvetica,sans-serif;max-width:1000px;margin:0 auto;color:#1d2433;line-height:1.5\\">" + $json.rapportHtml.replace(/<table>/g, "<table style=\\"border-collapse:collapse;width:100%;font-size:13px\\">").replace(/<th>/g, "<th style=\\"border:1px solid #d0d4dc;padding:4px 6px;background:#f1f3f7;text-align:left\\">").replace(/<td>/g, "<td style=\\"border:1px solid #d0d4dc;padding:4px 6px\\">") + "</div>" }}') }
        ]
      }
    }
  },
  output: [{ titre: 'CAC 40 Insight AI', rapportHtml: '<h1>CAC 40 Insight AI</h1>', pageHtml: '<div><h1>CAC 40 Insight AI</h1></div>' }]
});

const emailDemande = ifElse({
  version: 2.2,
  config: {
    name: 'E-mail demandé ?',
    parameters: {
      conditions: {
        options: conditionOptions,
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ ' + P + '.email }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ]
      }
    }
  }
});

const envoyerEmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Envoyer le rapport par e-mail',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: expr('{{ ' + P + '.email }}'),
      subject: expr('{{ $json.titre }}'),
      emailType: 'html',
      message: expr('{{ $json.pageHtml }}'),
      options: { appendAttribution: false, senderName: 'CAC 40 Insight AI' }
    },
    credentials: { gmailOAuth2: newCredential('Gmail') }
  },
  output: [{ id: '18f0c0ffee', labelIds: ['SENT'], threadId: '18f0c0ffee' }]
});

const ESC = '.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")';

const telegramConfigure = ifElse({
  version: 2.2,
  config: {
    name: 'Telegram configuré ?',
    parameters: {
      conditions: {
        options: conditionOptions,
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ ' + P + '.telegramChatId }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ]
      }
    }
  }
});

const messageTelegram = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Préparer le message Telegram',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'tg-txt', name: 'texte', type: 'string', value: expr('{{ ("<b>📊 CAC 40 Insight AI</b>\\n" + ' + P + '.dateExecution + "\\n" + String(' + T + '.perimetre)' + ESC + ' + (' + T + '.coursDuJourBilan && ' + T + '.coursDuJourBilan.date ? "\\nDernière séance : " + ' + T + '.coursDuJourBilan.date + " — " + ' + T + '.coursDuJourBilan.hausse + " hausse(s), " + ' + T + '.coursDuJourBilan.baisse + " baisse(s)" : "") + "\\nSociétés analysées : " + ' + T + '.societesAnalyseesAvecSucces + " / " + ' + T + '.societesAttendues + (' + T + '.classement.length ? "\\nPériode : " + ' + T + '.dateInitialeReference + " → " + ' + T + '.dateFinaleReference + "\\nRendement moyen : " + (' + T + '.rendementMoyenEquipondere === null ? "n/d" : (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(' + T + '.rendementMoyenEquipondere)) + "\\n\\n" + (' + T + '.classement.length <= 6 ? "📈 <b>Classement</b>\\n" + ' + T + '.classement.map(c => c.rang + ". " + String(c.nom)' + ESC + ' + " : " + (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(c.rendementPct)).join("\\n") : "🔼 <b>Meilleures performances</b>\\n" + ' + T + '.classement.slice(0, 3).map(c => c.rang + ". " + String(c.nom)' + ESC + ' + " : " + (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(c.rendementPct)).join("\\n") + "\\n\\n🔽 <b>Plus faibles performances</b>\\n" + ' + T + '.classement.slice(-3).reverse().map(c => c.rang + ". " + String(c.nom)' + ESC + ' + " : " + (x => (x > 0 ? "+" : "") + Number(x).toFixed(2).replace(".", ",") + " %")(c.rendementPct)).join("\\n")) : "\\nAucun classement disponible : données insuffisantes.") + ((' + A + '.pointsCles || []).length ? "\\n\\n🤖 <b>Points clés (Gemini)</b>\\n" + ' + A + '.pointsCles.slice(0, 3).map(x => "• " + String(x)' + ESC + ').join("\\n") : "") + (' + T + '.societesEnEchec.length ? "\\n\\n⚠️ " + ' + T + '.societesEnEchec.length + " société(s) en erreur ou incomplète(s), détail dans le rapport." : "") + "\\n\\n<i>Clôtures EODHD de fin de journée. Document pédagogique, pas un conseil en investissement.</i>").slice(0, 4000) }}') },
          { id: 'tg-img', name: 'urlGraphique', type: 'string', value: expr('{{ ' + G + '.urlGraphiqueRendements }}') },
          { id: 'tg-chat', name: 'chatId', type: 'string', value: expr('{{ ' + P + '.telegramChatId }}') }
        ]
      }
    }
  },
  output: [{ texte: '<b>📊 CAC 40 Insight AI</b>', urlGraphique: 'https://quickchart.io/chart?c=...', chatId: '123456789' }]
});

const envoyerTelegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Envoyer le résumé Telegram',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.texte }}'),
      additionalFields: { parse_mode: 'HTML', appendAttribution: false, disable_web_page_preview: true }
    },
    credentials: { telegramApi: newCredential('Telegram account') }
  },
  output: [{ ok: true, result: { message_id: 1 } }]
});

const graphiqueDisponible = ifElse({
  version: 2.2,
  config: {
    name: 'Graphique disponible ?',
    parameters: {
      conditions: {
        options: conditionOptions,
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $("Préparer le message Telegram").first().json.urlGraphique }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ]
      }
    }
  }
});

const envoyerGraphique = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Envoyer le graphique Telegram',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation: 'sendPhoto',
      chatId: expr('{{ $("Préparer le message Telegram").first().json.chatId }}'),
      binaryData: false,
      file: expr('{{ $("Préparer le message Telegram").first().json.urlGraphique }}'),
      additionalFields: { caption: 'Rendement des sociétés du CAC 40 sur la période (QuickChart)' }
    },
    credentials: { telegramApi: newCredential('Telegram account') }
  },
  output: [{ ok: true, result: { message_id: 2 } }]
});

const afficherRapport = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Afficher le rapport',
    parameters: {
      operation: 'completion',
      respondWith: 'showText',
      responseText: expr('{{ $json.pageHtml }}')
    }
  },
  output: [{}]
});

const noteGenerale = sticky('## 1. Formulaire et paramètres\nWorkflow unique, sans nœud Code.\nLe formulaire choisit le périmètre (40 sociétés par défaut), la période et les modules. Le nœud « Paramètres analyse » contient tous les seuils, l’ID Telegram et l’ID de la feuille Google Sheets.', [formulaire, parametres, listeControle], { color: 7 });
const noteComposition = sticky('## 2. Composition du CAC 40\nActualisée à chaque exécution via l’API MediaWiki (Wikipédia, tableau « constituents »), puis contrôlée : 40 sociétés, doublons, symboles, 10 sociétés clés, entrées et sorties de l’indice.', [compositionWikipedia, preparerHtml, extraireTableau, normaliserComposition, controlerComposition, uneLigneParSociete, filtrerSelection, supprimerDoublons], { color: 6 });
const noteBoucle = sticky('## 3. Analyse société par société\nBoucle sur les sociétés : cours EODHD sur un mois, rendement, plus haut et plus bas, baisse maximale, volatilité, qualité des données, alertes et actualités facultatives. Une erreur n’arrête jamais la boucle.', [pause, coursHistoriques, controlerCours, calculerRendement, calculerVolatilite, qualifier, actualitesActivees, actualitesEodhd, joindreActualites, sansActualites], { color: 5 });
const noteSecteurs = sticky('## 4. Consolidation, secteurs et historique\nClassement par rendement, statistiques par secteur (Summarize), fusion des résultats, et ajout d’une ligne par société dans la feuille Google Sheets « CAC 40 Insight AI – Historique ».', [classer, consolider, societesAnalysees, lignesSecteur, statsSecteur, classerSecteurs, regrouperSecteurs, fusion, ligneHistorique, historiqueSheets], { color: 4 });
const noteSynthese = sticky('## 5. Synthèse, scénarios et graphiques\nDates communes, statistiques du panier, trois scénarios hypothétiques (formule explicite), tableaux Markdown et graphiques QuickChart (rendements par société, rendement moyen par secteur).', [datesReference, synthese, scenarios, tableaux, graphiques], { color: 3 });
const notePromptAnalyste = sticky('## 🤖 Agent IA n° 1 : analyste\nNœud **AI Agent** relié à un **modèle Google Gemini**, à deux outils (**Calculatrice**, **Réflexion**) et à un **format de sortie JSON**.\n**Prompt système** (visible dans le nœud « Agent IA analyste », Options → System Message) : analyste actions senior ; uniquement les données fournies ; aucun chiffre inventé ; comptages recopiés depuis « compteurs » ; faits ≠ interprétations ; aucune recommandation ni probabilité.\n**Prompt utilisateur** (champ « Prompt ») : toutes les données calculées (sociétés, secteurs, statistiques, compteurs, risques, actualités).\nSortie : tonalité, points clés, lecture sectorielle, sociétés remarquables, qualité des données, avertissements.', [agentAnalyste, analyseStructuree], { color: 2 });
const notePromptRedacteur = sticky('## 🤖 Agent IA n° 2 : rédacteur\nNœud **AI Agent** relié à un **modèle Google Gemini** et à l’outil **Réflexion**.\n**Prompt système** (Options → System Message) : analyste financier senior, rapport professionnel en français ; uniquement les données et l’analyse de l’agent n° 1 ; aucun chiffre inventé ; période et comptages recopiés tels quels ; « Interprétation : » pour toute interprétation ; aucune recommandation.\n**Prompt utilisateur** (champ « Prompt ») : structure imposée en 11 sections, marqueurs [[…]] remplacés ensuite par les tableaux et graphiques calculés.', [gemini, texteGemini], { color: 2 });
const noteDiffusion = sticky('## 6. Diffusion\nRapport HTML affiché à la fin du formulaire, envoyé par Gmail si une adresse est saisie, et résumé + graphique envoyés sur Telegram si `telegramChatId` est renseigné dans « Paramètres analyse ».', [assembler, versHtml, page, emailDemande, envoyerEmail, telegramConfigure, messageTelegram, envoyerTelegram, graphiqueDisponible, envoyerGraphique, afficherRapport], { color: 6 });
const noteCredentials = sticky('## Identifiants à configurer\n- **EODHD API (api_token)** : « Query Auth », nom `api_token`, valeur = votre clé EODHD.\n- **Google Gemini (PaLM) API** : clé Google AI Studio.\n- **Google Sheets**, **Telegram**, **Gmail** : comptes déjà connectés à n8n.\nAucune clé n’est stockée dans le workflow.', [], { color: 3 });

export default workflow('cac40-insight-ai', 'CAC 40 Insight AI', { timezone: 'Europe/Paris', executionOrder: 'v1', saveManualExecutions: true })
  .add(formulaire)
  .to(parametres)
  .to(listeControle)
  .to(compositionWikipedia)
  .to(preparerHtml)
  .to(extraireTableau)
  .to(normaliserComposition)
  .to(controlerComposition)
  .to(uneLigneParSociete)
  .to(filtrerSelection)
  .to(supprimerDoublons)
  .to(boucle
    .onDone(classer)
    .onEachBatch(pause.to(coursHistoriques).to(controlerCours).to(calculerRendement).to(calculerVolatilite).to(calculerCoursJour).to(qualifier).to(actualitesActivees
      .onTrue(actualitesEodhd.to(joindreActualites).to(nextBatch(boucle)))
      .onFalse(sansActualites.to(nextBatch(boucle)))))
  )
  .add(classer)
  .to(consolider.to(fusion.input(0)))
  .add(classer)
  .to(societesAnalysees.to(lignesSecteur).to(statsSecteur).to(classerSecteurs).to(regrouperSecteurs).to(fusion.input(1)))
  .add(classer)
  .to(ligneHistorique.to(historiqueSheets))
  .add(fusion)
  .to(datesReference)
  .to(synthese)
  .to(scenarios)
  .to(bilanJour)
  .to(tableaux)
  .to(graphiques)
  .to(agentAnalyste)
  .to(analyseStructuree)
  .to(gemini)
  .to(texteGemini)
  .to(assembler)
  .to(versHtml)
  .to(page)
  .add(page)
  .to(emailDemande.onTrue(envoyerEmail))
  .add(page)
  .to(telegramConfigure.onTrue(messageTelegram.to(envoyerTelegram).to(graphiqueDisponible.onTrue(envoyerGraphique))))
  .add(page)
  .to(afficherRapport)
  .add(noteGenerale)
  .add(noteComposition)
  .add(noteBoucle)
  .add(noteSecteurs)
  .add(noteSynthese)
  .add(notePromptAnalyste)
  .add(notePromptRedacteur)
  .add(noteDiffusion)
  .add(noteCredentials);
