import { useMemo } from 'react';

export interface DailyTip {
  id: number;
  text: string;
  category: 'motivation' | 'driving' | 'finance' | 'score';
  icon: 'sparkles' | 'car' | 'wallet' | 'trending-up' | 'heart' | 'star' | 'target';
  tierTarget?: string[];
}

const DAILY_TIPS: DailyTip[] = [
  // Motivation (all tiers)
  { id: 1, text: "Chaque trajet vous rapproche de vos objectifs!", category: 'motivation', icon: 'target' },
  { id: 2, text: "Votre constance fait la différence. Continuez!", category: 'motivation', icon: 'star' },
  { id: 3, text: "Un jour à la fois, un succès à la fois.", category: 'motivation', icon: 'heart' },
  { id: 4, text: "La route du succès se construit kilomètre par kilomètre.", category: 'motivation', icon: 'sparkles' },
  { id: 5, text: "Votre détermination est votre meilleur atout!", category: 'motivation', icon: 'star' },
  
  // Driving tips
  { id: 6, text: "Une conduite douce améliore votre score et économise du carburant.", category: 'driving', icon: 'car' },
  { id: 7, text: "Respectez les limites de vitesse pour un meilleur score de conduite.", category: 'driving', icon: 'car' },
  { id: 8, text: "Anticipez les freinages pour une conduite plus sûre.", category: 'driving', icon: 'car' },
  { id: 9, text: "Un véhicule bien entretenu, c'est un conducteur serein.", category: 'driving', icon: 'car' },
  { id: 10, text: "La prudence sur la route est toujours récompensée.", category: 'driving', icon: 'car' },
  
  // Finance tips
  { id: 11, text: "Payer à temps booste votre score et votre crédibilité.", category: 'finance', icon: 'wallet' },
  { id: 12, text: "Chaque paiement ponctuel vous rapproche d'un meilleur niveau.", category: 'finance', icon: 'wallet' },
  { id: 13, text: "Planifiez vos paiements pour éviter les surprises.", category: 'finance', icon: 'wallet' },
  { id: 14, text: "Un bon historique de paiement ouvre des portes.", category: 'finance', icon: 'wallet' },
  { id: 15, text: "La régularité financière est la clé du succès.", category: 'finance', icon: 'wallet' },
  
  // Score tips
  { id: 16, text: "Votre score reflète votre engagement. Faites-le briller!", category: 'score', icon: 'trending-up' },
  { id: 17, text: "Chaque action positive impacte votre score.", category: 'score', icon: 'trending-up' },
  { id: 18, text: "Un meilleur score = de meilleures opportunités de prêt.", category: 'score', icon: 'trending-up' },
  { id: 19, text: "Visez le niveau A pour débloquer tous les avantages!", category: 'score', icon: 'trending-up' },
  { id: 20, text: "Consultez régulièrement votre score pour suivre vos progrès.", category: 'score', icon: 'trending-up' },
  
  // More motivation
  { id: 21, text: "Aujourd'hui est une nouvelle opportunité de progresser.", category: 'motivation', icon: 'sparkles' },
  { id: 22, text: "Votre travail acharné paie. Continuez sur cette lancée!", category: 'motivation', icon: 'star' },
  { id: 23, text: "Les grands succès commencent par de petites actions quotidiennes.", category: 'motivation', icon: 'target' },
  { id: 24, text: "Vous êtes plus proche de vos objectifs qu'hier!", category: 'motivation', icon: 'heart' },
  { id: 25, text: "La persévérance est la mère de tous les succès.", category: 'motivation', icon: 'star' },
  { id: 26, text: "Chaque jour est une chance de faire mieux.", category: 'motivation', icon: 'sparkles' },
  { id: 27, text: "Votre dedication inspire. Continuez à briller!", category: 'motivation', icon: 'heart' },
  { id: 28, text: "Le succès est un voyage, pas une destination.", category: 'motivation', icon: 'target' },
  { id: 29, text: "Croyez en vous et en votre potentiel!", category: 'motivation', icon: 'star' },
  { id: 30, text: "Demain sera encore meilleur grâce à vos efforts d'aujourd'hui.", category: 'motivation', icon: 'sparkles' },
  { id: 31, text: "Vous avez le pouvoir de transformer votre avenir!", category: 'motivation', icon: 'target' },
  
  // Tier-specific tips
  { id: 32, text: "Payez régulièrement pour quitter le niveau E rapidement!", category: 'score', icon: 'trending-up', tierTarget: ['E'] },
  { id: 33, text: "Vous progressez! Le niveau C est à portée de main.", category: 'motivation', icon: 'target', tierTarget: ['D'] },
  { id: 34, text: "Niveau C atteint! Continuez pour débloquer le microcrédit.", category: 'score', icon: 'trending-up', tierTarget: ['C'] },
  { id: 35, text: "Bravo Niveau B! Le prêt moto est maintenant accessible.", category: 'motivation', icon: 'star', tierTarget: ['B'] },
  { id: 36, text: "Vous êtes au sommet! Maintenez votre Niveau A pour le prêt voiture.", category: 'motivation', icon: 'sparkles', tierTarget: ['A'] },
  { id: 37, text: "Niveau E: chaque paiement compte double pour votre progression!", category: 'finance', icon: 'wallet', tierTarget: ['E'] },
  { id: 38, text: "Plus que quelques semaines de régularité pour passer au niveau suivant!", category: 'motivation', icon: 'target', tierTarget: ['D', 'C'] },
  { id: 39, text: "Votre conduite exemplaire vous rapproche du Niveau A!", category: 'driving', icon: 'car', tierTarget: ['B'] },
  { id: 40, text: "Niveau A = confiance maximale. Vous l'avez mérité!", category: 'motivation', icon: 'heart', tierTarget: ['A'] },
];

