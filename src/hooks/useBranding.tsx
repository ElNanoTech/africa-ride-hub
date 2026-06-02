import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useCurrentCustomer, usePlatformSettings } from '@/hooks/useFeatureFlags';

interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  faviconUrl?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  footerText?: string;
}

interface BrandingContextType {
  branding: BrandingConfig;
  isLoading: boolean;
  updateBranding: (config: Partial<BrandingConfig>) => void;
}

const defaultBranding: BrandingConfig = {
  appName: 'DAM Flotte',
  logoUrl: null,
  primaryColor: '#22c55e', // DAM Green
  secondaryColor: '#3b82f6',
  tagline: 'Votre partenaire mobilité en Côte d\'Ivoire',
  supportEmail: 'support@dam-flotte.ci',
  supportPhone: '+225 07 00 00 00',
  footerText: '© 2026 DAM Flotte. Tous droits réservés.',
};

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  isLoading: true,
  updateBranding: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig>(defaultBranding);
  const { data: customer, isLoading: customerLoading } = useCurrentCustomer();
  const { data: platformSettings, isLoading: settingsLoading } = usePlatformSettings();

  useEffect(() => {
    // First apply platform settings (if platform owner)
    const brandingSettings = platformSettings?.find(s => s.setting_key === 'branding');
    if (brandingSettings?.setting_value) {
      const settings = brandingSettings.setting_value as Record<string, unknown>;
      setBranding(prev => ({
        ...prev,
        appName: (settings.app_name as string) || prev.appName,
        tagline: (settings.tagline as string) || prev.tagline,
        supportEmail: (settings.support_email as string) || prev.supportEmail,
        supportPhone: (settings.support_phone as string) || prev.supportPhone,
        footerText: (settings.footer_text as string) || prev.footerText,
      }));
    }

    // Then apply customer-specific branding
    if (customer) {
      setBranding(prev => ({
        ...prev,
        appName: customer.name || prev.appName,
        logoUrl: customer.logo_url || prev.logoUrl,
        primaryColor: customer.primary_color || prev.primaryColor,
        secondaryColor: customer.secondary_color || prev.secondaryColor,
      }));

      // Apply custom CSS variables for customer colors
      if (customer.primary_color) {
        applyCustomColors(customer.primary_color, customer.secondary_color || undefined);
      }
    }
  }, [customer, platformSettings]);

  const updateBranding = (config: Partial<BrandingConfig>) => {
    setBranding(prev => ({ ...prev, ...config }));
    if (config.primaryColor || config.secondaryColor) {
      applyCustomColors(config.primaryColor, config.secondaryColor);
    }
  };

  const isLoading = customerLoading || settingsLoading;

  return (
    <BrandingContext.Provider value={{ branding, isLoading, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

/**
 * Apply custom colors to CSS variables
 */
function applyCustomColors(primaryHex?: string, secondaryHex?: string) {
  if (!primaryHex) return;

  const root = document.documentElement;
  
  // Convert hex to HSL
  const primaryHSL = hexToHSL(primaryHex);
  if (primaryHSL) {
    root.style.setProperty('--primary', `${primaryHSL.h} ${primaryHSL.s}% ${primaryHSL.l}%`);
    root.style.setProperty('--primary-glow', `${primaryHSL.h} ${primaryHSL.s}% ${Math.min(primaryHSL.l + 10, 100)}%`);
    root.style.setProperty('--ring', `${primaryHSL.h} ${primaryHSL.s}% ${primaryHSL.l}%`);
    root.style.setProperty('--sidebar-primary', `${primaryHSL.h} ${primaryHSL.s}% ${primaryHSL.l}%`);
  }

  if (secondaryHex) {
    const secondaryHSL = hexToHSL(secondaryHex);
    if (secondaryHSL) {
      root.style.setProperty('--secondary', `${secondaryHSL.h} ${secondaryHSL.s}% ${secondaryHSL.l}%`);
    }
  }
}

/**
 * Convert hex color to HSL
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  if (hex.length !== 6) return null;

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Generate contrasting foreground color
 */
export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace(/^#/, '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
