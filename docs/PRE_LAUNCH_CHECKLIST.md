# 🚀 DAM Africa Connect — Pre-Launch MVP Checklist

> Ce document liste toutes les étapes nécessaires pour passer du mode développement à la production/beta.
> Dernière mise à jour : Mars 2026

---

## 1. 🔑 Wave Payments (Mobile Money)

### Statut actuel
- ✅ `WAVE_API_KEY` configurée (sandbox)
- ✅ Edge function `wave-checkout` déployée
- ✅ Edge function `wave-webhook` déployée
- ✅ Edge function `check-wave-payments` (polling fallback, toutes les 5 min)
- ⬜ `WAVE_WEBHOOK_SECRET` non configuré

### Actions requises

| # | Action | Responsable | Statut |
|---|--------|-------------|--------|
| 1 | Obtenir les identifiants Wave **production** (API Key) | Client / Wave | ⬜ |
| 2 | Mettre à jour le secret `WAVE_API_KEY` avec la clé production | Développeur | ⬜ |
| 3 | Enregistrer l'URL webhook dans le dashboard Wave | Développeur / Client | ⬜ |
| 4 | Configurer le secret `WAVE_WEBHOOK_SECRET` | Développeur | ⬜ |
| 5 | Tester un paiement de bout en bout en production | Tous | ⬜ |

### URL Webhook à enregistrer
```
https://nnpbtfaparhvlxxhroiy.supabase.co/functions/v1/wave-webhook
```

### Événement webhook à sélectionner
- `checkout.session.completed`

### Vérification
- [ ] Un chauffeur peut initier un paiement Wave depuis l'app
- [ ] Le paiement est confirmé automatiquement (webhook ou polling)
- [ ] Le chauffeur reçoit une notification de confirmation
- [ ] Le statut passe de "pending" à "paid" dans le dashboard admin

---

## 2. 🚖 Yango Fleet API (Revenus Conducteurs)

### Statut actuel
- ✅ `YANGO_API_KEY` configurée
- ✅ `YANGO_PARK_ID` configuré
- ✅ Edge function `sync-yango-income` déployée
- ❌ Erreur 403 — permissions API insuffisantes

### Actions requises

| # | Action | Responsable | Statut |
|---|--------|-------------|--------|
| 1 | Confirmer accès API Fleet avec le contact Yango | Client | ⬜ |
| 2 | Activer les 5 permissions API requises | Client / Yango | ⬜ |
| 3 | Vérifier le Park ID (32 caractères hex, sans préfixe) | Client | ⬜ |
| 4 | Vérifier la clé API (~33 caractères, active, non expirée) | Client | ⬜ |
| 5 | Mettre à jour les secrets si nouvelles valeurs fournies | Développeur | ⬜ |
| 6 | Tester la synchronisation des revenus | Développeur | ⬜ |

### Permissions API nécessaires
1. ✅ Obtenir la liste des véhicules
2. ✅ Obtenir la liste des courses/livraisons
3. ✅ Créer un profil conducteur/coursier
4. ✅ Obtenir les transactions par course
5. ✅ Obtenir les transactions globales de la flotte

### Données de test nécessaires
- [ ] **2-3 Yango Driver IDs** de conducteurs réels pour vérifier la synchronisation
- [ ] Confirmer la correspondance entre les `yango_driver_id` dans notre système et ceux de Yango

### Vérification
- [ ] L'appel API retourne un code 200 (plus de 403)
- [ ] Les revenus des conducteurs apparaissent dans le dashboard admin
- [ ] Les revenus synchronisés sont visibles côté chauffeur

---

## 3. 📡 Uffizio (Télématique / Tracking Véhicules)

### Statut actuel
- ⬜ Aucun secret configuré
- ⬜ Edge function non créée (en attente des identifiants)

### Actions requises