const ACTIVITY_TIPS: DailyTip[] = [
  { id: 100, text: "Votre série de paiements est impressionnante! Gardez le rythme 🔥", category: 'finance', icon: 'wallet' },
  { id: 101, text: "Score en hausse! Vos efforts portent leurs fruits 📈", category: 'score', icon: 'trending-up' },
  { id: 102, text: "Pensez à soumettre vos revenus pour améliorer votre score.", category: 'finance', icon: 'wallet' },
  { id: 103, text: "Un paiement en retard? Régularisez vite pour protéger votre score.", category: 'finance', icon: 'wallet' },
];

export interface DailyTipContext {
  tier?: string;
  paymentStreak?: number;
  scoreChange?: number;
  hasOverduePayment?: boolean;
}

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

export function useDailyTip(context?: DailyTipContext) {
  const tip = useMemo(() => {
    const dayOfYear = getDayOfYear();
    
    // Activity-specific tips take priority
    if (context) {
      if (context.hasOverduePayment) return ACTIVITY_TIPS[3];
      if (context.paymentStreak && context.paymentStreak >= 4) return ACTIVITY_TIPS[0];
      if (context.scoreChange && context.scoreChange > 0) return ACTIVITY_TIPS[1];
    }
    
    // Filter by tier
    let pool = DAILY_TIPS;
    if (context?.tier) {
      pool = DAILY_TIPS.filter(t => !t.tierTarget || t.tierTarget.includes(context.tier!));
    }
    
    const index = dayOfYear % pool.length;
    return pool[index];
  }, [context?.tier, context?.paymentStreak, context?.scoreChange, context?.hasOverduePayment]);

  return tip;
}

export function useDailyTipByCategory(category?: DailyTip['category']) {
  const tip = useMemo(() => {
    const dayOfYear = getDayOfYear();
    
    if (!category) {
      const index = dayOfYear % DAILY_TIPS.length;
      return DAILY_TIPS[index];
    }
    
    const categoryTips = DAILY_TIPS.filter(t => t.category === category);
    const index = dayOfYear % categoryTips.length;
    return categoryTips[index];
  }, [category]);

  return tip;
}
