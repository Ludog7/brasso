Contexte et objectifs
La plateforme vise à devenir le « système d’exploitation d’atelier » d’une microbrasserie associative :

Gestion complète du cycle de vie des boissons (bières, ginger beer, limonades, hydromels, boissons fermentées sans alcool).

Traçabilité technique des brassins (Recettes, Batchs, équipements, ingrédients, process).

Gestion associative (membres, cotisations) et exploitation du lieu (affichage des boissons, synchronisation avec des solutions de caisse externes).

Principe clé : Recette = modèle théorique immuable, Batch = instance d’exécution datée, liée à une recette, à un équipement et à un brasseur.

Les priorités de cette version :

Ne pas construire un logiciel de caisse certifié NF525, mais un hub de synchronisation vers des solutions externes conformes.

Séparer clairement les types de boissons et les moteurs de calcul associés (bières vs boissons alternatives/softs).

Intégrer des garde‑fous de sécurité pour les boissons non alcoolisées ou faiblement alcoolisées (pH, carbonatation).

Contraintes réglementaires et sécurité des produits
Caisse et loi anti‑fraude TVA (NF525)
En France, les logiciels de caisse utilisés par des entités assujetties à la TVA doivent répondre aux exigences d’Inaltérabilité, Sécurisation, Conservation, Archivage (ISCA) et être certifiés (NF525 ou LNE).

La plateforme n’est pas un logiciel de caisse au sens fiscal : aucun encaissement n’est généré ni validé directement dans l’application.

Rôle de la plateforme :

Consommer des webhooks/API de solutions tierces (SumUp, Zettle, HelloAsso…) pour remonter les ventes et les cotisations.

Utiliser ces données pour :

Mettre à jour les stocks conditionnés (bouteilles, fûts).

Produire des rapports pour l’association (CA, volumes, produits).

Sécurité microbiologique des boissons « soft » et « alt »
Le seuil de pH 4,6 est un cut‑off reconnu en sécurité alimentaire : au‑dessus de 4,6 et avec une forte activité en eau, on est dans la zone des « low‑acid foods » qui exigent des contrôles particuliers (acidification, pasteurisation, chaîne du froid).

Les moteurs de calcul pour ginger beer, limonade, kombucha et autres boissons alternatives doivent :

Imposer la saisie du pH et afficher un indicateur de sécurité.

Intégrer une étape de stabilisation obligatoire (thermique, chaîne du froid, filtration + acidification) avant validation du conditionnement à température ambiante.

Suivre le potentiel de carbonatation résiduelle (sucre restant + mode de stockage), avec alerte en cas de risque de surpression en bouteille.

Modèle métier central
Entités structurantes (à décliner en schéma BD / modèle domaine) :

Recette
Attributs :

Id, nom, type de boisson :

BIERE, GINGER_BEER, LIMONADE, HYDROMEL, FERMENTE_SANS_ALCOOL, etc.

Style :

Bières : style BJCP (densité, couleur, amertume).

Autres boissons : taxonomie interne configurable.

Ingrédients :

Malts/céréales (couleur, rendement, pouvoir diastatique).

Sucres (saccharose, glucose, miel, sirops maison).

Houblons (acides alpha, forme, utilisation).

Levures/ferments (type, plage de température, tolérance alcool).

Adjuvants (épices, fruits, jus, infusions).

Process :

Empâtage ou macération (paliers, températures, durées).

Ébullition ou chauffe (durée, cibles de volume/densité).

Fermentation (schéma de phases, températures cibles).

Stabilisation (surtout pour moteurs alternatifs).

Batch
Liens :

Recette + version.

Brasseur(s) responsable(s).

Profil d’équipement utilisé.

Attributs :

Statut : PLANIFIE, EN_BRASSAGE, EN_FERMENTATION, EN_CONDITIONNEMENT, TERMINE, ANNULE.

Dates clés (brassage, mise en fermentation, conditionnement).

Mesures réelles (volumes, densités, températures, pH, incidents).

Journal d’écarts de procédure (mode manuel).

Équipement
Cuve d’empâtage / macération :

Volume nominal, capacité calorifique, profil de chauffe.

Paramètres :

Deadspace, pertes au transfert, taux d’évaporation (L/h).

Profil d’eau de base (analyse réseau) + profils cibles par style.

Stock
Articles « Recette » :

Malts, sucres, houblons, levures, adjuvants.

Articles « Bulk » :

Gaz (CO₂), produits de nettoyage, consommables de service.

Conditionnements :

Bouteilles (formats), capsules, fûts, étiquettes.

