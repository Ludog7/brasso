---
labels: api, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-06 — api : bascule d'utilisateur par PIN (pose, ré-authentification, verrouillage, blocage)

## Contexte
Sur le poste partagé de l'atelier, plusieurs personnes se succèdent et ressaisir un mot de passe complet à chaque relève est un frein réel. ADR-13 ({{M10-02}}) autorise une **ré-authentification par PIN** et en fixe les garde-fous.

**Arbitrage de Ludo du 2026-07-20** : **tous** les rôles basculent par PIN — **4 chiffres**, **6 pour `admin`**. Motif : poste ouvert, mais **environnement contrôlé** (local associatif, appliance LAN-only).

Ce ticket implémente ce qu'ADR-13 décide. Il n'invente **aucune valeur** : seuils, fenêtres et durées viennent de l'ADR. Si un chiffre y manque, **le ticket s'arrête et l'ADR est complété** — coder une valeur au jugé ici la rendrait invisible à la revue.

SOURCE : ADR-13 ; SPEC-ORCHESTRATION §9.2 (Q5), §0 (ADR-10).

## Objectif
Un utilisateur pose son PIN, un autre bascule dessus en une saisie, et un attaquant qui essaie des combinaisons est arrêté — le tout tracé de façon distinguable dans le journal d'audit.

## Périmètre technique
- `apps/api/src/modules/auth/` : routes de pose/réinitialisation de PIN et de bascule ; `plugins/rate-limit` déjà en place.
- Hachage **Argon2id**, comme les mots de passe — jamais de PIN en clair, ni en base, ni en journal, ni dans un message d'erreur.
- Hors périmètre : l'UI ({{M10-09}}), les colonnes ({{M10-04}}), et toute modification de la matrice RBAC.

## Spécification

**A. Pose et réinitialisation.** L'utilisateur pose son PIN **dans son profil**, authentifié normalement. L'admin peut le **réinitialiser** — c'est-à-dire le supprimer ou en forcer le renouvellement : il ne le **lit jamais**, le PIN est haché. Aucune route ne doit permettre de le récupérer.

Longueur : **4 chiffres**, **6 pour `admin`**. Vérification **côté serveur** — un contrôle purement client se contourne. Traiter le cas tranché par ADR-13 : un compte qui **reçoit** le rôle `admin` alors qu'il porte un PIN à 4 chiffres.

**B. PIN triviaux — la mesure principale.** ADR-13 établit que contre le modèle de menace réel (observation par-dessus l'épaule), l'interdiction des suites triviales pèse **plus lourd que la longueur**. Un PIN admin `123456` est plus faible qu'un 4-chiffres tiré au hasard. Appliquer la règle de l'ADR **aux deux longueurs**, **côté serveur**.

**C. Bascule.** Ré-authentification par PIN ouvrant une session **plus courte** qu'une session mot de passe (durée fixée par ADR-13), avec **verrouillage automatique** après inactivité. Le cookie de session conserve ses attributs `httpOnly/secure/sameSite`.

**D. Rate-limit et blocage.** Seuil, fenêtre, effet et **portée** (par utilisateur / par poste) viennent d'ADR-13, qui a dû trancher en nommant le risque écarté : un blocage par utilisateur seul laisse balayer les comptes un à un ; un blocage par poste seul permet de bloquer autrui par déni de service. Implémenter la portée retenue, **pas une autre**.

Le **déblocage** est spécifié par l'ADR, y compris le cas « admin non joignable un samedi de brassage ». Si l'ADR retient une expiration automatique, elle doit fonctionner **sans intervention**.

**E. Réponses non divulgantes.** Un échec ne dit **jamais** si c'est l'utilisateur ou le PIN qui est faux, ni si un compte existe, ni combien d'essais restent. Le message est constant. Attention également au **temps de réponse** : une comparaison qui court-circuite renseigne aussi sûrement qu'un message.

**F. Audit.** Une session ouverte par PIN doit être **distinguable** d'une session ouverte par mot de passe (ADR-13) — sans quoi une action tracée ne dira pas avec quel niveau de preuve l'utilisateur a été authentifié. Journaliser : bascules réussies, échecs, blocages, poses et réinitialisations. **Jamais** le PIN, ni un extrait.

## Definition of Done
- [ ] **Aucune valeur numérique inventée** : chaque seuil/durée est tracé jusqu'à ADR-13 (le référencer en commentaire)
- [ ] PIN haché **Argon2id** ; absent de la base en clair, des journaux et des messages d'erreur
- [ ] Longueur **4 / 6 pour `admin`** vérifiée **côté serveur** ; cas du passage au rôle `admin` traité
- [ ] Règle des **PIN triviaux** appliquée côté serveur, **aux deux longueurs**
- [ ] Réinitialisation admin possible **sans lecture** du PIN — aucune route ne le restitue
- [ ] Session issue d'une bascule **plus courte** + **verrouillage automatique** effectif
- [ ] Rate-limit et blocage conformes à la **portée** retenue par l'ADR ; **déblocage testé**, cas « admin non joignable » compris
- [ ] Réponses **non divulgantes** (message constant, pas de fuite par le temps de réponse)
- [ ] Sessions PIN **distinguables** en audit ; les 5 familles d'événements journalisées
- [ ] Tests de refus : mauvais PIN, compte bloqué, PIN trivial, longueur incorrecte, PIN absent
- [ ] Prettier passé sur **tous** les fichiers touchés ; CI verte

## Dépendances
Bloqué par : {{M10-02}} (ADR-13 — **toutes** les valeurs), {{M10-04}} (colonnes) — Bloque : {{M10-09}}
