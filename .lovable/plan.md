## Plan

### 1. Seed sample training modules
Insert 3 published modules into `training_modules` covering core driver topics, each with video, content, and a short quiz so both the empty and populated states render correctly:

- **Sécurité routière de base** (safety, 5 min, mandatory) — short YouTube clip + 3-question quiz
- **Maximiser vos revenus avec Yango** (financial, 7 min) — content + 2-question quiz
- **Service client 5 étoiles** (customer_service, 4 min) — content only, "J'ai terminé" completion

Done via the insert tool (data, not schema).

### 2. Promote "Formation" from Paramètres to Profil top-level
Currently the entry point lives inside `src/pages/driver/Settings.tsx`. Move it up one level so drivers see it directly on `src/pages/driver/Profile.tsx`:

- Add a prominent **Formation** card/row on the Profile page (with `GraduationCap` icon, French label, progress hint like "X/Y modules terminés" if cheap to fetch, otherwise just a chevron link) routing to `/driver/formation`.
- Remove the Formation entry from `src/pages/driver/Settings.tsx` to avoid duplication.
- Route `/driver/formation` already exists — no router changes needed.

### 3. Verify
- Confirm modules appear on driver `/driver/formation` and on admin `/admin/communication` Formations tab.
- Confirm Profile page now shows Formation directly and Settings no longer lists it.

### Technical notes
- Modules will be inserted with `is_published = true`, distinct `order_index` (10/20/30), realistic `duration_minutes`, and `quiz` as JSON array of `{question, options, correct_index, explanation}` matching the `parseQuiz` shape in `Formation.tsx`.
- `customer_id` left null (platform-wide) unless schema requires it — will check before insert.