Membre
Identité : nom, prénom, date de naissance (si nécessaire), numéro d’adhérent.

Coordonnées : adresse, email, téléphone.

Rôles : adhérent, brasseur, membre CA, trésorier, référent RGPD.

Statut de cotisation : à jour / en retard.

Consentements RGPD : communication, photos, notifications légales.

Transaction externe
Représente une vente ou une cotisation issue d’un système externe (SumUp, Zettle, HelloAsso…).

Non modifiable depuis la plateforme (read‑only).

Contient :

Montant, date, moyen de paiement.

Identifiant produit externe (si disponible).

Référence éventuelle vers SKU interne (si mappé).

Moteurs de calcul par type de boisson
Types de moteur
BEER_ENGINE :

Calcul DI, DF, ABV, IBU (Tinseth/Rager), couleur (Morey/EBC).

Alignement sur plages BJCP (densité, couleur, amertume).

ALT_FERMENTED_ENGINE (ginger beer, hydromels, kombucha…) :

Calcul ABV et atténuation.

IBU/EBC non calculés automatiquement (formules basées sur malts/houblons non pertinentes pour jus/infusions).

Champs qualitatifs (acidité, couleur estimée) ou saisies manuelles.

Suivi pH + étape de stabilisation obligatoire + estimation du risque de carbonatation résiduelle.

SOFT_DRINK_ENGINE (limonades non fermentées, boissons sucrées sans alcool) :

Pas d’ABV ni IBU.

Variables clés : concentration en sucre, pH, aromatique.

Suivi pH et mode de conservation (froid / ambiant), stabilisation si nécessaire.

Comportement UI
À la création de recette :

Choix du type de boisson → choix du moteur proposé.

Formulaires :

BEER_ENGINE : affichage en temps réel DI/DF/ABV/IBU/EBC + jauges BJCP.

Moteurs alternatifs : masque certains champs, met en avant pH, stabilisation, indicateurs qualitatifs.

Niveau 1 – Noyau de brassage : conception, profil matériel, Jour J
Concepteur de recettes
Calculs prédictifs :

BEER_ENGINE : DI, DF, ABV, IBU, EBC, comparés aux styles BJCP.

Moteurs alternatifs : ABV éventuel, densité, pH ; IBU/EBC désactivés ou manuels.

Gestion ingrédients/process :

Paliers empâtage/macération, plan de houblonnage, plan de chauffe/ébullition, plan de fermentation, stabilisation.

Profil matériel & moteur thermique
Paramétrage :

Capacité calorifique cuve, deadspace, pertes, taux d’évaporation, profils d’eau.

Calculs :

Température d’eau de strike selon température grain/sucre.

Temps de montée en chauffe estimé, utilisé par la State Machine Jour J.

State Machine « Jour J » tolérante
Structure des étapes
Phases : Initialisation → Empâtage/Macération → Filtration/Pré‑ébullition → Ébullition/Chauffe → Refroidissement → Ensemencement.

Chaque étape :

Actions (Start/Stop/Valider).

Timers.

Saisie de mesures (densité, volume, température, parfois pH).

Gestion des alertes (écarts vs modèle).

Timers et rampes de chauffe
Feature à sanctuariser :

Le timer de palier ne démarre qu’après stabilisation à la température cible confirmée (saisie manuelle ou sonde).

Affichage temps estimé vs réel de montée en chauffe pour enrichir la calibration.

Mode normal vs mode manuel
Mode normal :

Progression contrôlée, avec vérification des conditions (timers, mesures).

Mode manuel / « Forcer l’étape » :

Bouton disponible sur chaque étape.

Permet de passer à l’étape suivante malgré conditions incomplètes (panne tablette, sonde HS, oubli de validation…).

Génère automatiquement une entrée dans le log d’écart de procédure du batch :

Auteur, date/heure, étape concernée, motif.

Corrections en cours de route
Sur la mesure densité/volume pré‑ébullition :

Comparaison avec modèle.

Propositions de correction (allonger ébullition, ajouter sucre/extrait) avec impact estimé sur DI/ABV.

Journalisation des décisions pour analyse ultérieure.

Niveau 2 – Atelier & association : stocks, membres, caisse, affichage
Stocks : Recette vs Bulk
Articles Recette
Déduction automatique et proportionnelle :

À la planification d’un batch : passage des quantités nécessaires en statut « Réservé ».

À la validation de l’ensemencement : déduction effective basée sur volume réel du batch (ajustement).

Articles Bulk
Gestion dans un inventaire séparé :

Pas de déduction automatisée par batch.

Déduction forfaitaire ou manuelle (ex : consommation de CO₂ par purges + carbonatation de X fûts).

