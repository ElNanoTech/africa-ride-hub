import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface CountryCode {
  code: string;
  dial: string;
  flag: string;
  name: string;
  format: string;
  maxLength: number;
  minLength?: number;
}

const COUNTRY_CODES: CountryCode[] = [
  { code: 'CI', dial: '+225', flag: '🇨🇮', name: 'Côte d\'Ivoire', format: 'XX XX XX XX XX', maxLength: 10, minLength: 10 },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'États-Unis', format: 'XXX XXX XXXX', maxLength: 10 },
  { code: 'SN', dial: '+221', flag: '🇸🇳', name: 'Sénégal', format: 'XX XXX XX XX', maxLength: 9 },
  { code: 'ML', dial: '+223', flag: '🇲🇱', name: 'Mali', format: 'XX XX XX XX', maxLength: 8 },
  { code: 'BF', dial: '+226', flag: '🇧🇫', name: 'Burkina Faso', format: 'XX XX XX XX', maxLength: 8 },
  { code: 'GN', dial: '+224', flag: '🇬🇳', name: 'Guinée', format: 'XXX XX XX XX', maxLength: 9 },
  { code: 'TG', dial: '+228', flag: '🇹🇬', name: 'Togo', format: 'XX XX XX XX', maxLength: 8 },
  { code: 'BJ', dial: '+229', flag: '🇧🇯', name: 'Bénin', format: 'XX XX XX XX', maxLength: 8 },
  { code: 'NE', dial: '+227', flag: '🇳🇪', name: 'Niger', format: 'XX XX XX XX', maxLength: 8 },
  { code: 'CM', dial: '+237', flag: '🇨🇲', name: 'Cameroun', format: 'X XX XX XX XX', maxLength: 9 },
  { code: 'GA', dial: '+241', flag: '🇬🇦', name: 'Gabon', format: 'X XX XX XX', maxLength: 7 },
];

interface PhoneInputProps {
  value: string;
  onChange: (fullNumber: string, isValid: boolean) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultCountry?: string;
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  defaultCountry = 'CI',
}: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(
    COUNTRY_CODES.find((c) => c.code === defaultCountry) || COUNTRY_CODES[0]
  );
  const [localNumber, setLocalNumber] = useState('');
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (!value) {
      if (localNumber) setLocalNumber('');
      if (isValid) setIsValid(false);
      return;
    }

    const matchedCountry = COUNTRY_CODES.find((c) => value.startsWith(c.dial));
    const nextCountry = matchedCountry || selectedCountry;
    const nextLocalNumber = matchedCountry
      ? value.slice(matchedCountry.dial.length).replace(/\s/g, '')
      : value.replace(/[^\d]/g, '');

    if (matchedCountry && matchedCountry.code !== selectedCountry.code) {
      setSelectedCountry(matchedCountry);
    }

    if (nextLocalNumber !== localNumber) {
      setLocalNumber(nextLocalNumber);
    }

    const min = nextCountry.minLength ?? nextCountry.maxLength - 1;
    const nextIsValid = nextLocalNumber.length >= min && nextLocalNumber.length <= nextCountry.maxLength;
    if (nextIsValid !== isValid) {
      setIsValid(nextIsValid);
    }
  }, [value, localNumber, isValid, selectedCountry]);

  const formatDisplayNumber = (num: string): string => {
    const digits = num.replace(/\D/g, '');

    if (selectedCountry.code === 'CI') {
      return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    }
    if (selectedCountry.code === 'US') {
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  };

  const handleNumberChange = (inputValue: string) => {
    const digits = inputValue.replace(/\D/g, '');
    const limitedDigits = digits.slice(0, selectedCountry.maxLength);
    setLocalNumber(limitedDigits);

    const min = selectedCountry.minLength ?? selectedCountry.maxLength - 1;
    const valid = limitedDigits.length >= min && limitedDigits.length <= selectedCountry.maxLength;
    setIsValid(valid);

    const fullNumber = `${selectedCountry.dial}${limitedDigits}`;
    onChange(fullNumber, valid);
  };

  const handleCountryChange = (countryCode: string) => {
    const country = COUNTRY_CODES.find((c) => c.code === countryCode);
    if (country) {
      setSelectedCountry(country);
      const min = country.minLength ?? country.maxLength - 1;
      const valid = localNumber.length >= min && localNumber.length <= country.maxLength;
      setIsValid(valid);
      onChange(`${country.dial}${localNumber}`, valid);
    }
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <Select
        value={selectedCountry.code}
        onValueChange={handleCountryChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-[110px] shrink-0">
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <span>{selectedCountry.flag}</span>
              <span className="text-sm">{selectedCountry.dial}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              <span className="flex items-center gap-2">
                <span>{country.flag}</span>
                <span className="font-medium">{country.dial}</span>
                <span className="text-muted-foreground text-xs">{country.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative flex-1">
        <Input
          type="tel"
          inputMode="numeric"
          placeholder={placeholder || selectedCountry.format}
          value={formatDisplayNumber(localNumber)}
          onChange={(e) => handleNumberChange(e.target.value)}
          disabled={disabled}
          className={cn(
            'text-lg',
            localNumber.length > 0 && !isValid && 'border-destructive focus-visible:ring-destructive'
          )}
        />
        {localNumber.length > 0 && (
          <span className={cn('absolute right-3 top-1/2 -translate-y-1/2 text-xs', isValid ? 'text-foreground' : 'text-muted-foreground')}>
            {localNumber.length}/{selectedCountry.maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

export function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  if (!phone) {
    return { isValid: false, error: 'Numéro de téléphone requis' };
  }

  const country = COUNTRY_CODES.find((c) => phone.startsWith(c.dial));
  if (!country) {
    return { isValid: false, error: 'Code pays non reconnu' };
  }

  const localNumber = phone.slice(country.dial.length).replace(/\s/g, '');
  const min = country.minLength ?? country.maxLength - 1;
  if (localNumber.length < min) {
    return { isValid: false, error: `Numéro trop court (${localNumber.length}/${country.maxLength} chiffres)` };
  }
  if (localNumber.length > country.maxLength) {
    return { isValid: false, error: `Numéro trop long (${localNumber.length}/${country.maxLength} chiffres)` };
  }

  return { isValid: true };
}

export { COUNTRY_CODES };
export type { CountryCode };