| # | Action | Responsable | Statut |
|---|--------|-------------|--------|
| 1 | Fournir l'URL du serveur Uffizio | Client | ⬜ |
| 2 | Fournir username + password API | Client | ⬜ |
| 3 | Confirmer les alertes pour le scoring (survitesse, freinage, etc.) | Client | ⬜ |
| 4 | Confirmer l'identifiant véhicule (plaque, IMEI, ou autre) | Client | ⬜ |
| 5 | Configurer les secrets Uffizio | Développeur | ⬜ |
| 6 | Développer l'edge function de synchronisation | Développeur | ⬜ |
| 7 | Mapper les véhicules Uffizio ↔ véhicules dans notre DB | Développeur | ⬜ |

### Informations demandées au client
```
1. URL serveur : https://votre-serveur.uffizio.com
2. Username API : ___________
3. Password API : ___________
4. Alertes à utiliser : Survitesse / Accélération / Freinage / Zone / Tamper
5. Identifiant véhicule : Plaque / IMEI / Autre
```

### Données de test nécessaires
- [ ] **2-3 identifiants de véhicules** (IMEI ou plaque) pour tester l'intégration
- [ ] Accès temporaire au dashboard Uffizio pour valider les données

### Vérification
- [ ] Connexion API réussie (authentification OK)
- [ ] Données de conduite synchronisées (distance, vitesse, alertes)
- [ ] Les données apparaissent dans la page Tracking admin
- [ ] Le scoring intègre les données de conduite

---

## 4. 🔔 Notifications Push (FCM)

### Statut actuel
- ✅ Edge function `send-push-notification` déployée
- ✅ Notifications in-app fonctionnelles
- ⬜ `FCM_SERVER_KEY` non configuré (push natif non actif)

### Actions requises

| # | Action | Responsable | Statut |
|---|--------|-------------|--------|
| 1 | Créer un projet Firebase (si pas déjà fait) | Développeur | ⬜ |
| 2 | Obtenir la clé serveur FCM | Développeur | ⬜ |
| 3 | Configurer le secret `FCM_SERVER_KEY` | Développeur | ⬜ |
| 4 | Tester l'envoi de push notification | Développeur | ⬜ |

### Vérification
- [ ] Notification push reçue sur Android
- [ ] Notification push reçue sur iOS
- [ ] Les notifications de paiement arrivent en temps réel

---

## 5. ⚙️ Feature Flags à activer pour le Beta

| Flag | Description | Statut |
|------|-------------|--------|
| `rent_to_own_tracker` | Suivi location-vente | ⬜ Activer |
| `ai_driver_chatbot` | Assistant IA chauffeur | ⬜ Activer |
| `gamification_leaderboard` | Classement conducteurs | ⬜ Activer |
| `driver_income_declaration` | Déclaration manuelle revenus | ⬜ Activer |

---

## 6. 🧪 Données de test nécessaires du client

| Donnée | Description | Reçu ? |
|--------|-------------|--------|
| 3-5 conducteurs réels | Nom, téléphone, Yango Driver ID | ⬜ |
| 2-3 véhicules | Modèle, plaque, IMEI tracker | ⬜ |
| 1 location active | Pour tester le cycle de paiement complet | ⬜ |
| Numéro Wave test | Pour valider le paiement de bout en bout | ⬜ |

---

## 7. ✅ Vérifications pré-lancement

### Sécurité
- [ ] RLS activé sur toutes les tables
- [ ] Tous les secrets en production (pas de clés sandbox)
- [ ] Webhook Wave sécurisé avec signature

### Fonctionnel
- [ ] Inscription chauffeur → KYC → Location → Paiement (parcours complet)
- [ ] Score calculé avec données de paiement + revenus + conduite
- [ ] Admin peut approuver/refuser KYC, locations, prêts
- [ ] Notifications reçues à chaque étape

### Performance
- [ ] Temps de chargement < 3s sur réseau 3G
- [ ] L'app fonctionne hors-ligne (mode PWA)

---

## 📋 Résumé des actions en attente du client

1. **Yango** : Vérifier permissions API + fournir Driver IDs de test
2. **Uffizio** : Fournir URL serveur + identifiants API + alertes à utiliser
3. **Wave** : Fournir accès au dashboard Wave pour configurer le webhook
4. **Données de test** : 3-5 conducteurs + 2-3 véhicules avec identifiants

---

*Document généré pour DAM Africa Connect — MVP Beta Launch*
