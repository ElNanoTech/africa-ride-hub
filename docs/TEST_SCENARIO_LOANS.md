# Module Prets - Scenarios de Test Detailles

> Ce document decrit les scenarios de test end-to-end du module Prets (Loans) de DAM Africa Connect.
> Derniere mise a jour : Mars 2026

---

## Resume du Processus Metier

```
Conducteur demande un pret -> Admin examine -> Approuve/Refuse -> Decaissement -> Paiements crees -> Remboursement via Wave -> Pret complete
```

### Statuts du cycle de vie

| Statut | Description |
|--------|-------------|
| `pending` | Demande soumise, en attente d'examen |
| `approved` | Approuve par admin/agent, en attente de decaissement |
| `rejected` | Refuse avec motif |
| `disbursed` | Fonds verses au conducteur |
| `repaying` | Remboursement en cours |
| `completed` | Pret entierement rembourse |

---

## Prerequis

- [ ] Un conducteur avec profil actif et KYC approuve
- [ ] Un score de credit calcule (au moins 1 semaine d'historique)
- [ ] Un admin avec role `super_admin`, `manager` ou `agent_pret`
- [ ] Wave API configuree (pour le paiement)

---

## Scenario 1 : Demande de pret par un conducteur (Happy Path)

### Conditions prealables
- Conducteur connecte, KYC approuve
- Score de credit >= Niveau C (pour pret TV minimum)

### Etapes

| # | Action | Resultat attendu | Verifie |
|---|--------|-------------------|---------|
| 1 | Naviguer vers `/driver/loans` | Page Prets affichee avec score actuel et niveau | Non |
| 2 | Verifier les options de pret | Les prets debloques correspondent au niveau du conducteur | Non |
| 3 | Cliquer "Demander" sur un pret debloque | Dialog de demande s'ouvre avec montants min/max | Non |
| 4 | Saisir un montant valide dans la plage | Bouton "Soumettre" active | Non |
| 5 | Cliquer "Soumettre" | Toast "Demande de pret soumise avec succes!" | Non |
| 6 | Verifier la section "Mes prets" | Nouveau pret visible avec statut "En attente" | Non |
| 7 | Verifier les notifications | Notification "Demande de pret soumise" recue (trigger DB) | Non |

### Verifications en base de donnees
```sql
-- Verifier la demande creee
SELECT id, driver_id, loan_type, amount_requested, status, applied_at 
FROM loans WHERE driver_id = '<DRIVER_ID>' ORDER BY applied_at DESC LIMIT 1;
-- Attendu: status = 'pending'

-- Verifier la notification
SELECT title, message FROM notifications 
WHERE driver_id = '<DRIVER_ID>' AND notification_type = 'loan_status' 
ORDER BY created_at DESC LIMIT 1;
-- Attendu: "Demande de pret soumise"
```

---

## Scenario 2 : Validation des montants (Negative Path)

| # | Action | Resultat attendu | Verifie |
|---|--------|-------------------|---------|
| 1 | Saisir montant < minimum | Message d'erreur "Le montant doit etre entre X et Y" | Non |
| 2 | Saisir montant > maximum | Message d'erreur affiche, bouton desactive | Non |
| 3 | Saisir montant = 0 | Bouton "Soumettre" desactive | Non |
| 4 | Laisser le champ vide | Bouton "Soumettre" desactive | Non |

### Montants par type de pret

| Type | Min | Max | Niveau requis |
|------|-----|-----|--------------|
| Pret Voiture (`car_loan`) | 500 000 FCFA | 5 000 000 FCFA | A |
| Pret Moto (`bike_loan`) | 100 000 FCFA | 1 000 000 FCFA | B |
| Pret TV (`tv_loan`) | 50 000 FCFA | 300 000 FCFA | C |

---

## Scenario 3 : Eligibilite basee sur le niveau (Access Control)

| # | Condition | Resultat attendu | Verifie |
|---|-----------|-------------------|---------|
| 1 | Conducteur Niveau E | Tous les prets verrouilles | Non |
| 2 | Conducteur Niveau D | Tous les prets verrouilles | Non |
| 3 | Conducteur Niveau C | Pret TV debloque uniquement | Non |
| 4 | Conducteur Niveau B | Pret TV + Pret Moto debloques | Non |
| 5 | Conducteur Niveau A | Tous les prets debloques | Non |
| 6 | Cliquer sur pret verrouille | Bouton affiche "Niveau X requis", non cliquable | Non |

---

## Scenario 4 : Approbation par l'admin (Happy Path)

### Conditions prealables
- Au moins 1 pret en statut `pending`
- Admin connecte avec role `super_admin`, `manager` ou `agent_pret`

### Etapes

| # | Action | Resultat attendu | Verifie |
|---|--------|-------------------|---------|
| 1 | Naviguer vers `/admin/loans` | Liste des prets affichee, onglet "En attente" actif | Non |
| 2 | Verifier le compteur "En attente" | Badge rouge avec le nombre correct | Non |
| 3 | Cliquer "..." puis "Approuver" sur un pret | Dialog d'examen s'ouvre avec resume du risque | Non |
| 4 | Verifier le resume du risque | Score, niveau et infos conducteur affiches | Non |
| 5 | Saisir un montant approuve | Champ pre-rempli avec le montant demande | Non |
| 6 | Cliquer "Approuver" | Toast "Pret approuve", dialog ferme | Non |
| 7 | Verifier l'onglet "Approuves" | Pret deplace avec statut "Approuve" | Non |
| 8 | Verifier cote conducteur | Notification "Pret approuve!" recue | Non |

### Verifications en base de donnees
```sql
-- Verifier le statut mis a jour
SELECT status, amount_approved, interest_rate, approved_at 
FROM loans WHERE id = '<LOAN_ID>';
-- Attendu: status = 'approved', amount_approved renseigne, interest_rate = 10

-- Verifier la notification conducteur
SELECT title, message FROM notifications 
WHERE driver_id = '<DRIVER_ID>' AND notification_type = 'loan_status' 
ORDER BY created_at DESC LIMIT 1;
-- Attendu: "Pret approuve!"
```

---

## Scenario 5 : Rejet par l'admin

| # | Action | Resultat attendu | Verifie |
|---|--------|-------------------|---------|
| 1 | Ouvrir le dialog d'examen d'un pret | Dialog affiche | Non |
| 2 | Saisir un motif de rejet | Champ textarea rempli | Non |
| 3 | Cliquer "Rejeter" sans motif | Rien ne se passe (validation) | Non |
| 4 | Saisir un motif puis cliquer "Rejeter" | Toast "Pret rejete", dialog ferme | Non |
| 5 | Verifier l'onglet "Rejetes" | Pret visible avec statut "Refuse" | Non |
| 6 | Verifier cote conducteur | Notification "Demande de pret refusee" avec motif | Non |

---

## Scenario 6 : Controle d'acces par role (RBAC)

| # | Role | Action | Resultat attendu | Verifie |
|---|------|--------|-------------------|---------|
| 1 | `super_admin` | Approuver/Rejeter pret | Autorise | Non |
| 2 | `manager` | Approuver/Rejeter pret | Autorise | Non |
| 3 | `agent_pret` | Approuver/Rejeter pret | Autorise | Non |
| 4 | `agent_support` | Approuver/Rejeter pret | Boutons masques | Non |

### Verification RLS
```sql
-- Verifier que seuls les roles autorises peuvent UPDATE
-- La policy 'loan staff manages loans' autorise: super_admin, manager, agent_pret
SELECT * FROM pg_policies WHERE tablename = 'loans' AND cmd = 'UPDATE';
```

---

## Scenario 7 : KYC Gate

| # | Condition | Resultat attendu | Verifie |
|---|-----------|-------------------|---------|
| 1 | KYC non soumis | Page prets bloquee par KycGate, message d'instruction | Non |
| 2 | KYC en attente | Page bloquee, message "en cours de verification" | Non |
| 3 | KYC rejete | Page bloquee, possibilite de re-soumettre | Non |
| 4 | KYC approuve | Page prets accessible normalement | Non |

---

## Scenario 8 : Decaissement et Remboursement

> **Note** : Le decaissement et la creation des paiements de remboursement sont actuellement **manuels** (geres par l'admin dans `/admin/payments`).

| # | Action | Resultat attendu | Verifie |
|---|--------|-------------------|---------|
| 1 | Admin change statut du pret a `disbursed` | Notification "Pret debourse" envoyee au conducteur | Non |
| 2 | Admin cree les paiements de remboursement | Entrees dans `payments` avec `loan_id` et `payment_type = 'loan'` | Non |
| 3 | Conducteur voit les paiements a effectuer | Liste dans la section paiements | Non |
| 4 | Conducteur paie via Wave | Paiement passe de `pending` a `paid` | Non |
| 5 | Tous les paiements effectues | Statut du pret passe a `completed` | Non |

### Lacune identifiee [CRITIQUE]
- **Pas de generation automatique des paiements de remboursement** : Contrairement aux locations (qui ont un trigger `generate_rental_payments`), les prets n'ont pas de trigger automatique pour creer le calendrier de remboursement apres approbation.
- **Pas de transition automatique** : Le passage de `approved` -> `disbursed` -> `repaying` -> `completed` est entierement manuel.

---

## Scenario 9 : Temps reel (Realtime)

| # | Action | Resultat attendu | Verifie |
|---|--------|-------------------|---------|
| 1 | Admin approuve un pret | Cote conducteur, le statut se met a jour sans rafraichir | Non |
| 2 | Conducteur soumet une demande | Cote admin, le compteur "En attente" s'incremente | Non |

---

## Scenario 10 : Conducteur sans profil

| # | Condition | Resultat attendu | Verifie |
|---|-----------|-------------------|---------|
| 1 | Utilisateur connecte sans profil conducteur | Message "Profil conducteur requis" affiche | Non |
| 2 | Aucune option de pret visible | Pas de cards de pret affichees | Non |

---

## Problemes Connus / Ameliorations Recommandees

| # | Probleme | Severite | Recommandation |
|---|----------|----------|----------------|
| 1 | Pas de generation auto des paiements de remboursement | HAUTE | Creer un trigger `generate_loan_payments` similaire a `generate_rental_payments` |
| 2 | Taux d'interet code en dur a 10% | MOYENNE | Rendre configurable via `scoring_config` ou par type de pret |
| 3 | Pas de verification de pret actif existant | MOYENNE | Empecher un conducteur d'avoir 2 prets actifs simultanes |
| 4 | Pas de limite de duree de remboursement | MOYENNE | Ajouter `repayment_duration_weeks` au modele de donnees |
| 5 | Transition manuelle `approved` -> `disbursed` | MOYENNE | Automatiser ou ajouter un bouton dedie dans l'admin |
| 6 | Pas d'historique de remboursement cote conducteur | MOYENNE | Ajouter une vue des paiements lies au pret |
| 7 | Le montant approuve peut etre superieur au demande | BASSE | Ajouter une validation cote admin |

---

## Matrice de couverture

| Aspect | Couvert | Notes |
|--------|---------|-------|
| Demande de pret (conducteur) | OUI | Validation montants + eligibilite niveau |
| Approbation (admin) | OUI | Avec montant et taux d'interet |
| Rejet (admin) | OUI | Avec motif obligatoire |
| Notifications | OUI | Triggers DB pour chaque changement de statut |
| RBAC | OUI | `canApproveLoan()` + RLS policies |
| KYC Gate | OUI | Composant `<KycGate>` |
| Realtime | OUI | `useLoansRealtime()` |
| Decaissement auto | NON | Manuel uniquement |
| Remboursement auto | NON | Pas de calendrier genere |
| Pret en double | NON | Pas de verification |

---

*Document de test genere pour DAM Africa Connect - Module Prets*