Inventaire périodique saisi par les brasseurs (mensuel/trimestriel).

Alertes et coût de revient
Alertes de seuil sur Recette et Bulk (comportements différenciés).

Coût de revient :

Basé sur ingrédients Recette + conditionnement.

Bulk imputé forfaitairement si nécessaire.

Module membres & RGPD
Fichier membres :

Création/édition des membres, statut d’adhésion, rôles.

Flux :

Association des paiements de cotisation via HelloAsso (webhooks) aux membres.

RGPD :

Gestion des consentements.

Outils pour répondre aux demandes d’accès, rectification, suppression, avec prise en compte des contraintes de conservation des données comptables.

Module Caisse & Comptabilité (Hub)
Intégrations
Connecteurs vers :

HelloAsso (adhésions, ventes en ligne).

SumUp/Zettle (terminaux physiques).

Mapping produit
Chaque produit vendable de la brasserie possède :

Un SKU interne.

Un mapping explicite vers un article/catégorie externe (SumUp/Zettle/HelloAsso).

Mode dégradé – transactions non mappées
Si une transaction externe reçue ne contient pas d’identifiant produit mappable :

La transaction est enregistrée (montant, date, moyen de paiement) pour le reporting financier.

Aucune déduction automatique de stock n’est réalisée.

Une alerte est créée :

Exemple : « 1 vente non identifiée sur SumUp le 03/07 – ajustement manuel du stock requis ».

Vue de tableau de bord dédiée aux anomalies (traitement manuel des stocks, formation des bénévoles).

Comptabilité associée
Export CSV/Excel des ventes, cotisations, dépenses pour intégration dans un outil comptable externe.

Pas de gestion complète du plan de comptes dans la plateforme, mais pré‑structuration des données.

Module d’affichage en brasserie
Gestion des écrans :

Définition de surfaces d’affichage (Bar, Salle, Événement).

Templates (liste, tableau, cartes).

Sélection des produits :

Filtrer sur produits disponibles (stock > 0).

Indicateurs « nouveau », « coup de cœur », « brassin spécial ».

Synchronisation :

Mise à jour automatique à chaque changement significatif de stock ou de statut produit.

Mentions légales :

Messages obligatoires liés à l’alcool, allergènes si nécessaire.

Niveau 3 – Outils avancés & intégrations
Boîte à outils calculateurs
Calculateurs levure/starter, eau, dilution, conditionnement, BIAB, convertisseurs d’unités, accessibles :

De façon autonome.

ou reliés à un batch pour archiver les décisions.

Fermentation (sans IoT prioritaire)
Calendrier de fermentation :

Phases, tâches (dry‑hop, transferts, dégustations).

Journal :

Densité, températures, pH, saisis manuellement.

Graphiques :

Densité vs temps, température vs temps pour analyse de process.

Standards & API
BeerXML/BeerJSON (scope limité)
BeerXML est un standard conçu pour l’échange de recettes de bière et de données de brassage associées.

La plateforme :

Limite l’import/export BeerXML/BeerJSON au moteur BEER_ENGINE.

Ne propose pas BeerXML/BeerJSON pour les recettes ALT_FERMENTED_ENGINE ou SOFT_DRINK_ENGINE.

Format JSON propriétaire
Pour les recettes alternatives (ginger beer, limonades, etc.) :

Définir un schéma JSON interne incluant :

Ingrédients non standards (jus, sirops maison).

Étapes de macération/stabilisation.

pH, mode de stabilisation, paramètres de sécurité.

Permettre le partage entre membres et instances de la plateforme, sans dépendance aux standards de bière.

API publique
REST/GraphQL (à définir) pour :

Recettes, batchs, stocks, membres (en lecture restreinte).

Registres de brassage, journaux d’écarts, rapports.

Exigences techniques transverses
UX & devices
Cible principale : tablette en brasserie (écran tactile, doigts mouillés).

Interfaces :

Boutons larges, contrastes fort, mode sombre, minimisation des drag‑and‑drop.

Sécurité & RGPD
Authentification avec rôles (admin, brassage, caisse, RGPD).

Séparation stricte des données personnelles et des données techniques.

Journalisation des accès aux données sensibles.

Conformité minimale avec les principes RGPD (finalité, minimisation, durée de conservation).

Extensibilité (IoT et futures intégrations)
Conception des modules Jour J et fermentation avec des points d’extension pour capteurs IoT (densimètres, sondes de température) sans refonte du cœur métier.

Respect des standards d’échange pour la bière (BeerXML/BeerJSON) et format JSON propriétaire pour les autres boissons.
